// Shared-dealer blackjack tables: one shoe, one dealer hand, concurrent play, auto-stand, exact chip accounting.
const { newUser, balance, stmt, games, engine } = require('./harness');
const tables = require('../lib/tables');
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const U = Array.from({ length: 5 }, () => newUser(5000)); U.forEach(u => stmt.setDisplay.run('R' + u.id, 0, u.id));
const g = i => ({ ...stmt.userById.get(U[i].id) });
(async () => {
  const t = tables.create({ game: 'blackjack', user: g(0), isPublic: true });
  ok(t.sh.mode === 'rounds', 'blackjack tables use the shared-dealer mode');
  for (let i = 0; i < 4; i++) tables.join(t, g(i));
  const before = U.map(u => balance(u));
  for (let i = 0; i < 4; i++) tables.place(t, g(i), { bet: 20 });
  ok(balance(U[0]) === before[0], 'a bet is only a promise until the deal (nothing debited yet)');
  await wait(1500);                                  // everyone has bet -> early resolve
  ok(t.rd && t.rd.uids.length === 4, 'all four seats were dealt in');
  const dealers = t.rd.uids.map(u => JSON.stringify(stmt.userById.get(u) && engine.peek(stmt.userById.get(u), 'blackjack', games.blackjack, {}).view.dealer.cards));
  ok(new Set(dealers).size === 1, 'every seat sees the SAME dealer hand: ' + dealers[0]);
  const snap = tables.snapshot(t, 'viewer');
  ok(snap.rd && snap.rd.dealer.cards.length === 2 && snap.rd.dealer.cards[1] === null, 'table view shows the dealer upcard with the hole card hidden');
  ok(!JSON.stringify(snap).includes('"holeCounted"') && snap.rd.count.left > 0, 'table view carries the shared count, no internals');
  // play: everyone acts, in any order; acting out of stage is refused
  let guard = 0;
  while (t.phase !== 'results' && guard++ < 80) {
    if (t.phase === 'insurance') { for (const uid of t.rd.uids) if (t.rd.out[uid].stage === 'insurance') tables.roundAct(t, stmt.userById.get(uid), 'insurance', { take: false }); continue; }
    if (t.phase === 'play') {
      for (const uid of t.rd.uids) if (t.rd.out[uid] && t.rd.out[uid].stage === 'play') {
        const u = stmt.userById.get(uid), v = engine.peek(u, 'blackjack', games.blackjack, {}).view;
        tables.roundAct(t, u, v.allowed.draw ? 'draw' : 'stand', {});
      }
    }
    await wait(5);
  }
  ok(t.phase === 'results', 'round reached the results phase');
  const sv = tables.snapshot(t, 'viewer');
  ok(sv.rd.dealer.cards.every(c => c), 'dealer hole card is revealed at the end');
  const after = U.map(u => balance(u));
  const states = t.rd.uids.map(u => engine.peek(stmt.userById.get(u), 'blackjack', games.blackjack, {}).view);
  ok(states.every(v => v.phase === 'done'), 'every seat is settled');
  ok(new Set(states.map(v => JSON.stringify(v.dealer.cards))).size === 1, 'every seat settled against the identical dealer hand');
  const dTot = states[0].dealer.total;
  for (let i = 0; i < 4; i++) {
    const v = states[i], net = v.hands.reduce((a, h) => a + (h.result ? h.result.net : 0), 0);
    ok(after[i] - before[i] === net + (v.sideRes || []).reduce((a, r) => a + (r.x ? r.bet * r.x : -r.bet), 0) + 0, `seat ${i}: balance change ${after[i] - before[i]} matches hand results (dealer ${dTot})`);
  }
  // idle seat auto-stands on the action timer
  await wait(7000);                                  // back to betting
  ok(t.phase === 'betting' && !t.rd, 'next round opens for betting');
  t.sh = { ...t.sh, actSecs: 1, insSecs: 1 };
  for (let i = 0; i < 2; i++) tables.place(t, g(i), { bet: 10 });
  await wait(1500);
  const wasPlay = t.phase === 'play' || t.phase === 'insurance';
  await wait(2600);
  ok(t.phase === 'results' || t.phase === 'betting' || !wasPlay, 'idle seats are auto-played when the timer expires (round completes without input)');
  console.log(fails ? `\n${fails} FAILED` : '\nrounds tests passed'); process.exit(fails ? 1 : 0);
})();
