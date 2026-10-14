'use strict';
// Texas Hold'em (no limit). Table-only: the betting lives in lib/tables.js + lib/poker.js. Chips stay in the wallet while the hand is
// played and are settled in one step at the end (committed chips out, winnings in) — so a crash mid-hand can never lose or mint chips.
const an = require('../lib/an');
const { fail } = require('../lib/engine');

const BLINDS = [{ sb: 5, bb: 10 }, { sb: 10, bb: 20 }, { sb: 25, bb: 50 }, { sb: 50, bb: 100 }];
const view = () => ({ phase: 'lobby', blinds: BLINDS, bots: { min: 1, max: 7 }, buyIn: { min: 20, max: 200, def: 100 } });
// a solo "action" makes no sense here: play happens at a table
const actions = {};

// called by the table (inside engine.run) once per player per hand
function settle(ctx, hand) {
  const { committed, payout, summary, lines } = hand;
  if (committed > 0) ctx.debit(committed);
  if (payout > 0) ctx.credit(payout);
  if (committed <= 0 && payout <= 0) return;
  const net = payout - committed;
  ctx.analysis = an.review(net > 0 ? `You won ${an.fmt(net)}` : net < 0 ? `You lost ${an.fmt(-net)}` : 'Hand over', net, [
    ['The hand', lines.map(l => an.info(l))],
    ['Money', [an.info(`You put ${an.fmt(committed)} into the pot and collected ${an.fmt(payout)}.`)]],
  ]);
  ctx.end(summary);
}

module.exports = {
  id: 'holdem', name: 'Texas Hold\'em', icon: '♠️', category: 'cards', skill: 'high',
  blurb: 'No-limit Hold\'em against other players — or practise against 1–7 bots. Your cards are only ever sent to you.',
  edge: 'Player vs player — no house edge', meta: {
    rules: [
      'Everyone gets two private cards; five community cards are dealt in stages (flop, turn, river). Make the best five-card hand from your two cards and the five on the board.',
      'Betting rounds: before the flop, after the flop, after the turn and after the river. On your turn you can fold, check (if nobody has bet), call, or raise. The big blind and small blind are forced bets that start the pot.',
      'No-limit: you can bet all your chips at any time ("all-in"). If you run out of chips in a hand, you can only win the part of the pot you matched — the rest forms a side pot for the players who still have chips.',
      'The hand needs at least two players. Your opponents\' cards are never shown unless they reach a showdown; hands that win because everyone else folded are never revealed.',
      'Practice tables let you pick how many bots join you (1–7). They use free demo chips, so practice never touches your real balance or leaderboards.',
    ],
    tips: [
      'Position matters: acting last is a big edge, so play fewer hands from the blinds and early seats and more from the button.',
      'Compare the price to the prize: if calling costs 20 to win 60 you need to win more than 25% of the time. The coach shows the maths.',
      'Don\'t chase small draws against big bets — and don\'t fold strong hands to small ones.',
    ],
    options: [],
  },
  view, actions, settle,
  shared: { mode: 'poker', max: 8, secs: 0, primary: [], init: () => ({}), blinds: BLINDS },
};
