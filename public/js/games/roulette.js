// Roulette client: SVG wheel, full betting layout (inside, outside, splits, streets, corners, six-lines, trios, call bets).
import { h, clear, fmt, sgn, chip, CHIPS, btn, store, sleep } from '../ui.js';
import { sfx } from '../sfx.js';
import { animOn } from '../fx.js';

const EU = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const AM = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const color = n => (n === 0 || n === 37 ? 'green' : RED.has(n) ? 'red' : 'black');
const lab = n => (n === 37 ? '00' : String(n));
const MODES = [['straight', 'Straight', 1, '35:1'], ['split', 'Split', 2, '17:1'], ['street', 'Street', 3, '11:1'], ['corner', 'Corner', 4, '8:1'], ['sixline', 'Six line', 6, '5:1']];
const OUTSIDE = [['low', '1–18'], ['even', 'Even'], ['red', 'Red'], ['black', 'Black'], ['odd', 'Odd'], ['high', '19–36']];

function polar(cx, cy, r, deg) { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
function wheelSvg(order) {
  const N = order.length, step = 360 / N, ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 200 200');
  const mk = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text !== undefined) e.textContent = text; return e; };
  const g = mk('g', {});
  g.append(mk('circle', { cx: 100, cy: 100, r: 98, fill: '#5c3b1e' }));
  order.forEach((n, i) => {
    const a0 = i * step - step / 2, a1 = a0 + step;
    const [x0, y0] = polar(100, 100, 94, a0), [x1, y1] = polar(100, 100, 94, a1), [x2, y2] = polar(100, 100, 62, a1), [x3, y3] = polar(100, 100, 62, a0);
    g.append(mk('path', { d: `M${x0} ${y0} A94 94 0 0 1 ${x1} ${y1} L${x2} ${y2} A62 62 0 0 0 ${x3} ${y3} Z`, fill: color(n) === 'red' ? '#b3262a' : color(n) === 'black' ? '#161616' : '#17824f', stroke: '#d9b44a', 'stroke-width': .6 }));
    const [tx, ty] = polar(100, 100, 79, i * step);
    g.append(mk('text', { x: tx, y: ty, fill: '#fff', 'font-size': N > 37 ? 6.2 : 7, 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: `rotate(${i * step} ${tx} ${ty})` }, lab(n)));
  });
  g.append(mk('circle', { cx: 100, cy: 100, r: 58, fill: '#2a1c0d', stroke: '#d9b44a', 'stroke-width': 1.2 }));
  g.append(mk('circle', { cx: 100, cy: 100, r: 14, fill: '#d9b44a' }));
  svg.append(g);
  return svg;
}

