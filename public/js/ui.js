// DOM helpers: hyperscript `h`, cards, chips, bet controls, toasts, modals. Never uses innerHTML for dynamic text.
import { sfx } from './sfx.js';

// Defensive: the native DOM methods turn a null/undefined/false child into the literal text "null". Conditional children are
// everywhere in this UI (`cond ? node : null`), so make every append-style method skip them (and flatten nested arrays).
for (const m of ['append', 'prepend', 'replaceChildren', 'before', 'after']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false)); };
}
import { state, maxAffordable } from './api.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
export const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const fmt = n => Math.round(n).toLocaleString('en-US');
export const sgn = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));
export const $ = (sel, root = document) => root.querySelector(sel);

// ---------- cards ----------
const SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
export function parseCard(s) { const r = s[0] === 'T' ? '10' : s[0]; return { r, s: s[1], sym: SYM[s[1]], red: s[1] === 'H' || s[1] === 'D' }; }
export function card(str, o = {}) {
  const cls = ['card'];
  if (o.small) cls.push('small');
  if (o.delay !== undefined) cls.push('dealt');
  if (o.cls) cls.push(o.cls);
  const style = o.delay !== undefined ? { animationDelay: o.delay + 'ms' } : undefined;
  if (!str) return h('div', { class: cls.concat('back').join(' '), style }, h('span'));
  const c = parseCard(str);
  cls.push(c.red ? 'red' : 'black');
  if (o.hl) cls.push('hl');
  return h('div', { class: cls.join(' '), style, 'aria-label': `${c.r} of ${c.s}` },
    h('span', { class: 'cr' }, c.r, h('i', null, c.sym)), h('span', { class: 'cs' }, c.sym));
}
// o.from: only cards at index >= from get the deal-in animation (so re-renders don't replay it)
export function cardsRow(list, o = {}) {
  const from = o.from === undefined ? 0 : o.from;
  return h('div', { class: 'cards' }, list.map((c, i) => card(c, { ...o, delay: o.animate === false || i < from ? undefined : (o.base || 0) + (i - from) * 110 })));
}

// ---------- dice ----------
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export function die(n, o = {}) {
  const el = h('div', { class: 'die' + (o.small ? ' small' : '') + (o.roll ? ' rolling' : ''), 'aria-label': 'die showing ' + n });
  for (let i = 0; i < 9; i++) el.append(h('i', { class: PIPS[n] && PIPS[n].includes(i) ? 'pip' : '' }));
  return el;
}

// ---------- chips ----------
export const CHIPS = [1, 5, 25, 100, 500, 1000];
export const chipColor = v => ({ 1: '#e8e8e8', 5: '#d63a3a', 25: '#2f9e5a', 100: '#222', 500: '#7a3fb5', 1000: '#e6a817' })[v] || '#999';
export function chip(v, o = {}) {
  return h('button', {
    type: 'button', class: 'chip' + (o.active ? ' active' : '') + (o.small ? ' small' : ''), style: { '--c': chipColor(v) },
    title: o.title || `${fmt(v)} chips`, onclick: o.onclick,
  }, h('span', null, v >= 1000 ? v / 1000 + 'k' : v));
}

// ---------- toast / modal ----------
let toastBox;
export function toast(msg, kind = 'info', ms = 3600) {
  if (!toastBox) { toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastBox); }
  const t = h('div', { class: 'toast ' + kind }, msg);
  toastBox.append(t);
  if (kind === 'bad') sfx.play('error');
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}
export function modal(title, body, { wide, onClose } = {}) {
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); if (onClose) onClose(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) close(); } },
    h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'x', type: 'button', onclick: close, 'aria-label': 'Close' }, '✕')),
      h('div', { class: 'modal-body' }, body)));
  document.addEventListener('keydown', esc);
  document.body.append(back);
  return { close, el: back };
}

// ---------- bet controls ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('lc.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lc.' + k, JSON.stringify(v)); } catch {} },
};
export { store };

// A single-amount bet picker: [-] 25 [+], chip buttons, Min / ½ / 2× / Max.
export function betPicker(key, { min = 1, max = 5000, step = 1, label = 'Bet', def } = {}) {
  let value = Math.max(min, Math.min(max, store.get('bet.' + key, def || Math.max(min, 10))));
  const listeners = new Set();
  const input = h('input', { type: 'number', inputmode: 'numeric', min, max, step, class: 'bet-input', 'aria-label': label, value });
  const bal = () => (state.user ? maxAffordable(state.user.balance, state.user.fee) : max);
  const clamp = v => {
    v = Math.round(Number(v) || 0);
    if (step > 1) v = Math.round(v / step) * step;
    return Math.max(min, Math.min(max, v));
  };
  const set = (v, silent) => {
    value = clamp(v); input.value = value; store.set('bet.' + key, value);
    if (!silent) listeners.forEach(f => f(value));
  };
  input.addEventListener('change', () => set(input.value));
  const add = d => () => { sfx.play('chip'); set(value + d); };
  const el = h('div', { class: 'betpicker' },
    h('div', { class: 'bp-row' },
      h('button', { type: 'button', class: 'btn sm', onclick: () => { sfx.play('click'); set(value - Math.max(step, 1)); }, 'aria-label': 'Decrease bet' }, '−'),
      input,
      h('button', { type: 'button', class: 'btn sm', onclick: () => { sfx.play('click'); set(value + Math.max(step, 1)); }, 'aria-label': 'Increase bet' }, '+')),
    h('div', { class: 'bp-chips' }, CHIPS.filter(c => c >= step && c <= max).map(c => chip(c, { onclick: add(c), small: true }))),
    h('div', { class: 'bp-row quick' },
      h('button', { type: 'button', class: 'btn xs', onclick: () => { sfx.play('click'); set(min); } }, 'Min'),
      h('button', { type: 'button', class: 'btn xs', onclick: () => { sfx.play('click'); set(value / 2); } }, '½'),
      h('button', { type: 'button', class: 'btn xs', onclick: () => { sfx.play('click'); set(value * 2); } }, '2×'),
      h('button', { type: 'button', class: 'btn xs', onclick: () => { sfx.play('click'); set(Math.min(max, bal())); } }, 'Max')));
  set(value, true);
  return { el, get: () => value, set, onChange: f => listeners.add(f) };
}

