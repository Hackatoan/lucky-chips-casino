// Keno client: 80-number board, live paytable for your spot count, animated draw.
import { h, clear, fmt, btn, betPicker, sleep, store } from '../ui.js';
import { sfx } from '../sfx.js';
import { animOn } from '../fx.js';
export default {
  init(ctx) {
    const s = ctx._kn = { picks: new Set(store.get('keno.picks', [])), drawn: new Set(), busy: false };
    s.bet = betPicker('keno', { min: 1, max: 1000, def: 5 });
    s.grid = h('div', { class: 'kn-grid' }); s.info = h('div', { class: 'center small' }); s.pay = h('div', { class: 'kn-pay' }); s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(h('div', { class: 'zone-title' }, 'Keno — pick 1 to 10'), s.info, s.grid, s.pay, s.controls);
  },
  render(v, ctx) {
    const s = ctx._kn; s.v = v;
    if (v.last && !s.seen) { s.seen = true; s.drawn = new Set(v.last.drawn); }
    if (ctx.readonly && v.last) {                                       // watching someone: their picks, and the draw is replayed number by number
      const key = v.last.picks.join(',') + '|' + v.last.drawn.join(',');
      if (s.specKey === undefined) { s.specKey = key; s.picks = new Set(v.last.picks); s.drawn = new Set(v.last.drawn); }
      else if (key !== s.specKey) { s.specKey = key; s.specQ = v.last; if (!s.playing) { s.playing = true; (async () => { while (s.specQ) { const l = s.specQ; s.specQ = null; s.picks = new Set(l.picks); s.drawn = new Set(); drawGrid(ctx); for (const n of l.drawn) { s.drawn.add(n); drawGrid(ctx); sfx.play(s.picks.has(n) ? 'gem' : 'tick'); if (animOn()) await sleep(110); } } s.playing = false; })(); } }
    }
    drawGrid(ctx); drawPay(ctx);
    clear(s.controls); if (!ctx.readonly) s.controls.append(s.bet.el, h('div', { class: 'actions', style: { width: '100%' } },
      btn('Quick pick 8', '', () => { s.picks = new Set(); while (s.picks.size < 8) s.picks.add(1 + Math.floor(Math.random() * 80)); persist(s); drawGrid(ctx); drawPay(ctx); sfx.play('click'); }),
      btn('Clear', 'ghost', () => { s.picks = new Set(); persist(s); drawGrid(ctx); drawPay(ctx); }), btn('Play', 'gold big', () => play(ctx), { disabled: s.busy })));
    ctx.setCoach(h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, 'No pattern beats the draw'), h('p', { class: 'small', style: { margin: '4px 0 0' } }, 'Every number is equally likely. Lucky numbers, hot numbers and patterns are noise. The only choices are how many spots to play and which paytable (Rules tab) — the table below shows the exact return.'))));
  },
};
const persist = s => store.set('keno.picks', [...s.picks]);
function drawGrid(ctx) {
  const s = ctx._kn; clear(s.grid);
  for (let n = 1; n <= 80; n++) { const pick = s.picks.has(n), dr = s.drawn.has(n); s.grid.append(h('button', { type: 'button', class: 'kn-cell' + (pick ? ' pick' : '') + (dr ? ' drawn' : '') + (pick && dr ? ' hit' : ''), disabled: ctx.readonly, onclick: () => { if (s.busy) return; if (s.picks.has(n)) s.picks.delete(n); else if (s.picks.size < 10) s.picks.add(n); else return ctx.toast('You can pick at most 10 numbers.', 'bad'); sfx.play('click'); persist(s); drawGrid(ctx); drawPay(ctx); } }, n)); }
  s.info.textContent = `${s.picks.size} of 10 numbers picked` + (s.drawn.size ? ` · last draw hit ${[...s.picks].filter(n => s.drawn.has(n)).length}` : '');
}
function drawPay(ctx) {
  const s = ctx._kn, v = s.v, n = s.picks.size; clear(s.pay);
  if (!v || !n) { s.pay.append(h('span', { class: 'muted small' }, 'Pick numbers to see the paytable for your spot count.')); return; }
  const t = v.pays[n];
  s.pay.append(h('span', { class: 'muted small' }, `${n}-spot (${v.table}) · returns ${(t.rtp * 100).toFixed(1)}%: `), ...Object.entries(t.pays).map(([hit, m]) => h('span', { class: 'badge gold' }, `${hit} hits → ${m}×`)));
}
async function play(ctx) {
  const s = ctx._kn; if (!s.picks.size) return ctx.toast('Pick at least one number.', 'bad');
  s.busy = true; s.drawn = new Set(); drawGrid(ctx);
  const r = await ctx.call('play', { bet: s.bet.get(), picks: [...s.picks] });
  if (!r) { s.busy = false; return; }
  const last = r.view.last;
  for (const n of last.drawn) { s.drawn.add(n); drawGrid(ctx); sfx.play(s.picks.has(n) ? 'gem' : 'tick'); if (animOn()) await sleep(110); }
  s.busy = false; drawGrid(ctx);
}
