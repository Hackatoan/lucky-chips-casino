'use strict';
const R = require('../lib/rng');
const an = require('../lib/an');
const { fail } = require('../lib/engine');
const { parallel } = require('../lib/sharedkit');
const MAX = 1000;

// ---- hypergeometric probabilities & generated paytables ----
const comb = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
const P = (n, h) => comb(n, h) * comb(80 - n, 20 - h) / comb(80, 20);
const MIN_HIT = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 4, 9: 4, 10: 5 };
const CAP = 10000;                                   // top prizes are capped like a real casino limit
const roundPay = v => (v < 10 ? Math.round(v * 10) / 10 : v < 100 ? Math.round(v * 2) / 2 : Math.round(v));
function buildTable(target) {
  const tbl = {};
  for (let n = 1; n <= 10; n++) {
    const hs = []; for (let h = MIN_HIT[n]; h <= n; h++) hs.push(h);
    // equal return share per paying hit count, except the jackpot (capped) which gives its leftovers to the others
    const top = hs[hs.length - 1];
    const topShare = Math.min(target / hs.length, CAP * P(n, top));
    const rest = hs.length > 1 ? (target - topShare) / (hs.length - 1) : 0;
    const raw = {}; for (const h of hs) raw[h] = (h === top && hs.length > 1 ? topShare : (hs.length === 1 ? target : rest)) / P(n, h);
    let best = null;
    for (let sc = 0.85; sc <= 1.15; sc += 0.0025) {            // search a scale factor that lands closest to the target return
      const pays = {}; let rtp = 0;
      for (const h of hs) { pays[h] = Math.min(CAP, Math.max(1, roundPay(raw[h] * sc))); rtp += P(n, h) * pays[h]; }
      const err = Math.abs(rtp - target);
      if (!best || err < best.err) best = { err, pays, rtp };
    }
    tbl[n] = { pays: best.pays, rtp: best.rtp };
  }
  return tbl;
}
const TABLES = { tight: buildTable(0.86), standard: buildTable(0.92), loose: buildTable(0.96) };

function view(st, { rules } = {}) {
  const key = (rules && rules.table) || 'standard';
  const t = TABLES[key];
  return { table: key, pays: Object.fromEntries(Object.entries(t).map(([n, x]) => [n, { pays: x.pays, rtp: x.rtp }])), maxBet: MAX, last: st && st.last ? st.last : null };
}
const actions = {
  play(ctx, body) {
    const bet = ctx.int(body.bet, { min: 1, max: MAX, label: 'Bet' });
    const picks = Array.isArray(body.picks) ? [...new Set(body.picks.map(Number))] : [];
    if (picks.length < 1 || picks.length > 10) fail('Pick between 1 and 10 numbers.');
    if (picks.some(n => !Number.isInteger(n) || n < 1 || n > 80)) fail('Numbers must be between 1 and 80.');
    const key = ctx.opt('table'), t = TABLES[key][picks.length];
    ctx.debit(bet);
    const drawn = []; const pool = Array.from({ length: 80 }, (_, i) => i + 1);
    for (let i = 0; i < 20; i++) { const j = R.int(pool.length); drawn.push(pool.splice(j, 1)[0]); }
    const hits = picks.filter(n => drawn.includes(n));
    const mult = t.pays[hits.length] || 0;
    const ret = bet * mult;
    ctx.credit(ret);
    ctx.state = { last: { picks, drawn, hits, mult } };
    ctx.end(`Keno ${hits.length}/${picks.length}`);
    const pHit = P(picks.length, hits.length);
    return an.review(`${hits.length} of ${picks.length} hit`, ret - bet, [
      ['Result', [(mult ? an.good : an.bad)(`${hits.length} of your ${picks.length} numbers were drawn${mult ? ` — pays ${mult}:1 (+${an.fmt(ret - bet)})` : ' — no payout'}.`),
        an.info(`The chance of exactly ${hits.length} hits with ${picks.length} spots is ${(pHit * 100).toFixed(pHit < 0.01 ? 3 : 1)}%.`)]],
      ['Odds & tips', [
        an.info(`This ${picks.length}-spot paytable returns ${(t.rtp * 100).toFixed(1)}% on average (${((1 - t.rtp) * 100).toFixed(1)}% house edge).`),
        an.tip('Quick Pick vs your "lucky numbers": all combinations are equally likely, no pattern helps. The only real choice is how many numbers to pick — more spots = bigger top prize but lower hit frequency.'),
        an.tip('Keno edge is usually 20–30% in real casinos. This table shows its exact return so you can compare it with other games.'),
      ]],
    ]);
  },
};
module.exports = {
  id: 'keno', name: 'Keno', icon: '🔢', category: 'arcade', skill: 'none',
  blurb: 'Pick 1–10 numbers out of 80. Twenty are drawn. Choose a tight, standard or loose paytable.',
  edge: '4–14% (your choice of table)', shared: parallel(8),
  meta: {
    rules: ['Pick 1 to 10 numbers from 1–80, then 20 numbers are drawn at random. The more of your picks that are drawn, the bigger the payout (see the paytable for your spot count).', 'Choose a paytable under Rules: Tight, Standard or Loose changes the house edge.'],
    tips: ['Every set of numbers has identical odds; "hot" and "cold" numbers are noise.', 'Fewer spots hit more often; more spots chase bigger jackpots.'],
    options: [{ key: 'table', label: 'Paytable', type: 'select', default: 'standard', choices: [
      { v: 'tight', label: 'Tight — about 86% return (14% edge)', edge: 14 }, { v: 'standard', label: 'Standard — about 92% return (8% edge)', edge: 8 }, { v: 'loose', label: 'Loose — about 96% return (4% edge)', edge: 4 }] }],
  },
  view, actions, _t: { TABLES, P },
};
