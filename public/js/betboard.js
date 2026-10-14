// Reusable chip-betting board: pick a chip value, click bets to stack chips, undo/clear/rebet/double.
import { h, fmt, chip, btn, store } from './ui.js';
import { sfx } from './sfx.js';

// rows: [{id, name, pays, edge, desc, step, group, cls}]   storeKey: for remembering chip + last bets
export function betBoard({ rows, storeKey, groups, onChange, cols = 3 }) {
  const amounts = {};
  const hist = [];
  let chipVal = store.get(storeKey + '.chip', 5);
  const el = h('div', { class: 'betboard' });
  const chipBar = h('div', { class: 'bp-chips', style: { justifyContent: 'center' } });
  const grid = h('div', { class: 'bb-grid', style: { '--cols': cols } });
  const totalEl = h('span', { class: 'badge gold' });
  const get = () => ({ ...amounts });
  const total = () => Object.values(amounts).reduce((a, b) => a + b, 0);
  const emit = () => { draw(); if (onChange) onChange(get()); };
  const add = (r, mult = 1) => {
    const step = r.step || 1;
    let a = chipVal * mult;
    if (step > 1) a = Math.max(step, Math.round(a / step) * step);
    amounts[r.id] = (amounts[r.id] || 0) + a; hist.push([r.id, a]); sfx.play('chip'); emit();
  };
  const drawChips = () => chipBar.replaceChildren(...[1, 5, 25, 100, 500].map(c => chip(c, { active: c === chipVal, small: true, onclick: () => { chipVal = c; store.set(storeKey + '.chip', c); sfx.play('click'); drawChips(); } })));
  function draw() {
    const mk = r => h('button', { type: 'button', class: 'bb-cell ' + (r.cls || '') + (amounts[r.id] ? ' has' : ''), title: `${r.name} — pays ${r.pays}` + (r.edge !== undefined ? ` · house edge ${(r.edge * 100).toFixed(1)}%` : '') + (r.desc ? '\n' + r.desc : ''), onclick: () => add(r),
      oncontextmenu: e => { e.preventDefault(); if (amounts[r.id]) { delete amounts[r.id]; sfx.play('click'); emit(); } } },
      h('span', { class: 'bb-name' }, r.name), h('span', { class: 'bb-pay' }, r.pays), r.edge !== undefined ? h('span', { class: 'bb-edge' + (r.edge > 0.08 ? ' hi' : '') }, (r.edge * 100).toFixed(1) + '%') : null,
      amounts[r.id] ? h('span', { class: 'stk' }, fmt(amounts[r.id])) : null);
    if (groups) grid.replaceChildren(...groups.flatMap(gr => [h('div', { class: 'bb-group' }, gr.label), ...rows.filter(r => r.group === gr.id).map(mk)]));
    else grid.replaceChildren(...rows.map(mk));
    totalEl.textContent = '🪙 Total bet: ' + fmt(total());
  }
  el.append(h('div', { class: 'small muted center' }, 'Chip value'), chipBar, grid,
    h('div', { class: 'row', style: { justifyContent: 'center', margin: '8px 0' } }, totalEl,
      btn('↶ Undo', 'xs', () => { const l = hist.pop(); if (!l) return; amounts[l[0]] -= l[1]; if (amounts[l[0]] <= 0) delete amounts[l[0]]; emit(); }),
      btn('Clear', 'xs', () => { for (const k of Object.keys(amounts)) delete amounts[k]; hist.length = 0; emit(); }),
      btn('Rebet', 'xs', () => { const last = store.get(storeKey + '.last', {}); for (const [k, v] of Object.entries(last)) if (rows.some(r => r.id === k)) amounts[k] = v; sfx.play('chips'); emit(); }),
      btn('2×', 'xs', () => { for (const k of Object.keys(amounts)) amounts[k] *= 2; emit(); })));
  drawChips(); draw();
  return { el, get, total, remember() { store.set(storeKey + '.last', get()); }, clear() { for (const k of Object.keys(amounts)) delete amounts[k]; hist.length = 0; emit(); }, set(o) { for (const k of Object.keys(amounts)) delete amounts[k]; Object.assign(amounts, o); emit(); } };
}
