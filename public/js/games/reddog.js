// Red Dog client.
import { h, clear, fmt, card, btn, betPicker } from '../ui.js';
import { sfx } from '../sfx.js';

export default {
  init(ctx) {
    const s = ctx._rd = { seen: '' };
    s.bet = betPicker('reddog', { min: 1, max: 2000, def: 10 });
    s.board = h('div', { class: 'war-board' }); s.msg = h('div'); s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(s.board, s.msg, s.controls);
  },
  render(v, ctx) {
    const s = ctx._rd; clear(s.board); clear(s.msg); clear(s.controls);
    if (!v.a) s.board.append(h('p', { class: 'center muted', style: { width: '100%' } }, 'Two cards set the spread. Will the third land between them?'));
    else {
      const key = v.a + v.b + (v.third || ''); const anim = key !== s.seen; if (anim) { s.seen = key; sfx.play('card'); }
      s.board.append(card(v.a, { delay: anim ? 0 : undefined }), h('div', { class: 'war-vs' }, v.spread >= 1 ? 'spread ' + v.spread : v.spread === 0 ? 'consecutive' : 'pair'), card(v.b, { delay: anim ? 120 : undefined }));
      if (v.third) s.board.append(h('div', { class: 'war-vs' }, '→'), card(v.third, { delay: 250 }));
      if (v.raised) s.msg.append(h('span', { class: 'badge gold' }, 'Raised ×2'));
    }
    if (ctx.readonly) return;
    const c = ctx.coachOn() ? v.coach : null;
    if (v.phase === 'raise') {
      s.controls.append(h('div', { class: 'actions' }, btn('Raise (+' + fmt(v.bet) + ')', 'green big' + (c && c.best === 'raise' ? ' rec' : ''), () => ctx.call('raise', {})), btn('Continue', 'big' + (c && c.best === 'play' ? ' rec' : ''), () => ctx.call('play', {}))));
      ctx.setCoach(c ? h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, '★ ' + (c.best === 'raise' ? 'Raise' : 'Don\'t raise')), h('p', { class: 'small', style: { margin: '4px 0 0' } }, c.text)), h('p', { class: 'muted small' }, `Win chance ${(c.p * 100).toFixed(1)}% · pays ${c.m}:1`)) : null);
    } else {
      s.controls.append(s.bet.el, h('div', { class: 'actions', style: { width: '100%' } }, btn('Deal', 'gold big', async () => { const r = await ctx.call('deal', { bet: s.bet.get() }); if (r) sfx.play('chips'); })));
      ctx.setCoach(h('div', { class: 'coach-content' }, h('p', null, 'Spread pays: 1→5:1 · 2→4:1 · 3→2:1 · 4+→1:1. Raise only on wide spreads (7+).')));
    }
  },
};
