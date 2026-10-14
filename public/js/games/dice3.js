// Three-dice client shared by Sic Bo, Chuck-a-Luck and Crown & Anchor.
import { h, clear, fmt, die, btn, sleep } from '../ui.js';
import { betBoard } from '../betboard.js';
import { sfx } from '../sfx.js';
import { animOn } from '../fx.js';

const GROUPS = [['main', 'Small / Big'], ['single', 'Single numbers'], ['total', 'Totals'], ['double', 'Specific doubles'], ['triple', 'Specific triples'], ['anytriple', 'Any triple'], ['combo', 'Two-number combinations']];
const keyOf = b => `${b.type}|${b.n || ''}|${b.a || ''}|${b.b || ''}`;
const sdie = (n, symbols, o = {}) => { if (!symbols) return die(n, o); const g = symbols[n - 1].split(' ')[0]; return h('div', { class: 'die sym' + (o.roll ? ' rolling' : '') + ('♥♦'.includes(g) ? ' redsym' : ('♠♣'.includes(g) ? ' blacksym' : '')), title: symbols[n - 1] }, g); };

export default {
  init(ctx) {
    const s = ctx._d3 = { dice: [1, 1, 1], shown: '' };
    s.box = h('div', { class: 'dice-box' }); s.hist = h('div', { class: 'rl-hist' }); s.msg = h('div', { class: 'center small' }); s.controls = h('div', { class: 'controls' });
    s.boardHost = h('div');
    ctx.stage.replaceChildren(h('div', { class: 'zone-title' }, ctx.game.name), s.box, s.msg, s.hist, s.boardHost, s.controls);
  },
  render(v, ctx) {
    const s = ctx._d3; s.v = v;
    if (!s.board) {
      const groupsPresent = GROUPS.filter(([id]) => v.catalog.some(c => (id === 'main' ? (c.type === 'small' || c.type === 'big') : c.type === id)));
      s.board = betBoard({ storeKey: ctx.id, groups: groupsPresent.map(([id, label]) => ({ id, label: id === 'single' && v.symbols ? 'Symbols' : label })), cols: v.symbols || v.catalog.length < 10 ? 3 : 4,
        rows: v.catalog.map(c => ({ id: keyOf(c), name: c.name, pays: c.pays.split(' (')[0].replace('1:1 per matching die', '1:1 / die'), edge: c.edge, group: c.type === 'small' || c.type === 'big' ? 'main' : c.type, cls: c.type === 'small' ? 'blue' : c.type === 'big' ? 'red' : '' })) });
      s.boardHost.replaceChildren(s.board.el);
      s.byKey = Object.fromEntries(v.catalog.map(c => [keyOf(c), c]));
    }
    if (v.last && JSON.stringify(v.last) !== s.shown) { s.shown = JSON.stringify(v.last); s.dice = v.last.dice; }
    drawDice(s, v);
    clear(s.hist); (v.history || []).slice(-24).forEach(t => s.hist.append(h('span', { class: t === 3 * Math.round(t / 3) && false ? 'red' : 'green' }, t)));
    s.msg.textContent = v.pending ? `✔ Bets placed (${fmt(v.pending.staked)}) — waiting for the round…` : (v.last ? `Last roll: ${v.last.dice.join(' · ')} = ${v.last.total}` : '');
    clear(s.controls);
    if (!ctx.readonly) { const tab = ctx.table && ctx.table.role === 'player'; s.controls.append(h('div', { class: 'actions', style: { width: '100%' } }, btn(tab ? 'Place bets' : 'Roll', 'gold big', () => roll(ctx), { disabled: !!v.pending || ctx.sitting }))); }
    const worst = v.catalog.reduce((m, c) => (c.edge > m.edge ? c : m), v.catalog[0]), best = v.catalog.reduce((m, c) => (c.edge < m.edge ? c : m), v.catalog[0]);
    ctx.setCoach(h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, `★ Cheapest bet: ${best.name} (${(best.edge * 100).toFixed(2)}% edge)`), h('p', { class: 'small', style: { margin: '4px 0 0' } }, 'Every cell shows its payout and exact house edge (computed by enumerating all 216 outcomes).')),
      h('div', { class: 'coach-opt no' }, h('b', null, `Worst: ${worst.name} (${(worst.edge * 100).toFixed(1)}%)`), 'Big payouts on rare combinations are what make high-edge bets look attractive.'),
      h('p', { class: 'muted small' }, 'Right-click (or long-press) a bet to clear it.')));
  },
  async onResult(ctx, data) { const s = ctx._d3; if (s && data.outcome && data.outcome.dice) await animate(s, data.outcome.dice); },
  spectate(ctx, snap) {
    if (!ctx._d3) { this.init(ctx); ctx.stage.prepend(h('div', { class: 'spectator-banner' }, '👁 Watching table ' + snap.code)); ctx._d3.controls.remove(); ctx._d3.boardHost.remove(); }
    const s = ctx._d3; if (snap.outcome && snap.outcome.dice && !s.seen) { s.seen = true; s.dice = snap.outcome.dice; }
    drawDice(s, { symbols: null });
    clear(s.hist); (snap.history || []).forEach(x => x && s.hist.append(h('span', { class: x.c || '' }, x.n)));
    s.msg.textContent = snap.phase === 'results' ? 'Round ' + (snap.round - 1) + ' complete' : snap.deadline ? 'Round ' + snap.round + ': bets are in' : 'Waiting for bets…';
  },
};
function drawDice(s, v) { const sy = v.symbols || (s.v && s.v.symbols); s.box.replaceChildren(...s.dice.map(n => sdie(n, sy)), h('div', { class: 'dice-total' }, s.dice.reduce((a, b) => a + b, 0))); }
async function animate(s, final) {
  if (!animOn()) { s.dice = final; drawDice(s, s.v || {}); return; }
  sfx.play('dice', 12); const sy = s.v && s.v.symbols;
  for (let i = 0; i < 9; i++) { s.box.replaceChildren(...[0, 1, 2].map(() => sdie(1 + Math.floor(Math.random() * 6), sy, { roll: true }))); await sleep(85); }
  s.dice = final; drawDice(s, s.v || {});
}
async function roll(ctx) {
  const s = ctx._d3, amounts = s.board.get();
  const bets = Object.entries(amounts).map(([k, amount]) => { const c = s.byKey[k]; return { type: c.type, n: c.n, a: c.a, b: c.b, amount }; });
  if (!bets.length) return ctx.toast('Place a bet first.', 'bad');
  s.board.remember();
  const solo = !(ctx.table && ctx.table.role === 'player');
  const r = await ctx.primary('roll', { bets });
  if (r && solo) { s.board.clear(); if (r.view.last) await animate(s, r.view.last.dice); }
}
