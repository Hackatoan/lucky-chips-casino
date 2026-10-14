// Money Wheel client.
import { h, clear, fmt, btn, sleep } from '../ui.js';
import { betBoard } from '../betboard.js';
import { sfx } from '../sfx.js';
import { animOn } from '../fx.js';
const COL = { '1': '#2f9e5a', '2': '#2c68b5', '5': '#a8322b', '10': '#7a3fb5', '20': '#d79a1e', JOKER: '#111', FLAG: '#e0483f' };
function polar(r, deg) { const a = (deg - 90) * Math.PI / 180; return [100 + r * Math.cos(a), 100 + r * Math.sin(a)]; }
function svgWheel(labels) {
  const ns = 'http://www.w3.org/2000/svg', N = labels.length, st = 360 / N;
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 200 200');
  const mk = (t, a, tx) => { const e = document.createElementNS(ns, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (tx !== undefined) e.textContent = tx; return e; };
  svg.append(mk('circle', { cx: 100, cy: 100, r: 99, fill: '#5c3b1e' }));
  labels.forEach((l, i) => { const a0 = i * st - st / 2, a1 = a0 + st; const [x0, y0] = polar(94, a0), [x1, y1] = polar(94, a1); svg.append(mk('path', { d: `M100 100 L${x0} ${y0} A94 94 0 0 1 ${x1} ${y1} Z`, fill: COL[l], stroke: '#fff3', 'stroke-width': .4 })); const [tx, ty] = polar(80, i * st); svg.append(mk('text', { x: tx, y: ty, fill: '#fff', 'font-size': l.length > 2 ? 4.4 : 6, 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: `rotate(${i * st} ${tx} ${ty})` }, l === 'JOKER' ? '🃏' : l === 'FLAG' ? '🏁' : l)); });
  svg.append(mk('circle', { cx: 100, cy: 100, r: 16, fill: '#d9b44a' }));
  return svg;
}
export default {
  init(ctx) {
    const s = ctx._wh = { rot: 0 };
    s.box = h('div', { class: 'rl-wheel-wrap' }); s.res = h('div', { class: 'center banner-result' }); s.hist = h('div', { class: 'rl-hist' }); s.controls = h('div', { class: 'controls' });
    s.board = betBoard({ storeKey: 'wheel', cols: 4, rows: Object.entries(ctx.game.meta.bets).map(([id, b]) => ({ id, name: b.name, pays: b.pays, edge: b.edge, cls: id === 'JOKER' || id === 'FLAG' ? 'red' : '' })) });
    ctx.stage.replaceChildren(h('div', { class: 'zone-title' }, 'Money Wheel — 54 slots'), s.box, s.res, s.hist, s.board.el, s.controls);
  },
  render(v, ctx) {
    const s = ctx._wh;
    if (!s.svg) { s.svg = svgWheel(v.wheel); s.box.replaceChildren(h('div', { class: 'rl-pointer' }, '▼'), s.svg); s.n = v.wheel.length; s.labels = v.wheel; }
    if (v.last && !s.seen) { s.seen = true; s.res.textContent = 'Last: ' + v.last.label; }
    clear(s.hist); (v.history || []).slice(-20).forEach(l => s.hist.append(h('span', { style: { background: COL[l] } }, l === 'JOKER' ? '🃏' : l === 'FLAG' ? '🏁' : l)));
    clear(s.controls); if (!ctx.readonly) s.controls.append(h('div', { class: 'actions', style: { width: '100%' } }, btn(ctx.table && ctx.table.role === 'player' ? 'Place bets' : 'Spin', 'gold big', () => spin(ctx), { disabled: !!v.pending || ctx.sitting })));
    ctx.setCoach(h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, '⚠ One of the highest-edge casino games'), h('p', { class: 'small', style: { margin: '4px 0 0' } }, '$1 (24 of 54 slots) has the lowest edge at 11.1%. The exciting 40:1 Joker and Flag cost ~24% in expectation.'))));
  },
  async onResult(ctx, data) { const s = ctx._wh; if (s && data.outcome && data.outcome.idx !== undefined) await to(s, data.outcome.idx, data.outcome.label); },
  spectate(ctx, snap) { if (!ctx._wh) { this.init(ctx); ctx._wh.board.el.remove(); ctx._wh.controls.remove(); ctx._wh.svg = svgWheel(Object.keys(ctx.game.meta.bets).length ? ctx.view.wheel : []); ctx._wh.box.replaceChildren(h('div', { class: 'rl-pointer' }, '▼'), ctx._wh.svg); ctx._wh.n = ctx.view.wheel.length; } const s = ctx._wh; if (snap.outcome && !s.seen) { s.seen = true; s.res.textContent = 'Last: ' + snap.outcome.label; } },
};
async function to(s, idx, label) {
  s.res.textContent = '';
  const st = 360 / s.n, target = -(idx * st) - 360 * 5;
  if (!animOn()) { s.svg.style.transform = `rotate(${-idx * st}deg)`; s.res.textContent = '🎡 ' + label; return; }
  s.svg.style.transition = 'none'; s.svg.style.transform = `rotate(${s.base || 0}deg)`; void s.svg.getBoundingClientRect();
  s.svg.style.transition = 'transform 4s cubic-bezier(.12,.6,.1,1)'; sfx.play('ball', 3800); s.svg.style.transform = `rotate(${target}deg)`; s.base = target % 360;
  await sleep(4100); s.res.textContent = '🎡 ' + label; sfx.play(label === 'JOKER' || label === 'FLAG' ? 'win' : 'chip', 2);
}
async function spin(ctx) {
  const s = ctx._wh, bets = s.board.get(); if (!Object.keys(bets).length) return ctx.toast('Place a bet first.', 'bad'); s.board.remember();
  const solo = !(ctx.table && ctx.table.role === 'player'); const r = await ctx.primary('spin', { bets });
  if (r && solo) { s.board.clear(); if (r.view.last) await to(s, r.view.last.idx, r.view.last.label); }
}
