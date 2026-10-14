'use strict';
const R = require('../lib/rng');
const an = require('../lib/an');
const { fail } = require('../lib/engine');

const MAX_BET = 2000;
const MAX_BETS = 60;
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const label = n => (n === 37 ? '00' : String(n));
const colorOf = n => (n === 0 || n === 37 ? 'green' : RED.has(n) ? 'red' : 'black');
const row = n => Math.ceil(n / 3);
const col = n => (n - 1) % 3;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const PAYS = { 1: 35, 2: 17, 3: 11, 4: 8, 5: 6, 6: 5 };   // numbers covered -> pays x:1 (4 = corner / first four)
const OUTSIDE = {
  red: { name: 'Red', nums: () => [...RED], x: 1 },
  black: { name: 'Black', nums: () => range(1, 36).filter(n => !RED.has(n)), x: 1 },
  odd: { name: 'Odd', nums: () => range(1, 36).filter(n => n % 2), x: 1 },
  even: { name: 'Even', nums: () => range(1, 36).filter(n => n % 2 === 0), x: 1 },
  low: { name: 'Low 1–18', nums: () => range(1, 18), x: 1 },
  high: { name: 'High 19–36', nums: () => range(19, 36), x: 1 },
};
const DOZEN = k => ({ name: `Dozen ${['1st (1–12)', '2nd (13–24)', '3rd (25–36)'][k - 1]}`, nums: range(12 * (k - 1) + 1, 12 * k), x: 2 });
const COLUMN = k => ({ name: `Column ${k}`, nums: range(1, 36).filter(n => n % 3 === (k % 3)), x: 2 });

// call bets (French "announced" bets): chips with their components
const CALLS = {
  voisins: { name: 'Voisins du Zéro (9 chips)', eu: true, parts: [['trio', [0, 2, 3], 2], ['split', [4, 7]], ['split', [12, 15]], ['split', [18, 21]], ['split', [19, 22]], ['split', [32, 35]], ['corner', [25, 26, 28, 29], 2]] },
  tiers: { name: 'Tiers du Cylindre (6 chips)', eu: true, parts: [['split', [5, 8]], ['split', [10, 11]], ['split', [13, 16]], ['split', [23, 24]], ['split', [27, 30]], ['split', [33, 36]]] },
  orphelins: { name: 'Orphelins (5 chips)', eu: true, parts: [['straight', [1]], ['split', [6, 9]], ['split', [14, 17]], ['split', [17, 20]], ['split', [31, 34]]] },
  jeuzero: { name: 'Jeu Zéro (4 chips)', eu: true, parts: [['split', [0, 3]], ['split', [12, 15]], ['split', [32, 35]], ['straight', [26]]] },
};

function validNums(type, nums, wheel) {
  const am = wheel === 'am';
  const pockets = am ? 37 : 36;     // highest valid pocket index (37 = 00)
  if (!Array.isArray(nums) || nums.some(n => !Number.isInteger(n) || n < 0 || n > (am ? 37 : 36))) return false;
  const s = [...nums].sort((a, b) => a - b);
  if (new Set(s).size !== s.length) return false;
  const inner = s.every(n => n >= 1 && n <= 36);
  switch (type) {
    case 'straight': return s.length === 1;
    case 'split': {
      if (s.length !== 2) return false;
      const [a, b] = s;
      if (inner) return (b - a === 1 && row(a) === row(b)) || b - a === 3;
      if (am) return (a === 0 && (b === 1 || b === 2 || b === 37)) || (a === 2 && b === 37) || (a === 3 && b === 37);
      return a === 0 && b >= 1 && b <= 3;
    }
    case 'street': return s.length === 3 && inner && s[0] % 3 === 1 && s[2] === s[0] + 2;
    case 'trio':
      if (am) return [[0, 1, 2], [0, 2, 37], [2, 3, 37]].some(t => t.join() === s.join());
      return [[0, 1, 2], [0, 2, 3]].some(t => t.join() === s.join());
    case 'corner': return s.length === 4 && inner && col(s[0]) < 2 && s[1] === s[0] + 1 && s[2] === s[0] + 3 && s[3] === s[0] + 4;
    case 'sixline': return s.length === 6 && inner && s[0] % 3 === 1 && s.every((n, i) => n === s[0] + i);
    case 'basket': return am ? s.join() === '0,1,2,3,37' : s.join() === '0,1,2,3';
  }
  return false;
}
function describeBet(b) {
  const L = b.nums.map(label).join('-');
  switch (b.type) {
    case 'straight': return `Straight ${L}`;
    case 'split': return `Split ${L}`;
    case 'street': return `Street ${L}`;
    case 'trio': return `Trio ${L}`;
    case 'corner': return `Corner ${L}`;
    case 'sixline': return `Six line ${b.nums[0]}–${b.nums[5]}`;
    case 'basket': return b.nums.length === 5 ? 'Five-number basket (0-00-1-2-3)' : 'First four (0-1-2-3)';
    default: return b.name || b.type;
  }
}

