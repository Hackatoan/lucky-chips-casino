'use strict';
const R = require('../lib/rng');
const an = require('../lib/an');
const { fail } = require('../lib/engine');
const { parallel } = require('../lib/sharedkit');
const MAX = 5000;

function chanceOf(dir, target) { return dir === 'under' ? target : 100 - target; }
// roll is 0.00 - 99.99; "under T" wins when roll < T, "over T" wins when roll > T
const mult = (edge, chance) => Math.floor(((100 - edge) / chance) * 10000) / 10000;

const actions = {
  roll(ctx, body) {
    const bet = ctx.int(body.bet, { min: 1, max: MAX, label: 'Bet' });
    const dir = body.dir === 'over' ? 'over' : 'under';
    const target = ctx.int(body.target, { min: 2, max: 98, label: 'Target' });
    const edge = ctx.opt('edge');
    const chance = chanceOf(dir, target);
    ctx.debit(bet);
    const roll = R.int(10000) / 100;
    const win = dir === 'under' ? roll < target : roll > target;
    const m = mult(edge, chance);
    const ret = win ? Math.floor(bet * m) : 0;
    ctx.credit(ret);
    const st = ctx.state || { history: [] }; ctx.state = st;
    st.history.push({ roll, win }); if (st.history.length > 25) st.history.shift();
    st.last = { roll, dir, target, win, m, chance };
    ctx.end(`Dice ${roll.toFixed(2)} ${dir} ${target}`);
    const ev = ((chance / 100) * m - 1) * 100;
    return an.review(`${roll.toFixed(2)}`, ret - bet, [
      ['Result', [(win ? an.good : an.bad)(`Rolled ${roll.toFixed(2)} — you needed ${dir} ${target} (${chance}% chance). ${win ? `Won ${m.toFixed(4)}× → +${an.fmt(ret - bet)}` : `Lost ${an.fmt(bet)}`}.`)]],
      ['The maths', [
        an.info(`Payout multiplier = (100 − house edge) ÷ win chance = (100 − ${edge}) ÷ ${chance} = ${m.toFixed(4)}×. Expected return on this bet: ${(100 + ev).toFixed(2)}% of the stake, whatever target you choose.`),
        an.tip('Changing the target never changes the expected value — only the volatility: a 5% shot pays ~19× but rarely hits, a 95% shot pays 1.04× and almost always wins small.'),
        an.tip('Payouts are rounded down to a whole chip, which adds a hair to the edge on small bets.'),
      ]],
    ]);
  },
};
const view = (st, { rules } = {}) => ({ edge: rules ? rules.edge : 1, history: st ? st.history : [], last: st && st.last ? st.last : null, maxBet: MAX });
module.exports = {
  id: 'dice', name: 'Dice Roll', icon: '🎯', category: 'dice', skill: 'none',
  blurb: 'Pick any win chance from 2% to 98%. Payout adjusts so the edge stays exactly where you set it.',
  edge: 'You choose (default 1%)', shared: parallel(8),
  meta: {
    rules: ['A number from 0.00 to 99.99 is rolled. Choose "Roll under" or "Roll over" a target. The smaller your chance, the bigger the payout.', 'Payout = (100 − house edge) ÷ chance. The house edge is a setting under Rules.'],
    tips: ['Every target has the same expected loss: the edge. Choose the volatility you enjoy.', 'Raise the edge setting to practice playing under tougher casino conditions.'],
    options: [{ key: 'edge', label: 'House edge', type: 'range', min: 0, max: 10, step: 0.5, default: 1, unit: '%', help: '0% is a perfectly fair game; real online dice sites charge ~1%.' }],
  },
  view, actions,
};
