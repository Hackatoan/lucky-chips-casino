'use strict';
const R = require('../lib/rng');
const an = require('../lib/an');
const { fail } = require('../lib/engine');

const MAX = 2000;
const WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
const BETS = {
  under: { name: 'Under 7', pays: '1:1', edge: 1 / 6, desc: 'Two dice total 2–6. A seven loses.', win: t => t < 7, x: 1 },
  over: { name: 'Over 7', pays: '1:1', edge: 1 / 6, desc: 'Two dice total 8–12. A seven loses.', win: t => t > 7, x: 1 },
  seven: { name: 'Lucky 7', pays: '4:1', edge: 1 / 6, desc: 'Exactly seven.', win: t => t === 7, x: 4 },
};
for (const b of Object.values(BETS)) { let e = 0; for (let t = 2; t <= 12; t++) e += WAYS[t] / 36 * (b.win(t) ? b.x : -1); b.edge = +(-e).toFixed(4); }
function place(ctx, body) {
  const raw = body.bets || {};
  const bets = {}; let total = 0;
  for (const id of Object.keys(BETS)) if (raw[id]) { bets[id] = ctx.int(raw[id], { min: 1, max: MAX, label: BETS[id].name }); total += bets[id]; ctx.rate('sevenup:' + id, 900, 0.5); }
  if (!total) fail('Place at least one bet first.');
  ctx.state = ctx.state || { history: [] };
  ctx.debit(total);
  return { bets, total, fee: ctx.lastFee };
}
function settle(ctx, placed, d) {
  const t = d[0] + d[1];
  let ret = 0; const lines = [];
  for (const [id, a] of Object.entries(placed.bets)) {
    const b = BETS[id], w = b.win(t);
    if (w) { ret += a * (b.x + 1); lines.push(an.good(`${b.name} ${an.fmt(a)}: won ${b.x}:1 (+${an.fmt(a * b.x)})`)); }
    else lines.push(an.bad(`${b.name} ${an.fmt(a)}: lost`));
  }
  ctx.credit(ret);
  const st = ctx.state; st.history.push(t); if (st.history.length > 30) st.history.shift(); st.last = { dice: d, total: t };
  ctx.end(`Seven Up ${t}`);
  return an.review(`${d[0]} + ${d[1]} = ${t}`, ret - placed.total, [['Your bets', lines], ['Odds', [
    an.info(`A seven comes up 6 times in 36 (16.7%) — more than any other total — and it beats BOTH Under and Over. That's the entire house edge: 16.7% on every bet here.`),
    an.warn('Seven Up is one of the worst bets in a casino. Compare Craps\' Pass Line at 1.4% or Roulette at 2.7%.'),
  ]]]);
}
const roll = () => [R.die(), R.die()];
const view = st => ({ bets: BETS, history: st ? st.history : [], last: st && st.last ? st.last : null, pending: st && st.pending ? { staked: st.pending.total } : null, maxBet: MAX });
module.exports = {
  id: 'sevenup', name: 'Seven Up', icon: '7️⃣', category: 'dice', skill: 'none',
  blurb: 'Over, under or exactly seven? Simple — and a perfect lesson in why the casino loves a seven.',
  edge: '16.7%',
  shared: {
    mode: 'simul', max: 8, secs: 18, primary: ['roll'], resultMs: 5500, init: () => ({}),
    place(ctx, body) { const p = place(ctx, body); ctx.state.pending = p; ctx.out = { staked: p.total, count: Object.keys(p.bets).length }; },
    roll: () => { const dice = roll(); return { dice, t: dice[0] + dice[1] }; },
    settle(ctx, o) { const p = ctx.state.pending; ctx.state.pending = null; return settle(ctx, p, o.dice); },
    exposure: p => Object.entries(p.bets).reduce((m, [id, a]) => m + a * (BETS[id].x + 1), 0),
    describe: o => `${o.dice.join('+')} = ${o.t}`, outcomeView: o => ({ dice: o.dice, total: o.t, text: `${o.dice.join('+')} = ${o.t}`, n: String(o.t), c: o.t === 7 ? 'red' : 'green' }),
  },
  meta: {
    rules: ['Two dice are thrown. Bet that the total will be UNDER 7 (2–6), OVER 7 (8–12) or exactly 7.', 'Under and Over pay 1:1, Lucky 7 pays 4:1. A total of 7 makes Under and Over lose.'],
    tips: ['Every bet has a 16.7% house edge — treat it as a toy, not a strategy.'],
    bets: BETS,
  },
  view, actions: { roll(ctx, body) { const p = place(ctx, body); return settle(ctx, p, roll()); } },
};
