// Shared-dealer tables for the other dealer games: random decisions, every round must finish and each seat's real balance change
// must equal the net the table reported (so no chip is created or lost). Usage: node rounds.games.test.js [game ...]
const { newUser, balance, stmt, games, engine } = require('./harness');
const tables = require('../lib/tables');
const GAMES = { war: { acts: ['war', 'war', 'surrender'], bet: () => ({ bet: [10, 20, 50][Math.floor(Math.random() * 3)], tie: Math.random() < .3 ? 5 : undefined }) },
  threecard: { acts: ['play', 'play', 'fold'], bet: () => ({ ante: [10, 20][Math.floor(Math.random() * 2)], sides: Math.random() < .3 ? { pairplus: 5 } : {} }) },
  letitride: { acts: ['ride', 'pull'], bet: () => ({ bet: [10, 20][Math.floor(Math.random() * 2)], bonus: Math.random() < .3 ? 5 : undefined }) } };
const pickG = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GAMES).filter(g => games[g] && games[g].shared.mode === 'rounds');
const U = Array.from({ length: 4 }, () => newUser(1e7)); U.forEach(u => stmt.setDisplay.run('G' + u.id, 0, u.id));
const g = i => ({ ...stmt.userById.get(U[i].id) });
const pick = a => a[Math.floor(Math.random() * a.length)];
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let bad = 0;
  for (const game of pickG) {
    const cfg = GAMES[game];
    const t = tables.create({ game, user: g(0), isPublic: true });
    for (let i = 0; i < 4; i++) tables.join(t, g(i));
    let rounds = 0, acted = 0;
    for (let r = 0; r < 60; r++) {
      const before = U.map(u => balance(u));
      for (let i = 0; i < 4; i++) tables.place(t, g(i), cfg.bet());
      await wait(650);
      let guard = 0;
      while (t.phase !== 'results' && guard++ < 600) {
        for (const u of U) {
          const o = t.rd && t.rd.out[u.id]; if (!o || o.stage !== 'play' || t.phase !== 'play') continue;
          const row = stmt.userById.get(u.id);
          const legal = engine.peek(row, game, games[game], {}).view.allowed;
          const opts = Object.keys(cfg.acts.reduce((a, x) => (a[x] = 1, a), {}));
          let act = pick(cfg.acts);
          try { tables.roundAct(t, row, act, {}); acted++; } catch (e) { for (const alt of opts) { try { tables.roundAct(t, row, alt, {}); acted++; break; } catch {} } }
        }
        await wait(2);
      }
      if (t.phase !== 'results') { bad++; console.log(game, 'round', r, 'stuck in', t.phase, JSON.stringify(t.rd && t.rd.out)); break; }
      rounds++;
      for (const [i, u] of U.entries()) {
        const p = t.players.get(u.id), delta = balance(u) - before[i];
        if (!p.last || p.last.net !== delta) { bad++; console.log(`${game} round ${r} seat ${i}: balance moved ${delta} but table says ${p.last && p.last.net}`); }
        const v = engine.peek(stmt.userById.get(u.id), game, games[game], {}).view;
        if (v.phase && !['done', 'idle'].includes(v.phase)) { bad++; console.log(game, 'seat', i, 'left in phase', v.phase); }
      }
      clearTimeout(t.next); tables._toBetting(t);
    }
    console.log(`${game}: ${rounds} rounds, ${acted} decisions, problems ${bad}`);
  }
  process.exit(bad ? 1 : 0);
})();
