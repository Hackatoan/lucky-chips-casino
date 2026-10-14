// Casino War client.
import { h, clear, fmt, card, btn, betPicker } from '../ui.js';
import { sfx } from '../sfx.js';
import { roundsHooks } from '../rounds.js';
import { betPicker as bp } from '../ui.js';

// shared-dealer table layout (one dealer card for the whole table)
const TABLE = {
  hasHand: pv => !!pv.player,
  hud: () => null,
  dealer: rd => { const d = rd.dealer; return d.cards.length ? [h('div', { class: 'zone-title' }, 'Dealer'), h('div', { class: 'cards', style: { minHeight: 0 } }, d.cards.map(c => card(c, {})), d.war ? [h('span', { class: 'muted small', style: { margin: '0 8px' } }, 'war →'), card(d.war, {})] : null)] : [h('div', { class: 'zone-title' }, 'Casino War'), h('div', { class: 'center muted small' }, 'Highest card wins. Tie? Go to war or surrender.')]; },
  seat: (pv) => h('div', { class: 'shands' }, h('div', { class: 'shand' }, h('div', { class: 'cards', style: { minHeight: 0 } }, card(pv.player, {}), pv.war ? [card(pv.war.player, {})] : null),
    h('div', { class: 'sline' }, h('span', { class: 'badge' }, '🪙 ' + fmt(pv.bet) + (pv.tie ? ' + tie ' + fmt(pv.tie) : '')), pv.phase === 'warcall' ? h('span', { class: 'tot' }, 'TIE — deciding') : pv.phase === 'wait' ? h('span', { class: 'tot' }, 'at war') : null))),
  bet: ctx => { const bet = bp('war', { min: 1, max: 2000, def: 10 }), tie = bp('war.tie', { min: 0, max: 500, def: 0, label: 'Tie bet' }); return { node: h('div', null, bet.el, tie.el), body: () => ({ bet: bet.get(), tie: tie.get() || undefined }) }; },
  myTurn: v => v.phase === 'warcall',
  play: (ctx, v) => h('div', { class: 'actions' }, btn('⚔️ Go to war (+' + fmt(v.bet) + ')', 'red big rec', () => ctx.call('war', {})), btn('Surrender (lose half)', 'ghost', () => ctx.call('surrender', {}))),
  coach: (ctx, v) => h('div', { class: 'coach-content' }, h('p', null, v && v.phase === 'warcall' ? 'A tie! Always go to war: it costs about 2.9% on average versus 3.7% for surrender. The tie bet is a ~18.6% edge — skip it.' : 'Casino War has one decision: what to do on a tie. Everyone at the table plays against the same dealer card.')),
  done: v => h('div', { class: 'banner-result ' + ((v.hands && 0) || '') }, 'Round over'),
};
const HOOKS = roundsHooks(TABLE);
export default {
  ...HOOKS,
  init(ctx) {
    const s = ctx._war = { seen: '' };
    s.bet = betPicker('war', { min: 1, max: 2000, def: 10 });
    s.tie = betPicker('war.tie', { min: 0, max: 500, def: 0, label: 'Tie bet' });
    s.board = h('div', { class: 'war-board' }); s.msg = h('div'); s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(s.board, s.msg, s.controls);
  },
  render(v, ctx) {
    if (HOOKS.tableRender(ctx)) return;
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
