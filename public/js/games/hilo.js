// Hi-Lo Streak client.
import { h, clear, fmt, card, btn, betPicker } from '../ui.js';
import { sfx } from '../sfx.js';
export default {
  init(ctx) {
    const s = ctx._hl = { };
    s.bet = betPicker('hilo', { min: 1, max: 2000, def: 10 });
    s.card = h('div', { class: 'center' }); s.pot = h('div', { class: 'banner-result' }); s.trail = h('div', { class: 'rl-hist' }); s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(h('div', { class: 'zone-title' }, 'Hi-Lo Streak'), s.pot, s.card, s.trail, s.controls);
  },
  render(v, ctx) {
    const s = ctx._hl; clear(s.card); clear(s.controls); clear(s.trail);
    if (v.card) { const key = v.card + v.streak; s.card.append(h('div', { class: 'cards' }, card(v.card, { delay: key !== s.seen ? 0 : undefined }))); if (key !== s.seen) { s.seen = key; sfx.play('flip'); } }
    else s.card.append(h('div', { class: 'cards' }, card(null)));
    (v.history || []).slice(-14).forEach(x => s.trail.append(h('span', { class: x.win ? 'green' : 'red' }, x.dir === 'higher' ? '↑' : '↓')));
    s.pot.textContent = v.phase === 'play' ? `Pot ${fmt(v.pot)} · streak ${v.streak}` : v.phase === 'done' ? (v.pot ? 'Cashed out ' + fmt(v.pot) : 'Streak over') : '';
    if (ctx.readonly) return;
    if (v.phase === 'play') {
      const o = v.options, c = ctx.coachOn() ? v.coach : null;
      const g = (d, label) => btn(`${label}  ${(o[d].p * 100).toFixed(0)}% · ×${o[d].m ? o[d].m.toFixed(2) : '—'}`, d === 'higher' ? 'green big' : 'red big', () => ctx.call('guess', { dir: d }), { disabled: o[d].p <= 0 });
      s.controls.append(h('div', { class: 'actions' }, g('higher', '▲ Higher'), g('lower', '▼ Lower'), v.streak ? btn('Cash out ' + fmt(v.pot), 'gold big', () => ctx.call('cashout', {})) : null));
      ctx.setCoach(c ? h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, v.streak ? '★ Cash out is always the best EV' : 'Pick the likelier side'), h('p', { class: 'small', style: { margin: '4px 0 0' } }, c.text))) : null);
    } else {
      s.controls.append(s.bet.el, h('div', { class: 'actions', style: { width: '100%' } }, btn('Start', 'gold big', async () => { const r = await ctx.call('start', { bet: s.bet.get() }); if (r) sfx.play('chips'); })));
      ctx.setCoach(h('div', { class: 'coach-content' }, h('p', null, 'Guess higher or lower. Every correct guess keeps (100 − edge)% of fair value, so a long streak is mostly luck — and cashing out early is the only real decision.')));
    }
  },
};