function normalize(ctx, raw, wheel) {
  if (!Array.isArray(raw) || !raw.length) fail('Place at least one bet first.');
  if (raw.length > MAX_BETS) fail(`At most ${MAX_BETS} bets per spin.`);
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') fail('Bad bet.');
    const amount = ctx.int(r.amount, { min: 1, max: MAX_BET, label: 'Bet' });
    const type = String(r.type);
    if (OUTSIDE[type]) { const o = OUTSIDE[type]; out.push({ type, name: o.name, nums: o.nums(), x: o.x, amount, even: true }); continue; }
    if (type === 'dozen' || type === 'column') {
      const k = r.k;
      if (![1, 2, 3].includes(k)) fail('Bad dozen/column.');
      const o = type === 'dozen' ? DOZEN(k) : COLUMN(k);
      out.push({ type, name: o.name, nums: o.nums, x: o.x, amount }); continue;
    }
    if (type === 'call') {
      const c = CALLS[r.name];
      if (!c) fail('Unknown call bet.');
      if (wheel === 'am') fail('Call bets use the French (European) wheel layout.');
      for (const [t, nums, chips] of c.parts) out.push({ type: t, nums, x: PAYS[nums.length], amount: amount * (chips || 1), fromCall: c.name });
      continue;
    }
    const nums = (r.nums || []).map(Number);
    if (!validNums(type, nums, wheel)) fail(`That isn't a valid ${type} bet — the numbers must be adjacent on the layout.`);
    let x = PAYS[nums.length];
    if (type === 'trio') x = 11;
    if (type === 'basket') x = nums.length === 5 ? 6 : 8;
    out.push({ type, nums: [...nums].sort((a, b) => a - b), x, amount });
  }
  return out;
}

function view(st, { rules } = {}) {
  const hist = st ? st.history : [];
  const counts = {};
  for (const n of hist) counts[n] = (counts[n] || 0) + 1;
  return {
    wheel: (rules && rules.wheel) || (st ? st.wheel : 'eu'), partage: rules ? rules.wheel === 'eu' && rules.partage === 'on' : (st ? st.partage : false),
    last: st && st.last ? st.last : null,
    history: hist.slice(-24).map(n => ({ n: label(n), c: colorOf(n) })),
    counts, total: hist.length,
    pending: st && st.pending ? { staked: st.pending.total } : null,
    maxBet: MAX_BET,
  };
}

// ---- round pieces: placeBets (validate + escrow) / roll (shared outcome) / settleBets (pay + review) ----
function placeBets(ctx, body) {
  const wheel = ctx.opt('wheel');
  const partage = wheel === 'eu' && ctx.opt('partage') === 'on';
  const bets = normalize(ctx, body.bets, wheel);
  const st = ctx.state || { history: [], wheel, partage };
  st.wheel = wheel; st.partage = partage;
  ctx.state = st;
  const total = bets.reduce((s, b) => s + b.amount, 0);
  ctx.debit(total);
  return { bets, total, wheel, partage, fee: ctx.lastFee };
}
function roll(wheel) { return R.int(wheel === 'am' ? 38 : 37); }

