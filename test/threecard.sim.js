const tc = require('../games/threecard')._t, C = require('../lib/cards'), R = require('../lib/rng');
const N = 2000000; let ante = 0, pp = 0, six = 0, played = 0, wagered = 0;
for (let i = 0; i < N; i++) {
  const d = C.newDeck(); R.shuffle(d);
  const P = d.slice(0, 3), D = d.slice(3, 6);
  const ps = tc.score3(P), ds = tc.score3(D);
  // ante/play with Q64 strategy
  const play = ps.v >= tc.Q64;
  let ret = 0; wagered += 1 + (play ? 1 : 0);
  if (play) {
    played++;
    if (!tc.dealerQualifies(ds)) ret += 3; else if (ps.v > ds.v) ret += 4; else if (ps.v === ds.v) ret += 2;
    ret += (tc.ANTEBONUS[ps.cls] || 0) * 1;
  }
  ante += ret - 1 - (play ? 1 : 0);
  pp += ((tc.PAIRPLUS[ps.cls] || 0) ? (tc.PAIRPLUS[ps.cls] + 1) : 0) - 1;
  const sx = tc.sixCard(P.concat(D)); six += (sx.pay ? sx.pay + 1 : 0) - 1;
}
console.log('Ante/Play  edge per ANTE   :', (-ante / N * 100).toFixed(2) + '% (published 3.37%)  | played', (played / N * 100).toFixed(1) + '% of hands (published ~66%)');
console.log('Pair Plus  edge           :', (-pp / N * 100).toFixed(2) + '% (published 7.28%)');
console.log('6-Card Bonus edge         :', (-six / N * 100).toFixed(2) + '% (this paytable)');
