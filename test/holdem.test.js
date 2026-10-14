process.env.BOT_SPEED = '0.05'; process.env.PK_BETWEEN_MS = '500';
// Hold'em tables end-to-end: seating, min two players, private cards, betting, settlement, practice bots.
const { newUser, balance, stmt, games, engine } = require('./harness');
const tables = require('../lib/tables');
require('../lib/bots');
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const U = Array.from({ length: 4 }, () => newUser(20000)); U.forEach(u => stmt.setDisplay.run('H' + u.id, 0, u.id));
const g = i => ({ ...stmt.userById.get(U[i].id) });
const online = (t, i) => { t.players.get(U[i].id).online = 1; tables.pkSchedule(t, 300); };   // stands in for an open SSE stream
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
(async () => {
  const t = tables.create({ game: 'holdem', user: g(0), isPublic: false });
  tables.join(t, g(0), { buyin: 1000 }); online(t, 0);
  await wait(300);
  ok(t.phase === 'waiting' && !t.pk.hand, 'one player alone: no hand is dealt (needs at least two)');
  ok(tables.snapshot(t, 'player', U[0].id).pk.needPlayers, 'table tells the lone player it is waiting for another');
  tables.join(t, g(1), { buyin: 1000 }); online(t, 1);
  await wait(100); ok(t.phase === 'starting', 'second player sits → countdown to the first hand starts');
  await wait(900);
  const h = t.pk.hand; ok(h && !h.done && t.phase === 'hand', 'hand is dealt');
  // privacy: nobody's snapshot contains anyone else's hole cards
  const a = tables.snapshot(t, 'player', U[0].id), b = tables.snapshot(t, 'player', U[1].id), v = tables.snapshot(t, 'viewer', 999999);
  const holeA = h.players.find(p => p.id === U[0].id).hole, holeB = h.players.find(p => p.id === U[1].id).hole;
  const C = require('../lib/cards'), sA = JSON.stringify(a), sB = JSON.stringify(b), sV = JSON.stringify(v);
  ok(a.pk.you.hole.length === 2 && JSON.stringify(a.pk.you.hole) === JSON.stringify(C.strs(holeA)), 'you can see your own two cards');
  ok(!C.strs(holeB).some(c => sA.includes('"' + c + '"')) && !C.strs(holeA).some(c => sB.includes('"' + c + '"')), 'your opponent\'s cards are NOT in your snapshot (and vice versa)');
  ok(!C.strs(holeA).concat(C.strs(holeB)).some(c => sV.includes('"' + c + '"')), 'a spectator receives no hole cards at all');
  ok(a.pk.seats.find(s => s.name !== (a.pk.seats.find(x => x.cards.length && x.cards[0]) || {}).name || true) && a.pk.seats.filter(s => s.cards.length === 2 && s.cards[0] === null).length === 1, 'the opponent\'s seat shows two face-down cards');
  ok(throws(() => tables.pokerAct(t, g(h.toAct === 0 ? 1 : 0), 'fold'), /turn/), 'acting out of turn is refused');
  // play it out: always call/check
  const b0 = [balance(U[0]), balance(U[1])];
  let guard = 0;
  while (t.pk.hand && !t.pk.hand.done && guard++ < 60) { const i = t.pk.hand.toAct, uid = t.pk.hand.players[i].id, l = require('../lib/poker').legal(t.pk.hand, i); tables.pokerAct(t, stmt.userById.get(uid), l.check ? 'check' : 'call'); }
  ok(t.phase === 'between', 'hand finished → results phase');
  const net0 = balance(U[0]) - b0[0], net1 = balance(U[1]) - b0[1];
  ok(net0 + net1 === 0, `chips conserved between the players (${net0} / ${net1})`);
  const res = tables.snapshot(t, 'player', U[0].id).pk;
  ok(res.result && res.result.showdown, 'showdown happened and the result is published');
  ok(res.seats.every(s => s.cards.length === 2 && s.cards[0]), 'at showdown both hands are revealed');
  // practice table with bots uses demo chips and fills seats
  const real = balance(U[2]);
  const pt = tables.create({ game: 'holdem', user: g(2), practice: true });
  tables.join(pt, g(2), { buyin: 1000 }); online(pt, 2); tables.addPracticeBots(pt, 3);
  ok(pt.players.size === 4 && [...pt.players.values()].filter(p => p.bot).length === 3, 'practice table seats the human plus three bots');
  ok(pt.players.get(U[2].id).stack > 0, 'practice buy-in comes from demo chips');
  // the human plays a few hands (checking/calling); the bots act on their own
  const t0 = Date.now(); let hands = 0, lastNo = 0;
  while (Date.now() - t0 < 60000 && hands < 4) {
    await wait(120);
    const hnd = pt.pk.hand;
    if (hnd && !hnd.done && pt.phase === 'hand') { const hp = hnd.players[hnd.toAct]; if (hp.id === U[2].id) { const l = require('../lib/poker').legal(hnd, hnd.toAct); tables.pokerAct(pt, stmt.userById.get(U[2].id), l.check ? 'check' : 'call'); } }
    if (pt.pk.no > lastNo && pt.phase === 'between') { lastNo = pt.pk.no; hands++; }
  }
  ok(hands >= 4, `four practice hands completed with bots acting on their own (${hands})`);
  ok(balance(U[2]) === real, 'practice play never touches the real balance');
  tables.leave(pt, g(2)); await wait(200);
  console.log(fails ? `\n${fails} FAILED` : '\nholdem tests passed'); process.exit(fails ? 1 : 0);
})();