function settleBets(ctx, placed, n) {
  const { bets, total, wheel, partage } = placed;
  const st = ctx.state;
  const pockets = wheel === 'am' ? 38 : 37;
  st.history.push(n); if (st.history.length > 100) st.history.shift();
  st.last = { n: label(n), c: colorOf(n) };

  let returned = 0;
  const lines = [];
  let expected = 0;
  for (const b of bets) {
    const chance = b.nums.length / pockets;
    let ret = 0, note = '';
    let edge = 1 - chance * (b.x + 1);
    if (b.nums.includes(n)) ret = b.amount * (b.x + 1);
    else if (partage && b.even && n === 0) { ret = Math.floor(b.amount / 2); note = ' (La Partage: half back on zero)'; }
    if (partage && b.even) edge = 1 / 74;   // 1.35%: lose half the stake on the 1/37 zero
    expected += b.amount * edge;
    returned += ret;
    const net = ret - b.amount;
    const nm = b.fromCall ? `${describeBet(b)} [${b.fromCall.split(' (')[0]}]` : describeBet(b);
    const stats = `${(chance * 100).toFixed(1)}% to hit, pays ${b.x}:1`;
    lines.push((net > 0 ? an.good : net < 0 ? an.bad : an.info)(`${nm} — ${an.fmt(b.amount)} chips (${stats}): ${net > 0 ? 'won ' + an.fmt(net) : net < 0 ? (ret > 0 ? 'lost ' + an.fmt(net) : 'lost ' + an.fmt(b.amount)) : 'push'}${note}`));
  }
  ctx.credit(returned);
  const net = returned - total;

  const h = st.history;
  const tips = [];
  const colr = colorOf(n);
  let run = 1;
  for (let i = h.length - 2; i >= 0 && colorOf(h[i]) === colr && colr !== 'green'; i--) run++;
  if (run >= 3) tips.push(an.warn(`That's ${run} ${colr}s in a row. Tempting to bet on a change — but the wheel has no memory. Each spin is independent, and the chance of ${colr} next is exactly the same as ever (${wheel === 'am' ? '18/38' : '18/37'}). That belief is called the gambler's fallacy.`));
  if (n === 0 || n === 37) tips.push(an.info(`The ${label(n)} came up — that single green pocket is the whole source of the house edge. Without it, red/black would be a perfectly fair coin flip.`));
  const out = bets.filter(b => b.nums.length > 6).reduce((s, b) => s + b.amount, 0);
  tips.push(an.info(`Winning number: ${label(n)} ${colr}.`));
  const edgeTxt = wheel === 'am' ? '5.26% (American double-zero wheel — switch to the European wheel and it halves to 2.70%)'
    : partage ? '1.35% on even-money bets with La Partage (2.70% on everything else)' : '2.70%';
  const exp = [
    an.info(`Every bet on this wheel has the same edge: ${edgeTxt}${bets.some(b => b.type === 'basket') && wheel === 'am' ? ' — except the 5-number basket, which is the worst bet on the table at 7.89%' : ''}. Total staked ${an.fmt(total)}, expected loss ≈ ${expected.toFixed(expected < 10 ? 2 : 1)} chips.`),
    an.tip(`What changes between bets is variance, not value: straight-ups hit ${(100 / pockets).toFixed(1)}% of the time but pay 35:1, red/black hits ${(1800 / pockets).toFixed(1)}% and pays 1:1. Pick the volatility you can afford.`),
    an.tip('No betting system (Martingale, Fibonacci, D\'Alembert…) changes the expected value; they only reshape how you lose. Martingale also runs into the table limit and your bankroll long before it "always works".'),
  ];
  if (inside(bets) && out) tips.push(an.tip('You mixed inside and outside bets. Covering lots of numbers makes wins frequent but small — it does not beat the edge, and every extra chip carries the same expected loss.'));
  if (bets.some(b => ['sixline', 'street', 'corner', 'split'].includes(b.type))) tips.push(an.tip('Splits, streets, corners and six-lines are "inside" bets that let you cover several adjacent numbers with one chip. They pay less per hit, but the odds scale exactly, so the edge is unchanged.'));
  ctx.end(`Roulette ${label(n)} ${colr}: ${net >= 0 ? '+' : '−'}${Math.abs(net)}`);
  return an.review(`${label(n)} ${colr}`, net, [['Your bets', lines], ['Odds & expectation', exp], ['What happened', tips]]);
}

