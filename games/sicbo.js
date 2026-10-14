'use strict';
const D = require('../lib/dice3');
const cfg = { id: 'sicbo', name: 'Sic Bo', bets: ['small', 'big', 'single', 'total', 'double', 'triple', 'anytriple', 'combo'], bestTip: 'Small and Big are the cheapest bets (2.8% edge) — the rest cost 7–19%.' };
const g = D.make(cfg);
module.exports = {
  id: 'sicbo', name: 'Sic Bo', icon: '🎲', category: 'dice', skill: 'none',
  blurb: 'Three dice, every bet on the Asian layout: Small/Big, singles, totals, doubles, triples and combos.',
  edge: '2.78% (Small/Big) – 19%', shared: g.shared,
  meta: {
    rules: [
      'Three dice are rolled. Bet on what they show.',
      'Small (total 4–10) and Big (11–17) pay 1:1 but LOSE on any triple. Single numbers pay 1:1 / 2:1 / 3:1 for one / two / three matching dice. Totals pay 6:1 up to 60:1. Doubles pay 10:1, specific triples 180:1, any triple 30:1, and two-number combos pay 5:1.',
      'Every payout and house edge shown is computed by enumerating all 216 outcomes.',
    ],
    tips: ['Small/Big (2.78%) are by far the cheapest bets. The famous 180:1 triple bet has a ~16.2% edge.', 'Total 10 and 11 pay only 6:1 but hit most often — Small/Big still beat them.'],
  },
  view: g.view, actions: g.actions,
};
