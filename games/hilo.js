'use strict';
const R = require('../lib/rng');
const C = require('../lib/cards');
const an = require('../lib/an');
const { fail } = require('../lib/engine');
const { parallel } = require('../lib/sharedkit');
const MAX = 2000, CAP = 100;
const rank = () => R.int(13);                 // 0..12 (2..A), infinite deck
const NAME = r => '23456789TJQKA'[r] === 'T' ? '10' : '23456789TJQKA'[r];
const cardStr = r => '23456789TJQKA'[r] + 'SHDC'[R.int(4)];

const probs = r => ({ higher: (12 - r) / 13, lower: r / 13 });         // equal card loses
function view(st, { rules } = {}) {
  const v = { maxBet: MAX, edge: rules ? rules.edge : 3 };
  if (!st) return { ...v, phase: 'idle' };
  v.phase = st.phase; v.bet = st.bet; v.pot = st.pot; v.streak = st.streak; v.card = st.cardStr; v.history = st.history;
  if (st.phase === 'play') {
    const p = probs(st.rank), e = (rules ? rules.edge : st.edge) / 100;
    v.options = { higher: { p: p.higher, m: p.higher > 0 ? (1 - e) / p.higher : 0 }, lower: { p: p.lower, m: p.lower > 0 ? (1 - e) / p.lower : 0 } };
    v.coach = { text: `Higher wins ${(p.higher * 100).toFixed(1)}% of the time, lower ${(p.lower * 100).toFixed(1)}% (a repeat of ${NAME(st.rank)} loses both). Every guess pays at ${((1 - st.edge / 100) * 100).toFixed(0)}% of fair odds, so each extra guess costs you ${st.edge}% of your pot on average. Cashing out is always the lowest-risk choice — continue only if you enjoy the volatility.` };
  }
  return v;
}
const actions = {
  start(ctx, body) {
    if (ctx.state && ctx.state.phase === 'play') fail('Cash out or finish the current streak first.');
    const bet = ctx.int(body.bet, { min: 1, max: MAX, label: 'Bet' });
    ctx.debit(bet);
    const r = rank();
    ctx.state = { phase: 'play', bet, pot: bet, streak: 0, rank: r, cardStr: cardStr(r), edge: ctx.opt('edge'), history: [] };
  },
  guess(ctx, body) {
    const st = ctx.state;
    if (!st || st.phase !== 'play') fail('Start a round first.');
    const dir = body.dir === 'lower' ? 'lower' : 'higher';
    const p = probs(st.rank)[dir];
    if (p <= 0) fail(`Can't guess ${dir} on ${NAME(st.rank)} — it's impossible.`);
    const next = rank();
    const win = dir === 'higher' ? next > st.rank : next < st.rank;
    const m = (1 - st.edge / 100) / p;
    st.history.push({ from: st.cardStr, dir, win });
    const cs = cardStr(next);
    if (win) {
      st.pot = Math.min(st.bet * CAP, Math.floor(st.pot * m));
      st.streak++; st.rank = next; st.cardStr = cs;
      if (st.pot >= st.bet * CAP) return cash(ctx, st, 'Pot cap reached');
      return;
    }
    st.cardStr = cs; st.rank = next;
    st.pot = 0; st.phase = 'done';
    ctx.end(`Hi-Lo bust after ${st.streak}`);
    return an.review('Wrong guess', -st.bet, [['Result', [an.bad(`${dir === 'higher' ? 'Higher' : 'Lower'} lost — the next card was ${NAME(next)}. Streak ended at ${st.streak}.`)]], ['The maths', [an.info(`That guess had a ${(p * 100).toFixed(1)}% chance of winning and paid ${m.toFixed(2)}×. Every guess keeps ${100 - st.edge}% of fair value, so a long streak is mostly luck.`), an.tip('The rule: cash out. Expected value of continuing is always (100 − edge)% of what you have.')]]]);
  },
  cashout(ctx) {
    const st = ctx.state;
    if (!st || st.phase !== 'play') fail('Nothing to cash out.');
    if (st.streak === 0) fail('Make at least one guess first (or the bet comes back as a push — just guess).');
    return cash(ctx, st, 'Cashed out');
  },
};
function cash(ctx, st, label) {
  ctx.credit(st.pot);
  st.phase = 'done';
  ctx.end(`Hi-Lo cashed ${st.pot}`);
  return an.review(label, st.pot - st.bet, [['Result', [an.good(`Cashed out ${an.fmt(st.pot)} after a streak of ${st.streak}.`)]], ['The maths', [an.info(`Your streak had a ${(Math.pow(1 - st.edge / 100, st.streak) * 100).toFixed(1)}% share of fair value left — each guess shaves ${st.edge}% off the pot's worth.`), an.tip('Cashing out early is the only decision that matters. The edge applies to every guess, so more guesses = more expected loss.')]]]);
}
module.exports = {
  id: 'hilo', name: 'Hi-Lo Streak', icon: '⬆️', category: 'arcade', skill: 'none',
  blurb: 'Higher or lower? Build a streak, cash out any time. Odds shown for every guess.',
  edge: 'You choose (default 3%)', shared: parallel(8),
  meta: {
    rules: ['A card is shown. Guess whether the next card will be higher or lower (ties lose). A correct guess multiplies your pot by (fair odds × (1 − house edge)). Cash out any time — a wrong guess loses everything.'],
    tips: ['Look at the probability: guessing "higher" on a 3 is ~85% to win but pays little; "higher" on a Queen pays more but loses more often. The edge is the same.'],
    options: [{ key: 'edge', label: 'House edge per guess', type: 'range', min: 0, max: 10, step: 0.5, default: 3, unit: '%', help: 'The percent of fair value kept by the house on each guess.' }],
  },
  view, actions,
  inProgress: st => !!st && st.phase === 'play',
};
