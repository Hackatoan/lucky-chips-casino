// Casino War client.
import { h, clear, fmt, card, btn, betPicker } from '../ui.js';
import { sfx } from '../sfx.js';

export default {
  init(ctx) {
    const s = ctx._war = { seen: '' };
    s.bet = betPicker('war', { min: 1, max: 2000, def: 10 });
    s.tie = betPicker('war.tie', { min: 0, max: 500, def: 0, label: 'Tie bet' });
    s.board = h('div', { class: 'war-board' }); s.msg = h('div'); s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(s.board, s.msg, s.controls);
  },
  render(v, ctx) {
    const s = ctx._war; clear(s.board); clear(s.msg); clear(s.controls);
    if (!v.player) s.board.append(h('p', { class: 'center muted', style: { width: '100%' } }, 'Highest card wins. Tie? Go to war (best) or surrender half your bet.'));
    else {
      const key = v.player + v.dealer + (v.war ? v.war.player + v.war.dealer : '');
      const anim = key !== s.seen; if (anim) { s.seen = key; sfx.play('card'); }
      s.board.append(h('div', { class: 'war-side' }, h('div', { class: 'zone-title' }, 'Dealer'), card(v.dealer, { delay: anim ? 120 : undefined })), h('div', { class: 'war-vs' }, 'VS'), h('div', { class: 'war-side' }, h('div', { class: 'zone-title' }, 'You'), card(v.player, { delay: anim ? 0 : undefined })));
      if (v.war) s.board.append(h('div', { class: 'war-side' }, h('div', { class: 'zone-title' }, 'War: dealer'), card(v.war.dealer, { delay: 300 })), h('div', { class: 'war-side' }, h('div', { class: 'zone-title' }, 'War: you'), card(v.war.player, { delay: 200 })));
      if (v.phase === 'warcall') s.msg.append(h('div', { class: 'banner-result' }, '⚔️ Tie! Go to war or surrender?'));
    }
    if (ctx.readonly) return;
    const c = ctx.coachOn() ? v.coach : null;
    if (v.phase === 'warcall') {
      s.controls.append(h('div', { class: 'actions' }, btn('⚔️ Go to war (+' + fmt(v.bet) + ')', 'red big' + (c ? ' rec' : ''), () => ctx.call('war', {})), btn('Surrender (lose half)', 'ghost', () => ctx.call('surrender', {}))));
      ctx.setCoach(c ? h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, '★ Go to war'), h('p', { class: 'small', style: { margin: '4px 0 0' } }, c.text))) : null);
    } else {
      s.controls.append(s.bet.el, s.tie.el, h('div', { class: 'actions', style: { width: '100%' } }, btn('Deal', 'gold big', async () => { const r = await ctx.call('deal', { bet: s.bet.get(), tie: s.tie.get() || undefined }); if (r) sfx.play('chips'); })));
      ctx.setCoach(h('div', { class: 'coach-content' }, h('p', null, 'Casino War has just one decision — what to do on a tie. Always go to war (2.9% edge vs 3.7% for surrender). The Tie bet pays 10:1 but costs ~18.6%.')));
    }
  },
};