export default {
  init(ctx) {
    const s = ctx._rl = { bets: [], last: store.get('rl.last', []), chip: store.get('rl.chip', 5), mode: 'straight', pick: null, rot: 0, order: null, wheelKey: '' };
    s.wheelBox = h('div', { class: 'rl-wheel-wrap' });
    s.result = h('div', { class: 'rl-result' });
    s.hist = h('div', { class: 'rl-hist' });
    s.board = h('div');
    s.betsList = h('div', { class: 'bets-list' });
    s.controls = h('div', { class: 'controls' });
    s.status = h('div', { class: 'center small gold' });
    ctx.stage.replaceChildren(
      h('div', { class: 'zone-title' }, 'European roulette — single zero'), s.wheelBox, s.hist, s.status, s.board, s.betsList, s.controls);
  },

  render(v, ctx) {
    const s = ctx._rl;
    const order = v.wheel === 'am' ? AM : EU;
    const key = v.wheel + (v.partage ? 'p' : '');
    s.v = v;
    if (s.wheelKey !== key) {
      s.wheelKey = key; s.order = order;
      const svg = wheelSvg(order);
      s.svg = svg; s.rot = 0;
      s.wheelBox.replaceChildren(h('div', { class: 'rl-pointer' }, '▼'), svg, s.result);
      ctx.stage.querySelector('.zone-title').textContent = (v.wheel === 'am' ? 'American roulette — 0 and 00' : 'European roulette — single zero') + (v.partage ? ' · La Partage' : '');
      s.bets = []; // wheel changed: layout differs
      buildBoard(ctx);
    }
    if (v.last && !s.result.textContent) showResult(s, v.last);
    clear(s.hist);
    v.history.forEach(x => s.hist.append(h('span', { class: x.c }, x.n)));
    drawBets(ctx);
    drawControls(ctx);
    drawCoach(ctx);
  },

  // shared-table / viewer animation
  async onResult(ctx, data) {
    const s = ctx._rl; if (!s || !s.svg) return;
    const label = String(data.outcome.n);
    await spinTo(s, ctx, label === '00' ? 37 : Number(label), data.outcome.c);
  },
  spectate(ctx, snap) {
    if (!ctx._rl) {
      this.init(ctx);
      ctx.stage.prepend(h('div', { class: 'spectator-banner' }, '👁 You\'re watching table ' + snap.code));
    }
    const s = ctx._rl;
    const wheel = snap.rules && snap.rules.wheel === 'am' ? 'am' : 'eu';
    if (s.wheelKey !== wheel) { s.wheelKey = wheel; s.order = wheel === 'am' ? AM : EU; s.svg = wheelSvg(s.order); s.wheelBox.replaceChildren(h('div', { class: 'rl-pointer' }, '▼'), s.svg, s.result); }
    clear(s.hist); snap.history.forEach(x => x && x.c && s.hist.append(h('span', { class: x.c }, x.n)));
    clear(s.board); clear(s.betsList); clear(s.controls);
    s.status.textContent = snap.phase === 'results' ? 'Round ' + (snap.round - 1) + ' complete' : 'Round ' + snap.round + ' — betting ' + (snap.deadline ? 'open' : 'waiting for first bet');
    if (snap.outcome && !s.result.textContent) showResult(s, snap.outcome);
  },
};

function showResult(s, o) { s.result.replaceChildren(h('b', { class: o.c, style: { background: o.c === 'red' ? '#b3262a' : o.c === 'green' ? '#17824f' : '#161616' } }, o.n)); }

async function spinTo(s, ctx, n, c) {
  const N = s.order.length, i = s.order.indexOf(n), step = 360 / N;
  s.result.replaceChildren();
  if (!animOn()) { s.svg.style.transform = `rotate(${-i * step}deg)`; showResult(s, { n: lab(n), c }); return; }
  const target = -(i * step) - 360 * 5;
  s.rot = target - (((s.rot % 360) + 360) % 360 === 0 ? 0 : 0);
  s.svg.style.transition = 'none'; s.svg.style.transform = `rotate(${s.base || 0}deg)`; void s.svg.getBoundingClientRect();
  s.svg.style.transition = 'transform 3.6s cubic-bezier(.12,.6,.1,1)';
  sfx.play('ball', 3400);
  s.svg.style.transform = `rotate(${target}deg)`;
  s.base = target % 360;
  await sleep(3700);
  showResult(s, { n: lab(n), c });
  const cell = ctx.stage.querySelector(`[data-n="${n}"]`); if (cell) { cell.classList.add('win-n'); setTimeout(() => cell.classList.remove('win-n'), 2600); }
}

