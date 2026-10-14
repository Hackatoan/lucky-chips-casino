const L = require('../games/letitride')._t, C = require('../lib/cards'), R = require('../lib/rng');
// Perfect-play return: follow the exact-EV recommendation each time
const N = Number(process.argv[2] || 6000); let net = 0, bonusNet = 0, t0 = Date.now();
for (let i = 0; i < N; i++) {
  const d = C.newDeck(); R.shuffle(d);
  const h3 = d.slice(0, 3), comm = d.slice(3, 5);
  const e = L.ev3(h3); const ride1 = e.ride >= e.pull;
  const e2 = L.rideEV4(h3.concat(comm[0]), ride1 ? 3 : 2); const ride2 = e2.ride >= e2.pull;
  const k = L.kind5(h3.concat(comm)); const m = k ? L.PAYS[k] : -1;
  const riding = 1 + (ride1 ? 1 : 0) + (ride2 ? 1 : 0);
  net += riding * m; bonusNet += (L.bonus3(h3) ? L.BONUS[L.bonus3(h3)] : -1);
}
console.log('Let It Ride (exact-EV policy) edge per 3 units staked:', (-net / (3 * N) * 100).toFixed(2) + '% ± ~1.3%  (published 2.85%)  [', Math.round((Date.now() - t0) / N), 'ms/hand ]');
let bn = 0; const M = 1500000; for (let i = 0; i < M; i++) { const d = C.newDeck(); R.shuffle(d); const b = L.bonus3(d.slice(0, 3)); bn += b ? L.BONUS[b] : -1; }
console.log('3-card bonus edge:', (-bn / M * 100).toFixed(2) + '% (published 13.87% for this paytable)');
