// Exact: average the optimal EV over ALL C(52,3)=22,100 starting hands (no sampling error)
const L = require('../games/letitride')._t;
let s = 0, n = 0, rides = 0;
for (let a = 0; a < 50; a++) for (let b = a + 1; b < 51; b++) for (let c = b + 1; c < 52; c++) {
  const e = L.ev3([a, b, c]); s += Math.max(e.ride, e.pull); n++; if (e.ride >= e.pull) rides++;
}
const mean = s / n;
console.log(`hands ${n}  exact optimal expected net/hand = ${mean.toFixed(5)} units;  edge ${(-mean / 3 * 100).toFixed(3)}% of 3 initial bets;  ride-bet-1 on ${(rides / n * 100).toFixed(1)}% of starts`);