// ---------------- betting layout ----------------
function buildBoard(ctx) {
  const s = ctx._rl, v = s.v, am = v.wheel === 'am';
  const cell = (n, extra = '') => h('div', { class: 'rl-cell ' + color(n) + ' ' + extra, dataset: { n }, onclick: () => clickNum(ctx, n) }, lab(n));
  const board = h('div', { class: 'rl-board' });
  const zeros = h('div', { style: { gridColumn: 1, gridRow: '1 / span 3', display: 'grid', gridTemplateRows: am ? '1fr 1fr' : '1fr', gap: '2px' } }, am ? [cell(0), cell(37)] : [cell(0)]);
  board.append(zeros);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) { const n = c * 3 + (3 - r); const e = cell(n); e.style.gridColumn = c + 2; e.style.gridRow = r + 1; board.append(e); }
  for (let r = 0; r < 3; r++) { const e = h('div', { class: 'rl-cell', style: { gridColumn: 14, gridRow: r + 1, background: '#0d4f3c', fontSize: '.7rem' }, onclick: () => addBet(ctx, { type: 'column', k: 3 - r, name: 'Column ' + (3 - r) }) }, '2:1'); board.append(e); }
  const dz = h('div', { class: 'rl-dz', style: { marginLeft: '54px', marginRight: '42px' } }, [1, 2, 3].map(k => h('div', { class: 'rl-cell', style: { background: '#0d4f3c' }, onclick: () => addBet(ctx, { type: 'dozen', k, name: `Dozen ${k}` }) }, ['1st 12', '2nd 12', '3rd 12'][k - 1])));
  const out = h('div', { class: 'rl-out', style: { marginLeft: '54px', marginRight: '42px' } }, OUTSIDE.map(([t, l]) => h('div', { class: 'rl-cell ' + (t === 'red' ? 'red' : t === 'black' ? 'black' : ''), style: t === 'red' || t === 'black' ? {} : { background: '#0d4f3c' }, onclick: () => addBet(ctx, { type: t, name: l }) }, l)));
  const mode = h('div', { class: 'row', style: { justifyContent: 'center', margin: '8px 0' } },
    MODES.map(([m, label, , pay]) => h('button', { type: 'button', class: 'pill' + (s.mode === m ? ' on' : ''), dataset: { mode: m }, title: `${label} pays ${pay}`, onclick: () => { s.mode = m; s.pick = null; mode.querySelectorAll('.pill').forEach(p => p.classList.toggle('on', p.dataset.mode === m)); sfx.play('click'); markSel(ctx); } }, label)),
    am ? btn('Basket 0-00-1-2-3 (6:1)', 'xs', () => addBet(ctx, { type: 'basket', nums: [0, 1, 2, 3, 37], name: 'Basket' })) : btn('First four (8:1)', 'xs', () => addBet(ctx, { type: 'basket', nums: [0, 1, 2, 3], name: 'First four' })),
    am ? [btn('Trio 0-1-2', 'xs', () => addBet(ctx, { type: 'trio', nums: [0, 1, 2], name: 'Trio' })), btn('Trio 00-2-3', 'xs', () => addBet(ctx, { type: 'trio', nums: [2, 3, 37], name: 'Trio' }))]
      : [btn('Trio 0-1-2', 'xs', () => addBet(ctx, { type: 'trio', nums: [0, 1, 2], name: 'Trio' })), btn('Trio 0-2-3', 'xs', () => addBet(ctx, { type: 'trio', nums: [0, 2, 3], name: 'Trio' }))]);
  const calls = am ? null : h('div', { class: 'row', style: { justifyContent: 'center', margin: '6px 0' } }, h('span', { class: 'muted small' }, 'Call bets:'),
    [['voisins', 'Voisins (9 chips)'], ['tiers', 'Tiers (6)'], ['orphelins', 'Orphelins (5)'], ['jeuzero', 'Jeu Zéro (4)']].map(([n, l]) => btn(l, 'xs', () => addBet(ctx, { type: 'call', name: n, label: l, amount: s.chip, single: true }))));
  clear(s.board);
  s.board.append(board, dz, out, mode, calls);
  markSel(ctx);
}
function markSel(ctx) { const s = ctx._rl; ctx.stage.querySelectorAll('.rl-cell[data-n]').forEach(c => c.classList.toggle('sel', s.pick !== null && s.pick.includes(Number(c.dataset.n)))); }

