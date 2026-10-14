// Plinko client: SVG pegboard with animated balls and the live multiplier row.
import { h, clear, fmt, btn, betPicker, sleep } from '../ui.js';
import { sfx } from '../sfx.js';
import { animOn } from '../fx.js';
const NS = 'http://www.w3.org/2000/svg';
export default {
  init(ctx) {
    const s = ctx._pl = { rows: 12, risk: 'medium', balls: 1 };
    s.bet = betPicker('plinko', { min: 1, max: 2000, def: 10 });
    s.board = h('div', { class: 'pl-board' }); s.mults = h('div', { class: 'pl-mults' }); s.sel = h('div', { class: 'row', style: { justifyContent: 'center' } }); s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(h('div', { class: 'zone-title' }, 'Plinko'), s.board, s.mults, s.sel, s.controls);
  },
  render(v, ctx) {
    const s = ctx._pl; s.v = v;
    drawBoard(s); drawMults(s, v);
    clear(s.sel);
    const mk = (label, vals, key) => h('div', { class: 'row' }, h('span', { class: 'muted small' }, label), ...vals.map(x => h('button', { class: 'pill' + (s[key] === x ? ' on' : ''), onclick: () => { s[key] = x; sfx.play('click'); ctx.mod.render(s.v, ctx); } }, String(x))));
    s.sel.append(mk('Rows', [8, 12, 16], 'rows'), mk('Risk', ['low', 'medium', 'high'], 'risk'), mk('Balls', [1, 3, 5], 'balls'));
    clear(s.controls); if (!ctx.readonly) s.controls.append(s.bet.el, h('div', { class: 'actions', style: { width: '100%' } }, btn('Drop' + (s.balls > 1 ? ` ${s.balls} balls (${fmt(s.bet.get() * s.balls)})` : ''), 'gold big', () => drop(ctx))));
    ctx.setCoach(h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, `Same expected return (${(100 - v.edge)}%) at every risk level`), h('p', { class: 'small', style: { margin: '4px 0 0' } }, 'The ball makes fair left/right choices at each peg, so landing bins follow a bell curve. Risk only reshapes payouts: low risk pays ~0.5× in the middle; high risk pays almost nothing there and a jackpot on the edges.'))));
  },
};
function drawBoard(s) {
  const rows = s.rows, W = 400, top = 16, gx = (W - 40) / rows, gy = rows <= 8 ? 24 : rows <= 12 ? 20 : 17, H = top + rows * gy + 8;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  for (let r = 0; r < rows; r++) for (let c = 0; c <= r + 1; c++) { const x = W / 2 + (c - (r + 1) / 2) * gx, y = top + r * gy; const p = document.createElementNS(NS, 'circle'); p.setAttribute('cx', x); p.setAttribute('cy', y); p.setAttribute('r', 2.6); p.setAttribute('fill', '#cfe8dc'); svg.append(p); }
  s.svg = svg; s.geo = { W, top, gx, gy, rows }; s.board.replaceChildren(svg);
}
function drawMults(s, v) {
  const t = v.tables[s.rows + s.risk]; clear(s.mults); const max = Math.max(...t);
  t.forEach((m, k) => s.mults.append(h('div', { class: 'pl-bin', dataset: { k }, style: { background: `hsl(${Math.max(0, 140 - 140 * (m / max) ** .5)}, 60%, 32%)` } }, m >= 100 ? Math.round(m) : m)));
}
async function ball(s, path) {
  const g = s.geo, c = document.createElementNS(NS, 'circle'); c.setAttribute('r', 5); c.setAttribute('fill', '#f2c14e'); c.setAttribute('cx', g.W / 2); c.setAttribute('cy', 6); s.svg.append(c);
  let k = 0; const xy = r => [g.W / 2 + (k - (r + 1) / 2 + 0.5 - 0.5) * g.gx, g.top + r * g.gy];
  for (let r = 0; r < path.length; r++) { k += path[r]; const x = g.W / 2 + (k - (r + 1) / 2) * g.gx + 0, y = g.top + (r + 1) * g.gy - g.gy * 0.4; c.style.transition = 'cx .11s linear, cy .11s linear'; c.setAttribute('cx', x); c.setAttribute('cy', y); if (animOn()) await sleep(115); sfx.play('tick'); }
  c.setAttribute('cy', g.top + g.rows * g.gy + 6); await sleep(animOn() ? 120 : 0); c.remove();
}
async function drop(ctx) {
  const s = ctx._pl;
  const r = await ctx.call('drop', { bet: s.bet.get(), rows: s.rows, risk: s.risk, balls: s.balls });
  if (!r) return;
  const drops = r.view.last.drops;
  await Promise.all(drops.map(async (d, i) => { await sleep(i * 220); await ball(s, d.path); const bin = s.mults.querySelector(`[data-k="${d.bin}"]`); if (bin) { bin.classList.add('flash'); setTimeout(() => bin.classList.remove('flash'), 900); } sfx.play(d.win >= r.view.last.bet ? 'coin' : 'chip'); }));
}
