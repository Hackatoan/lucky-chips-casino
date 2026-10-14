const { dealRound, sideMultiplier, BETS } = require('../games/baccarat')._t;
const N = 1500000; const holder = {};
const ids = ['pp', 'bp', 'either', 'perfect', 'dragonP', 'dragonB', 'lucky6', 'panda8', 'dragon7'];
const ret = Object.fromEntries(ids.map(i => [i, 0]));
for (let i = 0; i < N; i++) {
  const o = dealRound(holder);
  for (const id of ids) { const m = sideMultiplier(id, o, false); ret[id] += m === -1 ? 1 : m > 0 ? m + 1 : 0; }
}
for (const id of ids) console.log(id.padEnd(8), 'sim edge', ((1 - ret[id] / N) * 100).toFixed(2) + '%', '| listed', (BETS[id].edge * 100).toFixed(2) + '%');
