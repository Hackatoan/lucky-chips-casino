'use strict';
const D = require('../lib/dice3');
const cfg = { id: 'chuckaluck', name: 'Chuck-a-Luck', bets: ['single', 'small', 'big', 'anytriple'], bestTip: 'Small/Big (2.78%) beat the number bets (7.87%).' };
const g = D.make(cfg);
module.exports = {
  id: 'chuckaluck', name: 'Chuck-a-Luck', icon: '🎰', category: 'dice', skill: 'none',
  blurb: 'The cage game: pick a number, three dice tumble. Pays 1:1 for every matching die.',
  edge: '7.87% (numbers)', shared: g.shared,
  meta: {
    rules: ['Pick a number 1–6 and three dice are rolled in a wire cage. You win 1:1 for each die that matches (two matches pay 2:1, three pay 3:1).', 'Added bets: Small, Big and Any Triple, exactly as in Sic Bo.'],
    tips: ['A number bet wins about 42% of rolls but has a 7.87% edge — three-of-a-kind and doubles mean you can win a lot, but you lose a bit more on average.', 'Small/Big have a lower 2.78% edge.'],
  },
  view: g.view, actions: g.actions,
};