function clickNum(ctx, n) {
  const s = ctx._rl; if (ctx.readonly || ctx.sitting) return;
  const am = s.v.wheel === 'am';
  if (s.mode === 'straight') return addBet(ctx, { type: 'straight', nums: [n], name: 'Straight ' + lab(n) });
  if (s.mode === 'split') {
    if (!s.pick) { s.pick = [n]; sfx.play('click'); return markSel(ctx); }
    const [a, b] = [s.pick[0], n].sort((x, y) => x - y);
    s.pick = null; markSel(ctx);
    const ok = a !== b && ((a >= 1 && b <= 36 && ((b - a === 1 && Math.ceil(a / 3) === Math.ceil(b / 3)) || b - a === 3)) || (a === 0 && (am ? [1, 2, 37].includes(b) : b >= 1 && b <= 3)) || (am && b === 37 && [2, 3].includes(a)));
    if (!ok) return ctx.toast('Those two numbers aren\'t next to each other on the layout.', 'bad');
    return addBet(ctx, { type: 'split', nums: [a, b], name: `Split ${lab(a)}-${lab(b)}` });
  }
  if (n < 1 || n > 36) return ctx.toast('Use Straight/Split or the trio buttons for the zeros.', 'bad');
  const row = Math.floor((n - 1) / 3);
  if (s.mode === 'street') { const a = row * 3 + 1; return addBet(ctx, { type: 'street', nums: [a, a + 1, a + 2], name: `Street ${a}-${a + 2}` }); }
  if (s.mode === 'sixline') { const r = Math.min(row, 10); const a = r * 3 + 1; return addBet(ctx, { type: 'sixline', nums: [a, a + 1, a + 2, a + 3, a + 4, a + 5], name: `Six line ${a}-${a + 5}` }); }
  if (s.mode === 'corner') { const c = (n - 1) % 3; const r = Math.min(row, 10); const a = r * 3 + Math.min(c, 1) + 1; return addBet(ctx, { type: 'corner', nums: [a, a + 1, a + 3, a + 4], name: `Corner ${a},${a + 1},${a + 3},${a + 4}` }); }
}
function addBet(ctx, b) {
  const s = ctx._rl; if (ctx.readonly || ctx.sitting) return;
  const key = b.type + ':' + (b.nums ? b.nums.join(',') : b.k || b.name);
  const existing = s.bets.find(x => x.key === key);
  const amt = b.amount || s.chip;
  if (existing) existing.amount += amt; else s.bets.push({ ...b, key, amount: amt });
  s.history = (s.history || []); s.history.push({ key, amt });
  sfx.play('chip');
  drawBets(ctx); drawControls(ctx);
}

function drawBets(ctx) {
  const s = ctx._rl;
  ctx.stage.querySelectorAll('.rl-cell .stk').forEach(e => e.remove());
  for (const b of s.bets) if (b.type === 'straight') { const c = ctx.stage.querySelector(`.rl-cell[data-n="${b.nums[0]}"]`); if (c) c.append(h('span', { class: 'stk' }, fmt(b.amount))); }
  clear(s.betsList);
  if (!s.bets.length) { s.betsList.append(h('p', { class: 'center muted small' }, 'Click the layout to place chips. Pick a chip value below; use the bet type buttons for splits, streets, corners and more.')); return; }
  for (const b of s.bets) s.betsList.append(h('div', null, h('span', null, b.label || b.name), h('span', null, h('b', { class: 'gold' }, fmt(b.call ? b.amount : b.amount)), ' ', h('button', { class: 'x', title: 'Remove', onclick: () => { s.bets = s.bets.filter(x => x !== b); sfx.play('click'); drawBets(ctx); drawControls(ctx); } }, '✕'))));
}
const totalOf = b => (b.type === 'call' ? ({ voisins: 9, tiers: 6, orphelins: 5, jeuzero: 4 })[b.name] * b.amount : b.amount);

