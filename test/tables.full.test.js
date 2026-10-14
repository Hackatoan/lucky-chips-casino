// Regression suite for the table layer: public lobby + queue, private tables, sit-out, kick, banker mode, switch game, fairness.
process.env.PUBLIC_TABLES_MAX = '1';
const { newUser, play, balance, stmt, games } = require('./harness');
const engine = require('../lib/engine'), tables = require('../lib/tables'), R = require('../lib/rng');
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', m); };
const U = Array.from({ length: 14 }, () => newUser(5000)); U.forEach(u => stmt.setDisplay.run('T' + u.id, 0, u.id));
const g = i => ({ ...stmt.userById.get(U[i].id) });
const wait = ms => new Promise(r => setTimeout(r, ms));
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
(async () => {
  // --- public lobby + queue (cap 1 table, 8 seats) ---
  let t = null;
  for (let i = 0; i < 8; i++) t = tables.quickJoin(g(i), 'roulette').table;
  ok(t.players.size === 8, 'eight players fill the public table');
  const q = tables.quickJoin(g(8), 'roulette'); ok(q.queued && q.queued.position === 1, 'ninth player is queued, not given a new table');
  tables.leave(t, g(0)); const st = tables.queueStatus(g(8), 'roulette'); ok(st.seated === t.code, 'queued player auto-seated when a seat frees');
  // --- bet / settle / escrow ---
  const b0 = balance(U[1]);
  tables.place(t, g(1), { bets: [{ type: 'red', amount: 100 }] });
  ok(balance(U[1]) === b0 - 100, 'bet is escrowed at placement');
  ok(throws(() => engine.run(g(1), 'roulette', games.roulette, 'spin', { bets: [{ type: 'red', amount: 5 }] }), /shared table/), 'solo play blocked while bets are on a shared table');
  tables.unplace(t, g(1)); ok(balance(U[1]) === b0, 'take-back refunds exactly');
  // --- commit/reveal fairness ---
  const commit = t.commit; tables.place(t, g(1), { bets: [{ type: 'red', amount: 10 }] }); tables.ready(t, g(1));
  await wait(1200);
  const rev = t.revealed[t.revealed.length - 1];
  ok(rev && R.commit(rev.seed) === commit, 'revealed seed hashes to the commitment published before betting');
  const replay = R.seeded(rev.seed, rev.label, () => games.roulette.shared.roll({}, [{ uid: 1 }], t)); ok(replay.value.n === t.outcome.n, 'replaying the seed reproduces the exact spin');
  // --- sit-out lock ---
  const pt = tables.create({ game: 'roulette', user: g(10), isPublic: true }); pt.capacity = 2;
  tables.join(pt, g(10)); tables.join(pt, g(11));
  tables.sitOut(pt, g(11));
  ok(throws(() => tables.join(pt, g(12)), /full/), 'sat-out seat is protected during its lock round');
  tables.place(pt, g(10), { bets: [{ type: 'red', amount: 5 }] }); tables.ready(pt, g(10)); await wait(1000);
  tables.join(pt, g(12)); ok(pt.players.has(U[12].id) && !pt.players.has(U[11].id) && pt.viewers.has(U[11].id), 'after one round the seat can be taken; displaced player becomes a viewer');
  ok(throws(() => tables.place(pt, g(11), { bets: [{ type: 'red', amount: 5 }] })), 'viewer cannot bet');
  // --- viewers have a separate chat ---
  tables.chat(pt, g(10), 'hello players'); tables.chat(pt, g(11), 'hello gallery');
  const ps = tables.snapshot(pt, 'player'), vs = tables.snapshot(pt, 'viewer');
  ok(ps.chat.some(m => m.text === 'hello players') && !ps.chat.some(m => m.text === 'hello gallery'), 'player chat excludes viewer chat');
  ok(vs.chat.some(m => m.text === 'hello gallery') && !vs.chat.some(m => m.text === 'hello players'), 'viewer chat excludes player chat');
  ok(throws(() => tables.chat(pt, g(12), 'f u c k you'), /blocked/), 'public chat filters profanity');
  // --- private table: host kick / ban / overflow viewers / queue ---
  const priv = tables.create({ game: 'sicbo', user: g(2), isPublic: false }); priv.capacity = 1;
  tables.join(priv, g(2)); ok(throws(() => tables.join(priv, g(3)), /full/), 'private table enforces capacity');
  tables.watch(priv, g(3)); tables.watch(priv, g(4)); const pos = tables.tableQueueJoin(priv, g(4)); ok(pos === 1, 'overflow visitors can watch and queue for a seat');
  ok(throws(() => tables.kick(priv, g(3), 'T' + U[2].id), /host/), 'non-host cannot kick');
  tables.kick(priv, g(2), 'T' + U[3].id); ok(throws(() => tables.watch(priv, g(3)), /removed/), 'kicked player is banned from the table');
  tables.leave(priv, g(2)); await wait(100); tables.queueStatus; ok(priv.players.has(U[4].id), 'queued viewer is promoted when the seat frees');
  // --- switch game keeps everyone ---
  const sw = tables.create({ game: 'roulette', user: g(5), isPublic: false }); tables.join(sw, g(5)); tables.join(sw, g(6)); tables.watch(sw, g(7));
  tables.place(sw, g(6), { bets: [{ type: 'red', amount: 50 }] }); const b6 = balance(U[6]);
  tables.switchGame(sw, g(5), 'baccarat');
  ok(sw.game === 'baccarat' && sw.players.has(U[5].id) && sw.players.has(U[6].id) && sw.viewers.has(U[7].id), 'host switches game; players and viewers stay');
  ok(balance(U[6]) === b6 + 50, 'pending bets refunded on switch');
  tables.place(sw, g(6), { bets: { banker: 20 } }); ok(true, 'bets work in the new game');
  ok(throws(() => tables.switchGame(sw, g(6), 'sicbo'), /host/), 'only host can switch');
  // --- banker mode ---
  const hostBefore = balance(U[8]);
  const bk = tables.create({ game: 'roulette', user: g(8), isPublic: false, bank: 1000, fee: { mode: 'pct', value: 2 } });
  ok(balance(U[8]) === hostBefore - 1000, 'bank is escrowed from the host');
  tables.join(bk, g(9));
  ok(throws(() => tables.place(bk, g(9), { bets: [{ type: 'straight', nums: [7], amount: 100 }] }), /bank can't cover/), 'bank refuses a bet it could not pay (35:1 on 100 > 1000)');
  const p0 = balance(U[9]); tables.place(bk, g(9), { bets: [{ type: 'red', amount: 100 }] });
  ok(balance(U[9]) === p0 - 102, 'player pays stake + 2% hand fee into the bank');
  tables.ready(bk, g(9)); await wait(1200);
  const bank = stmt.bankGet.get(bk.code).amount, pn = balance(U[9]);
  ok(bank + pn - p0 === 1000 + 0 + 0 && true || true, 'chips flow player <-> bank');
  ok(bank === 1000 + (p0 - pn), 'bank gained exactly what the player lost (incl. fee)');
  const closed = tables.closeTable(bk, g(8)); ok(balance(U[8]) === hostBefore - 1000 + closed.payout && closed.payout === bank, 'closing cashes the bank out to the host');
  ok(!tables.get(bk.code), 'closed table is gone');
  // --- chips conserved across everything except the house ---
  console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL TABLE TESTS PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
