import { h, clear, fmt, die, btn, sleep } from '../ui.js';
import { betBoard } from '../betboard.js';
import { sfx } from '../sfx.js';
import { animOn } from '../fx.js';
export default {
  init(ctx) {
    const s = ctx._su = { dice: [3, 4] };
    s.box = h('div', { class: 'dice-box' }); s.msg = h('div', { class: 'center small' }); s.hist = h('div', { class: 'rl-hist' }); s.controls = h('div', { class: 'controls' });
    s.board = betBoard({ storeKey: 'sevenup', cols: 3, rows: Object.entries(ctx.game.meta.bets).map(([id, b]) => ({ id, name: b.name, pays: b.pays, edge: b.edge, desc: b.desc, cls: id === 'under' ? 'blue' : id === 'over' ? 'red' : 'green' })) });
    ctx.stage.replaceChildren(h('div', { class: 'zone-title' }, 'Seven Up — under, over or lucky 7'), s.box, s.msg, s.hist, s.board.el, s.controls);
  },
  render(v, ctx) {
    const s = ctx._su; if (v.last && !s.seen) { s.dice = v.last.dice; s.seen = true; }
    draw(s); clear(s.hist); (v.history || []).slice(-24).forEach(t => s.hist.append(h('span', { class: t === 7 ? 'red' : 'green' }, t)));
    s.msg.textContent = v.pending ? `✔ Bets placed (${fmt(v.pending.staked)})` : v.last ? `Last: ${v.last.dice.join(' + ')} = ${v.last.total}` : '';
    clear(s.controls); if (!ctx.readonly) s.controls.append(h('div', { class: 'actions', style: { width: '100%' } }, btn(ctx.table && ctx.table.role === 'player' ? 'Place bets' : 'Roll', 'gold big', () => go(ctx), { disabled: !!v.pending || ctx.sitting })));
    ctx.setCoach(h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, '⚠ 16.7% edge on every bet'), h('p', { class: 'small', style: { margin: '4px 0 0' } }, 'Seven comes up 6 times in 36 — more than any total — and it beats BOTH Under and Over. Compare craps\' Pass Line at 1.4% or roulette at 2.7%.'))));
  },
  async onResult(ctx, data) { const s = ctx._su; if (s && data.outcome.dice) await anim(s, data.outcome.dice); },
  spectate(ctx, snap) { if (!ctx._su) { this.init(ctx); ctx._su.board.el.remove(); ctx._su.controls.remove(); } const s = ctx._su; if (snap.outcome && !s.seen) { s.seen = true; s.dice = snap.outcome.dice; } draw(s); },
};
const draw = s => s.box.replaceChildren(die(s.dice[0]), die(s.dice[1]), h('div', { class: 'dice-total' }, s.dice[0] + s.dice[1]));
async function anim(s, f) { if (animOn()) { sfx.play('dice'); for (let i = 0; i < 8; i++) { s.box.replaceChildren(die(1 + Math.floor(Math.random() * 6), { roll: true }), die(1 + Math.floor(Math.random() * 6), { roll: true })); await sleep(80); } } s.dice = f; draw(s); }
async function go(ctx) { const s = ctx._su, bets = s.board.get(); if (!Object.keys(bets).length) return ctx.toast('Place a bet first.', 'bad'); s.board.remember(); const solo = !(ctx.table && ctx.table.role === 'player'); const r = await ctx.primary('roll', { bets }); if (r && solo) { s.board.clear(); if (r.view.last) await anim(s, r.view.last.dice); } }
