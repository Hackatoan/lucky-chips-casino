'use strict';
const D = require('../lib/dice3');
const cfg = { id: 'crownanchor', name: 'Crown & Anchor', symbols: ['👑 Crown', '⚓ Anchor', '♥ Heart', '♦ Diamond', '♠ Spade', '♣ Club'], bets: ['single'], bestTip: 'Every symbol has the same 7.87% edge — pick whatever you like.' };
const g = D.make(cfg);
module.exports = {
  id: 'crownanchor', name: 'Crown & Anchor', icon: '⚓', category: 'dice', skill: 'none',
  blurb: 'The sailors\' dice game: bet on a symbol, three symbol-dice are thrown.',
  edge: '7.87%', shared: g.shared,
  meta: {
    rules: ['Six symbols (Crown, Anchor, Heart, Diamond, Spade, Club) sit on three dice. Bet on one or more symbols: you win 1:1 for every die that shows it.'],
    tips: ['It is Chuck-a-Luck in a nautical costume: 7.87% edge. No symbol is luckier than another.'],
  },
  view: g.view, actions: g.actions,
};
