// Stress: 150 rounds at a 4-seat shared-dealer table with random plays (hit/stand/double/split/surrender/insurance); chips must reconcile exactly.
const { newUser, balance, stmt, games, engine } = require('./harness');
const tables = require('../lib/tables');
const U = Array.from({ length: 4 }, () => newUser(1e7)); U.forEach(u => stmt.setDisplay.run('S' + u.id, 0, u.id));
const g = i => ({ ...stmt.userById.get(U[i].id) });
const pick = a => a[Math.floor(Math.random() * a.length)];
(async () => {
  const t = tables.create({ game: 'blackjack', user: g(0), isPublic: true });
  for (let i = 0; i < 4; i++) tables.join(t, g(i));
  let bad = 0, rounds = 0, ins = 0, splits = 0, bjs = 0;
  for (let r = 0; r < 150; r++) {
    const before = U.map(u => balance(u));
    const sides = r % 3 === 0 ? { pp: 5 } : {};
    for (let i = 0; i < 4; i++) tables.place(t, g(i), { bet: pick([10, 20, 50]), sides });
    const bets = U.map((u, i) => t.players.get(u.id).pendingBet);
    await new Promise(res => setTimeout(res, 700));
    let guard = 0, takenIns = U.map(() => 0);
    while (t.phase !== 'results' && guard++ < 400) {
      for (const [i, u] of U.entries()) {
        const o = t.rd && t.rd.out[u.id]; if (!o) continue;
        const row = stmt.userById.get(u.id);
        try {
          if (t.phase === 'insurance' && o.stage === 'insurance') { const take = Math.random() < .5; if (take) { takenIns[i] = 1; ins++; } tables.roundAct(t, row, 'insurance', { take }); }
          else if (t.phase === 'play' && o.stage === 'play') {
            const v = engine.peek(row, 'blackjack', games.blackjack, {}).view; const al = v.allowed;
            const acts = al.draw ? ['draw'] : Object.keys(al).filter(k => al[k]);
            const a = pick(acts); if (a === 'split') splits++;
            tables.roundAct(t, row, a, {});
          }
        } catch (e) { bad++; console.log('ERR', e.message); }
      }
      await new Promise(res => setImmediate(res));
    }
    if (t.phase !== 'results') { bad++; console.log('round', r, 'stuck in', t.phase); break; }
    rounds++;
    for (const [i, u] of U.entries()) {
      const v = engine.peek(stmt.userById.get(u.id), 'blackjack', games.blackjack, {}).view;
      if (v.phase !== 'done') { bad++; console.log('seat', i, 'not settled', v.phase); continue; }
      const main = v.hands.reduce((a, h) => a + h.result.net, 0), side = (v.sideRes || []).reduce((a, x) => a + (x.x ? x.bet * x.x : -x.bet), 0);
      const dBJ = v.dealer.cards.length === 2 && v.dealer.total === 21;
      const insNet = takenIns[i] ? (dBJ ? bets[i].bet : -bets[i].bet / 2) : 0;
      const delta = balance(u) - before[i];
      if (delta !== main + side + insNet) { bad++; console.log(`round ${r} seat ${i}: delta ${delta} != ${main}+${side}+${insNet}`); }
      if (v.hands.some(h => h.bj)) bjs++;
    }
    clearTimeout(t.next); tables._toBetting(t);
  }
  console.log(`rounds ${rounds}, insurance taken ${ins}, splits ${splits}, blackjacks ${bjs}, problems ${bad}`);
  process.exit(bad ? 1 : 0);
})();
