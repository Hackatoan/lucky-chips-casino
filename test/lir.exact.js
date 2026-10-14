const L = require('../games/letitride')._t, C = require('../lib/cards'), R = require('../lib/rng');
// E[max(EV ride, EV pull)] over random 3-card starts == the exact expected net of optimal play (in units of 1 bet)
const N = Number(process.argv[2] || 12000); let s = 0, s2 = 0;
for (let i = 0; i < N; i++) { const d = C.newDeck(); R.shuffle(d); const e = L.ev3(d.slice(0, 3)); const v = Math.max(e.ride, e.pull); s += v; s2 += v * v; }
const mean = s / N, se = Math.sqrt((s2 / N - mean * mean) / N);
console.log(`optimal expected net/hand: ${mean.toFixed(4)} ± ${(se * 1.96).toFixed(4)} units  =>  edge ${(-mean / 3 * 100).toFixed(2)}% of the 3 initial bets (published ≈ 2.85%)`);
