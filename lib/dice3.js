'use strict';
// Shared three-dice engine for Sic Bo, Chuck-a-Luck and Crown & Anchor.
// Every payout, house edge and the banker's maximum exposure is computed by enumerating all 216 outcomes - nothing is hand-typed.
const R = require('./rng');
const an = require('./an');
const { fail } = require('./engine');

const OUTCOMES = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) OUTCOMES.push([a, b, c]);
const TOTAL_PAY = { 4: 60, 17: 60, 5: 30, 16: 30, 6: 17, 15: 17, 7: 12, 14: 12, 8: 8, 13: 8, 9: 6, 10: 6, 11: 6, 12: 6 };
const isTriple = d => d[0] === d[1] && d[1] === d[2];
const count = (d, n) => (d[0] === n) + (d[1] === n) + (d[2] === n);

// profit multiple (x:1) for a bet on a given roll; -1 = lose
function profit(bet, d) {
  switch (bet.type) {
    case 'small': { const t = d[0] + d[1] + d[2]; return !isTriple(d) && t >= 4 && t <= 10 ? 1 : -1; }
    case 'big': { const t = d[0] + d[1] + d[2]; return !isTriple(d) && t >= 11 && t <= 17 ? 1 : -1; }
    case 'single': { const k = count(d, bet.n); return k ? k : -1; }
    case 'total': return d[0] + d[1] + d[2] === bet.n ? TOTAL_PAY[bet.n] : -1;
    case 'double': return count(d, bet.n) >= 2 ? 10 : -1;
    case 'triple': return isTriple(d) && d[0] === bet.n ? 180 : -1;
    case 'anytriple': return isTriple(d) ? 30 : -1;
    case 'combo': return count(d, bet.a) && count(d, bet.b) ? 5 : -1;
  }
  return -1;
}
function edgeOf(bet) { let s = 0; for (const d of OUTCOMES) s += profit(bet, d); return -s / 216; }
const sym = (cfg, n) => (cfg.symbols ? cfg.symbols[n - 1] : String(n));

function describe(cfg, b) {
  switch (b.type) {
    case 'small': return 'Small (4–10)';
    case 'big': return 'Big (11–17)';
    case 'single': return cfg.symbols ? `${sym(cfg, b.n)}` : `Single ${b.n}`;
    case 'total': return `Total ${b.n}`;
    case 'double': return `Double ${b.n}s`;
    case 'triple': return `Triple ${b.n}s`;
    case 'anytriple': return 'Any triple';
    case 'combo': return `Combo ${b.a}-${b.b}`;
  }
}

