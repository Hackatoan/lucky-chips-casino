const vp = require('../games/videopoker')._t, C = require('../lib/cards'), R = require('../lib/rng');
for (const [key, N] of [['jacks-96', 1800], ['ddb-96', 1200], ['deuces-full', 700]]) {
  const V = vp.VARIANTS[key]; let sum = 0, sq = 0;
  for (let i = 0; i < N; i++) { const deck = C.newDeck(); R.shuffle(deck); const hand = deck.splice(0, 5); const m = Math.max(...vp.evAll(hand, deck, V)); sum += m; sq += m * m; }
  const mean = sum / N, se = Math.sqrt((sq / N - mean * mean) / N);
  console.log(key, 'avg best EV', mean.toFixed(4), '±', (se * 1.96).toFixed(4), '(95% CI) theory', V.rtp);
}