// small [-] n [+] used for side bets
export function stepper(value, { min = 0, max = 500, step = 1, onChange } = {}) {
  let v = value;
  const out = h('span', { class: 'sv' }, fmt(v));
  const upd = n => { v = Math.max(min, Math.min(max, n)); out.textContent = fmt(v); if (onChange) onChange(v); };
  return {
    el: h('span', { class: 'stepper' },
      h('button', { type: 'button', class: 'btn xs', 'aria-label': 'less', onclick: () => { sfx.play('click'); upd(v - (v > 25 ? 25 : v > 5 ? 5 : 1)); } }, '−'),
      out,
      h('button', { type: 'button', class: 'btn xs', 'aria-label': 'more', onclick: () => { sfx.play('chip'); upd(v + (v >= 25 ? 25 : v >= 5 ? 5 : 1)); } }, '+')),
    get: () => v, set: n => upd(n),
  };
}

// side-bet rows driven by server metadata {id:{name,pays,edge,desc,min,max}}
export function sideBets(defs, key, { onChange, visible } = {}) {
  const vals = store.get('side.' + key, {});
  const steppers = {};
  const rows = Object.entries(defs).map(([id, d]) => {
    const s = stepper(vals[id] || 0, { min: 0, max: d.max, onChange: v => { vals[id] = v; store.set('side.' + key, vals); if (onChange) onChange(); } });
    steppers[id] = s;
    return h('div', { class: 'side-row' },
      h('div', { class: 'side-info' },
        h('div', { class: 'side-name' }, d.name, ' ', h('span', { class: 'edge-badge' + (d.edge > 0.1 ? ' hi' : '') }, d.edge !== undefined ? (d.edge * 100).toFixed(1) + '% edge' : '')),
        h('div', { class: 'side-pays' }, d.pays),
        h('div', { class: 'side-desc' }, d.desc)),
      s.el);
  });
  return {
    el: h('details', { class: 'sidebets', open: Object.values(vals).some(v => v > 0) },
      h('summary', null, 'Side bets ', h('span', { class: 'hint' }, '(optional — higher house edge)')), rows),
    get: () => { const o = {}; for (const [id, s] of Object.entries(steppers)) if (s.get() > 0) o[id] = s.get(); return o; },
    total: () => Object.values(steppers).reduce((a, s) => a + s.get(), 0),
  };
}

// ---------- misc ----------
export function badge(text, cls = '') { return h('span', { class: 'badge ' + cls }, text); }
export function tabs(items, { active, onChange } = {}) {
  const panes = {}; const btns = {};
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('div', { class: 'tab-body' });
  const select = id => {
    for (const k of Object.keys(panes)) { panes[k].hidden = k !== id; btns[k].classList.toggle('active', k === id); btns[k].setAttribute('aria-selected', String(k === id)); }
    if (onChange) onChange(id);
  };
  for (const [id, label, node] of items) {
    btns[id] = h('button', { type: 'button', role: 'tab', class: 'tab', onclick: () => { sfx.play('click'); select(id); } }, label);
    panes[id] = h('div', { class: 'tab-pane', role: 'tabpanel', hidden: true }, node);
    bar.append(btns[id]); body.append(panes[id]);
  }
  select(active || items[0][0]);
  return { el: h('div', { class: 'tabbed' }, bar, body), select, panes, btns };
}
export function countdown(el, deadlineMs, offsetMs = 0) {
  let raf;
  const tick = () => {
    const left = Math.max(0, Math.ceil((deadlineMs - (Date.now() + offsetMs)) / 1000));
    el.textContent = left + 's';
    if (left > 0 && el.isConnected) raf = setTimeout(tick, 250);
  };
  tick();
  return () => clearTimeout(raf);
}
export function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return Math.floor(s / 86400) + ' d ago';
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// tiny helpers shared by the game clients
// Buttons whose handler returns a promise lock themselves until it settles, so nobody can fire a second spin/deal
// while the first is still animating (every game's action handler awaits its own animation).
export const btn = (label, cls, onclick, extra = {}) => {
  const b = h('button', { type: 'button', class: 'btn ' + (cls || ''), ...extra }, label);
  if (typeof onclick === 'function') b.addEventListener('click', async e => {
    if (b.dataset.busy) return;
    const r = onclick(e);
    if (r && typeof r.then === 'function') { b.dataset.busy = '1'; b.classList.add('busy'); try { await r; } catch (err) { console.error(err); } finally { delete b.dataset.busy; b.classList.remove('busy'); } }
  });
  return b;
};
export function resultBanner(a) {
  if (!a) return null;
  return h('div', { class: 'banner-result ' + (a.net > 0 ? 'win' : a.net < 0 ? 'lose' : '') }, a.headline, ' ', h('span', { class: 'result-pill ' + (a.net > 0 ? 'win' : a.net < 0 ? 'lose' : 'push') }, a.net === 0 ? 'Even' : sgn(a.net)));
}
export function coachBox(...kids) { return h('div', { class: 'coach-content' }, kids); }
export const optLabel = (name, edge) => name + (edge !== undefined ? ` (${(edge * 100).toFixed(1)}%)` : '');
