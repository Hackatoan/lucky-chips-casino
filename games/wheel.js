'use strict';
const R = require('../lib/rng');
const an = require('../lib/an');
const { fail } = require('../lib/engine');
const MAX = 2000;
// Big Six / Money Wheel: 54 segments
const SEGS = [];
const add = (label, n, x) => { for (let i = 0; i < n; i++) SEGS.push({ label, x }); };
add('1', 24, 1); add('2', 15, 2); add('5', 7, 5); add('10', 4, 10); add('20', 2, 20); add('JOKER', 1, 40); add('FLAG', 1, 40);
// interleave so identical segments aren't clustered
const order = []; { const by = {}; SEGS.forEach((s, i) => (by[s.label] = by[s.label] || []).push(i)); let left = true; while (left) { left = false; for (const k of Object.keys(by)) if (by[k].length) { order.push(by[k].shift()); left = true; } } }
const WHEEL = order.map(i => SEGS[i]);
const BETS = {};
for (const l of ['1', '2', '5', '10', '20', 'JOKER', 'FLAG']) { const n = SEGS.filter(s => s.label === l).length, x = SEGS.find(s => s.label === l).x; BETS[l] = { name: l === 'JOKER' || l === 'FLAG' ? (l === 'JOKER' ? '🃏 Joker' : '🏁 Flag') : `$${l}`, pays: `${x}:1`, x, n, edge: +((1 - n * (x + 1) / 54)).toFixed(4) }; }

function place(ctx, body) {
  const raw = body.bets || {}; const bets = {}; let total = 0;
  for (const id of Object.keys(BETS)) if (raw[id]) { bets[id] = ctx.int(raw[id], { min: 1, max: MAX, label: BETS[id].name }); total += bets[id]; ctx.rate('wheel:' + id, 900, Math.max(0, 1 - (BETS[id].edge - 0.111) / 0.2)); }
  if (!total) fail('Place at least one bet first.');
  ctx.state = ctx.state || { history: [] };
  ctx.debit(total);
  return { bets, total, fee: ctx.lastFee };
}
function settle(ctx, placed, idx) {
  const seg = WHEEL[idx]; let ret = 0; const lines = [];
  for (const [id, a] of Object.entries(placed.bets)) {
    if (id === seg.label) { ret += a * (BETS[id].x + 1); lines.push(an.good(`${BETS[id].name} ${an.fmt(a)}: won ${BETS[id].x}:1 (+${an.fmt(a * BETS[id].x)})`)); }
    else lines.push(an.bad(`${BETS[id].name} ${an.fmt(a)}: lost · edge ${(BETS[id].edge * 100).toFixed(1)}%`));
  }
  ctx.credit(ret);
  ctx.state.history.push(seg.label); if (ctx.state.history.length > 25) ctx.state.history.shift();
  ctx.state.last = { idx, label: seg.label };
  ctx.end(`Wheel ${seg.label}`);
  return an.review(`Landed on ${seg.label}`, ret - placed.total, [['Your bets', lines], ['Odds', [
    an.info('The Money Wheel has 54 slots. The smallest payout ($1, 24 slots) has the lowest edge (11.1%); the big-prize slots have 22–26% edges.'),
    an.warn('This is one of the highest-edge games in a casino: the exciting 40:1 slots cost you ~24% in expectation.'),
    an.tip('If you play, the $1 bet loses the least on average — and the wheel has no memory.'),
  ]]]);
}
const roll = () => R.int(54);
module.exports = {
  id: 'wheel', name: 'Money Wheel', icon: '🎡', category: 'table', skill: 'none',
  blurb: 'Spin the big wheel: $1 to Joker/Flag at 40:1. Bet on any segment.',
  edge: '11–26%',
  shared: {
    mode: 'simul', max: 8, secs: 20, primary: ['spin'], resultMs: 6500, init: () => ({}),
    place(ctx, body) { const p = place(ctx, body); ctx.state.pending = p; ctx.out = { staked: p.total, count: Object.keys(p.bets).length }; },
    roll: () => ({ idx: roll() }),
    settle(ctx, o) { const p = ctx.state.pending; ctx.state.pending = null; return settle(ctx, p, o.idx); },
    exposure: p => Object.entries(p.bets).reduce((m, [id, a]) => Math.max(m, 0) + 0, 0) + Math.max(0, ...Object.entries(p.bets).map(([id, a]) => a * (BETS[id].x + 1))),
    describe: o => WHEEL[o.idx].label, outcomeView: o => ({ idx: o.idx, label: WHEEL[o.idx].label, text: 'Wheel: ' + WHEEL[o.idx].label, n: WHEEL[o.idx].label, c: WHEEL[o.idx].x >= 40 ? 'red' : 'green' }),
  },
  meta: {
    rules: ['Bet on the segment you think the wheel will stop on: $1 (pays 1:1), $2 (2:1), $5 (5:1), $10 (10:1), $20 (20:1), Joker or Flag (40:1).', 'The wheel has 54 slots: 24 × $1, 15 × $2, 7 × $5, 4 × $10, 2 × $20, 1 Joker, 1 Flag.'],
    tips: ['The $1 bet has the lowest house edge (11.1%). The 40:1 bets cost ~24%.'],
    bets: BETS,
  },
  view: st => ({ wheel: WHEEL.map(s => s.label), bets: BETS, history: st ? st.history : [], last: st && st.last ? st.last : null, pending: st && st.pending ? { staked: st.pending.total } : null, maxBet: MAX }),
  actions: { spin(ctx, body) { const p = place(ctx, body); return settle(ctx, p, roll()); } },
};