function make(cfg) {
  const MAX = 2000;
  const allowed = new Set(cfg.bets);
  const catalog = [];
  const add = (bet, pays) => { catalog.push({ ...bet, name: describe(cfg, bet), pays, edge: +edgeOf(bet).toFixed(4) }); };
  if (allowed.has('small')) add({ type: 'small' }, '1:1 (triples lose)');
  if (allowed.has('big')) add({ type: 'big' }, '1:1 (triples lose)');
  if (allowed.has('single')) for (let n = 1; n <= 6; n++) add({ type: 'single', n }, '1:1 per matching die (2 dice 2:1, 3 dice 3:1)');
  if (allowed.has('total')) for (let n = 4; n <= 17; n++) add({ type: 'total', n }, `${TOTAL_PAY[n]}:1`);
  if (allowed.has('double')) for (let n = 1; n <= 6; n++) add({ type: 'double', n }, '10:1');
  if (allowed.has('triple')) for (let n = 1; n <= 6; n++) add({ type: 'triple', n }, '180:1');
  if (allowed.has('anytriple')) add({ type: 'anytriple' }, '30:1');
  if (allowed.has('combo')) for (let a = 1; a <= 6; a++) for (let b = a + 1; b <= 6; b++) add({ type: 'combo', a, b }, '5:1');
  const lookup = new Map(catalog.map(c => [key(c), c]));
  function key(b) { return `${b.type}|${b.n || ''}|${b.a || ''}|${b.b || ''}`; }
  const best = Math.min(...catalog.map(c => c.edge));

  function normalize(ctx, raw) {
    if (!Array.isArray(raw) || !raw.length) fail('Place at least one bet first.');
    if (raw.length > 40) fail('At most 40 bets per roll.');
    const out = [];
    for (const r of raw) {
      const bet = { type: String(r.type), n: r.n === undefined ? undefined : Number(r.n), a: r.a === undefined ? undefined : Number(r.a), b: r.b === undefined ? undefined : Number(r.b) };
      const def = lookup.get(key(bet));
      if (!def) fail('That bet isn\'t on this table.');
      out.push({ ...bet, amount: ctx.int(r.amount, { min: 1, max: MAX, label: def.name }), edge: def.edge, name: def.name });
    }
    return out;
  }
  function placeBets(ctx, body) {
    const bets = normalize(ctx, body.bets);
    const total = bets.reduce((s, b) => s + b.amount, 0);
    ctx.state = ctx.state || { history: [] };
    ctx.debit(total);
    for (const b of bets) ctx.rate(cfg.id + ':bet:' + b.type, 1000, Math.max(0, 1 - (b.edge - best) / 0.15));
    return { bets, total, fee: ctx.lastFee };
  }
  function roll() { return [R.die(), R.die(), R.die()]; }
  function exposure(placed) {
    let worst = 0;
    for (const d of OUTCOMES) {
      let ret = 0;
      for (const b of placed.bets) { const p = profit(b, d); if (p > 0) ret += b.amount * (p + 1); }
      if (ret > worst) worst = ret;
    }
    return worst;
  }
  function settleBets(ctx, placed, d) {
    const st = ctx.state;
    const t = d[0] + d[1] + d[2];
    let returned = 0;
    const lines = [];
    let expected = 0;
    for (const b of placed.bets) {
      const p = profit(b, d);
      expected += b.amount * b.edge;
      const ret = p > 0 ? b.amount * (p + 1) : 0;
      returned += ret;
      lines.push((p > 0 ? an.good : an.bad)(`${b.name} ${an.fmt(b.amount)}: ${p > 0 ? `won ${p}:1 (+${an.fmt(b.amount * p)})` : 'lost'} · house edge ${(b.edge * 100).toFixed(1)}%`));
    }
    ctx.credit(returned);
    st.history.push(t); if (st.history.length > 30) st.history.shift();
    st.last = { dice: d, total: t };
    const net = returned - placed.total;
    const tips = [
      an.info(`Dice: ${d.map(x => sym(cfg, x)).join(' · ')} — total ${t}${isTriple(d) ? ' (TRIPLE: Small/Big lose)' : ''}.`),
      an.info(`Expected loss on your bets this roll ≈ ${expected.toFixed(expected < 10 ? 2 : 1)} chips (average edge ${(expected / placed.total * 100).toFixed(1)}%).`),
    ];
    const worst = placed.bets.reduce((m, b) => (b.edge > m.edge ? b : m), placed.bets[0]);
    if (placed.bets.some(b => b.edge < 0.05)) tips.push(an.tip(`${cfg.bestTip}`));
    if (worst.edge > 0.1) tips.push(an.warn(`${worst.name} has a ${(worst.edge * 100).toFixed(1)}% house edge — one of the worst on the table. Its big payout hides how rarely it hits.`));
    tips.push(an.tip('Dice have no memory: a number that hasn\'t shown for 20 rolls is exactly as likely as any other on the next roll.'));
    ctx.end(`${cfg.name} ${d.join('-')}`);
    return an.review(`${d.join(' · ')} = ${t}`, net, [['Your bets', lines], ['Odds & tips', tips]]);
  }
  const outcomeView = o => ({ dice: o.dice, total: o.t, text: `${o.dice.join('-')} = ${o.t}`, n: String(o.t), c: isTriple(o.dice) ? 'red' : 'green' });
  const shared = {
    mode: 'simul', max: 8, secs: 22, primary: ['roll'], resultMs: 6500,
    init: () => ({}),
    place(ctx, body) { const placed = placeBets(ctx, body); ctx.state.pending = placed; ctx.out = { staked: placed.total, count: placed.bets.length }; },
    roll: () => { const dice = roll(); return { dice, t: dice[0] + dice[1] + dice[2] }; },
    settle(ctx, o) { const placed = ctx.state.pending; ctx.state.pending = null; return settleBets(ctx, placed, o.dice); },
    exposure,
    describe: o => `${o.dice.join('-')} = ${o.t}`,
    outcomeView,
  };
  const actions = { roll(ctx, body) { const placed = placeBets(ctx, body); const dice = roll(); return settleBets(ctx, placed, dice); } };
  const view = st => ({ catalog, symbols: cfg.symbols || null, history: st ? st.history : [], last: st && st.last ? st.last : null, pending: st && st.pending ? { staked: st.pending.total } : null, maxBet: MAX, totalPay: TOTAL_PAY });
  return { actions, shared, view, catalog, exposure };
}
module.exports = { make, profit, OUTCOMES, TOTAL_PAY, edgeOf };