const actions = {
  spin(ctx, body) {
    const placed = placeBets(ctx, body);
    return settleBets(ctx, placed, roll(placed.wheel));
  },
};
function inside(bets) { return bets.some(b => b.nums.length <= 6); }

const meta = {
  rules: [
    'Place chips on the layout, then spin. A ball lands in one of 37 pockets (0–36) on the European wheel, or 38 (adding 00) on the American wheel.',
    'Inside bets: Straight (1 number) pays 35:1 · Split (2) 17:1 · Street (3 in a row) and Trio (with the zero) 11:1 · Corner (4) 8:1 · First Four 8:1 · Six-line (6) 5:1 · American five-number basket 6:1.',
    'Outside bets: Red/Black, Odd/Even, Low (1–18)/High (19–36) pay 1:1. Dozens and Columns pay 2:1. They all lose when the ball lands on zero.',
    'Call bets (European only) place several chips at once: Voisins du Zéro (9 chips around zero), Tiers du Cylindre (6), Orphelins (5), Jeu Zéro (4). You choose the chip size; the total is chip size × number of chips.',
    'Optional La Partage rule (European wheel): when the ball lands on 0, even-money bets lose only half. That cuts the edge on those bets to 1.35%.',
  ],
  tips: [
    'The European (single-zero) wheel has a 2.70% edge; the American wheel with 00 has 5.26%. Always pick single-zero if you have a choice.',
    'Every bet has the same edge (except the American 5-number basket at 7.89%). There is no "good" bet — only choices about how volatile you want your session to be.',
    'Past results do not predict the next spin. Hot/cold numbers and streaks are noise — we show them only so you can see how they fail to predict anything.',
    'With La Partage or En Prison rules, even-money bets drop to a 1.35% edge: the best roulette bet available.',
  ],
  options: [
    { key: 'wheel', label: 'Wheel', type: 'select', default: 'eu', choices: [
      { v: 'eu', label: 'European — single zero (2.70% edge)', edge: 2.70 },
      { v: 'am', label: 'American — 0 and 00 (5.26% edge)', edge: 5.26 }] },
    { key: 'partage', label: 'La Partage (European wheel)', type: 'select', default: 'off', choices: [
      { v: 'off', label: 'Off — zero takes everything', edge: 0 },
      { v: 'on', label: 'On — even-money bets lose half on zero (1.35% on those bets)', edge: -1.35 }] },
  ],
  edges: { eu: 0.027, am: 0.0526, partage: 0.0135 },
  maxBet: MAX_BET,
};

// ---- shared-table hooks (see lib/tables.js) ----
const shared = {
  mode: 'simul', max: 8, secs: 25, primary: ['spin'],
  init: () => ({}),
  place(ctx, body) {
    const placed = placeBets(ctx, body);
    ctx.state.pending = placed;
    ctx.out = { staked: placed.total, count: placed.bets.length, wheel: placed.wheel };
  },
  roll: (mem, players) => ({ n: roll(players.some(p => p.wheel === 'am') ? 'am' : 'eu') }),
  settle(ctx, outcome) {
    const placed = ctx.state.pending; ctx.state.pending = null;
    // American-wheel players at a European-rolled table would see a wrong pocket count; normalise
    const n = outcome.n;
    return settleBets(ctx, placed, n);
  },
  // the most the bank could have to pay out on one spin (exact: check every pocket)
  exposure(placed) {
    const pockets = placed.wheel === 'am' ? 38 : 37;
    let worst = 0;
    for (let n = 0; n < pockets; n++) {
      let ret = 0;
      for (const b of placed.bets) {
        if (b.nums.includes(n)) ret += b.amount * (b.x + 1);
        else if (placed.partage && b.even && n === 0) ret += Math.floor(b.amount / 2);
      }
      worst = Math.max(worst, ret);
    }
    return worst;
  },
  describe: o => `${label(o.n)} ${colorOf(o.n)}`,
  outcomeView: o => ({ n: label(o.n), c: colorOf(o.n) }),
};

module.exports = {
  shared,
  id: 'roulette', name: 'Roulette', icon: '🎡', category: 'table', skill: 'none',
  blurb: 'European & American wheels, every inside/outside bet, French call bets and La Partage.',
  edge: '2.70% (EU) · 5.26% (US)', meta, view, actions,
};