function drawControls(ctx) {
  const s = ctx._rl, v = s.v; clear(s.controls);
  if (ctx.readonly) return;
  const total = s.bets.reduce((a, b) => a + totalOf(b), 0);
  const chips = h('div', { class: 'bp-chips' }, [1, 5, 25, 100, 500].map(c => chip(c, { active: s.chip === c, onclick: () => { s.chip = c; store.set('rl.chip', c); sfx.play('click'); drawControls(ctx); } })));
  s.status.textContent = v.pending ? `✔ Bets placed (${fmt(v.pending.staked)} chips) — waiting for the round to finish…` : '';
  s.controls.append(h('div', { class: 'betpicker' }, h('div', { class: 'small muted' }, 'Chip value'), chips,
    h('div', { class: 'row', style: { justifyContent: 'center' } },
      btn('↶ Undo', 'xs', () => { const last = (s.history || []).pop(); if (!last) return; const b = s.bets.find(x => x.key === last.key); if (b) { b.amount -= last.amt; if (b.amount <= 0) s.bets = s.bets.filter(x => x !== b); } drawBets(ctx); drawControls(ctx); }),
      btn('Clear', 'xs', () => { s.bets = []; s.history = []; drawBets(ctx); drawControls(ctx); }),
      btn('Rebet', 'xs', () => { const last = store.get('rl.last', []); if (last.length) { s.bets = last.map(x => ({ ...x })); drawBets(ctx); drawControls(ctx); sfx.play('chips'); } }),
      btn('2×', 'xs', () => { s.bets.forEach(b => (b.amount *= 2)); drawBets(ctx); drawControls(ctx); }))),
    h('div', { class: 'actions', style: { width: '100%' } },
      h('div', { class: 'badge gold' }, '🪙 Total bet: ' + fmt(total)),
      btn(ctx.table && ctx.table.role === 'player' ? 'Place bets' : 'Spin', 'gold big', () => spin(ctx), { disabled: !s.bets.length || !!v.pending || ctx.sitting })));
}
async function spin(ctx) {
  const s = ctx._rl;
  const bets = s.bets.map(b => b.type === 'call' ? { type: 'call', name: b.name, amount: b.amount } : { type: b.type, nums: b.nums, k: b.k, amount: b.amount });
  store.set('rl.last', s.bets.map(b => ({ ...b })));
  s.result.replaceChildren();
  const solo = !(ctx.table && ctx.table.role === 'player');
  const r = await ctx.primary('spin', { bets });
  if (!r) return;
  if (solo && r.view && r.view.last) {
    s.bets = []; s.history = [];
    // animate first, then reveal the review (already rendered) and bets
    const l = r.view.last, n = l.n === '00' ? 37 : Number(l.n);
    await spinTo(s, ctx, n, l.c);
    drawBets(ctx);
  }
}
function drawCoach(ctx) {
  const v = ctx._rl.v;
  const edge = v.wheel === 'am' ? 5.26 : v.partage ? '1.35 (even-money) / 2.70' : 2.70;
  const total = v.total || 0;
  const hot = Object.entries(v.counts || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n === '37' ? '00' : n} (${c}×)`).join(', ');
  ctx.setCoach(h('div', { class: 'coach-content' },
    h('div', { class: 'coach-best' }, h('b', null, `House edge: ${edge}%`), h('p', { class: 'small', style: { margin: '4px 0 0' } }, 'Every bet on this wheel has the same expected loss. Inside bets (high payout) and outside bets (even money) differ only in volatility.')),
    h('p', { class: 'small' }, v.wheel === 'am' ? '⚠ The American wheel\'s extra 00 doubles the house edge to 5.26%. Switch to the European wheel under Rules → Table rules.' : '✔ Single-zero wheel: the best standard roulette odds. Turn on La Partage in Rules to cut the edge on even-money bets to 1.35%.'),
    h('div', { class: 'coach-opt' }, h('b', null, 'About that streak…'), `The last ${total || 0} spin${total === 1 ? '' : 's'} ${total === 1 ? 'has' : 'have'} no influence on the next one. Most frequent so far: ${hot || '—'}. That is just noise — the wheel has no memory (the gambler's fallacy).`),
    h('p', { class: 'muted small' }, 'Bet types: Straight 35:1 · Split 17:1 · Street 11:1 · Corner 8:1 · Six line 5:1 · Dozen/Column 2:1 · Red/Black/Odd/Even/High/Low 1:1.')));
}
