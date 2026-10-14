'use strict';
const R = require('../lib/rng');
const an = require('../lib/an');
const { parallel } = require('../lib/sharedkit');
const MAX = 2000;
const comb = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };

// Multiplier curves: centre bins pay little, edge bins pay a lot. The top value is solved so the total return is exactly (1 - edge).
const RISK = { low: { lo: 0.5, e: 1.8 }, medium: { lo: 0.3, e: 2.6 }, high: { lo: 0.2, e: 3.6 } };
function table(rows, risk, edge) {
  const { lo, e } = RISK[risk];
  const probs = Array.from({ length: rows + 1 }, (_, k) => comb(rows, k) / 2 ** rows);
  const c = rows / 2, maxd = c;
  const s = probs.map((_, k) => Math.pow(Math.abs(k - c) / maxd, e));
  const S = probs.reduce((a, p, k) => a + p * s[k], 0);
  const target = 1 - edge / 100;
  const hi = lo + (target - lo) / S;
  return { probs, mults: s.map(x => lo + (hi - lo) * x) };
}
const actions = {
  drop(ctx, body) {
    const bet = ctx.int(body.bet, { min: 1, max: MAX, label: 'Bet' });
    const rows = [8, 12, 16].includes(Number(body.rows)) ? Number(body.rows) : 12;
    const risk = RISK[body.risk] ? body.risk : 'medium';
    const balls = ctx.int(body.balls || 1, { min: 1, max: 10, label: 'Balls' });
    const edge = ctx.opt('edge');
    const t = table(rows, risk, edge);
    ctx.debit(bet * balls);
    let ret = 0; const drops = [];
    for (let b = 0; b < balls; b++) {
      const path = Array.from({ length: rows }, () => R.int(2));
      const k = path.reduce((a, x) => a + x, 0);
      const m = t.mults[k]; const win = Math.floor(bet * m);
      ret += win; drops.push({ path, bin: k, m, win });
    }
    ctx.credit(ret);
    ctx.state = { last: { rows, risk, drops, bet } };
    ctx.end(`Plinko ${balls} ball(s)`);
    const net = ret - bet * balls;
    const ev = t.mults.reduce((a, m, k) => a + m * t.probs[k], 0);
    return an.review(balls > 1 ? `${balls} balls` : `×${drops[0].m.toFixed(2)}`, net, [
      ['Result', drops.map(d => (d.win >= bet ? an.good : an.bad)(`Landed in bin ${d.bin} — ×${d.m.toFixed(2)} → ${an.fmt(d.win)} (${(t.probs[d.bin] * 100).toFixed(d.bin === 0 || d.bin === rows ? 3 : 1)}% chance)`))],
      ['The maths', [
        an.info(`${rows} rows, ${risk} risk: average multiplier ${(ev * 100).toFixed(2)}% of the bet (edge ${edge}%). The same for every risk setting.`),
        an.tip('Risk only changes the shape: low risk pays ~0.5× in the middle and rarely more than 5×; high risk pays almost nothing in the middle and a jackpot on the edges. Same expected loss, different roller-coaster.'),
        an.tip('The ball path is a series of fair coin flips, so bins follow the binomial (bell-curve) distribution — the middle bins are hit far more often than the edges.'),
      ]],
    ]);
  },
};
const view = (st, { rules } = {}) => {
  const edge = rules ? rules.edge : 1;
  const tabs = {}; for (const rows of [8, 12, 16]) for (const risk of Object.keys(RISK)) tabs[rows + risk] = table(rows, risk, edge).mults.map(m => +m.toFixed(2));
  return { tables: tabs, edge, last: st && st.last ? st.last : null, maxBet: MAX };
};
module.exports = {
  id: 'plinko', name: 'Plinko', icon: '🔻', category: 'arcade', skill: 'none',
  blurb: 'Drop balls through the pegs. Choose rows and risk — the house edge is yours to set.',
  edge: 'You choose (default 1%)', shared: parallel(8),
  meta: {
    rules: ['Drop one or more balls from the top of a pegboard. At each peg the ball bounces left or right with equal chance. The bin it lands in sets your multiplier.', 'Pick the number of rows (8/12/16) and a risk level: low, medium or high.'],
    tips: ['All risk levels have the same expected return — high risk just concentrates it in rare big hits.', 'Dropping more balls at once smooths your results toward the average.'],
    options: [{ key: 'edge', label: 'House edge', type: 'range', min: 0, max: 10, step: 0.5, default: 1, unit: '%', help: 'Total multiplier curve is scaled so the average return is exactly 100% − edge.' }],
  },
  view, actions, _t: { table },
};
