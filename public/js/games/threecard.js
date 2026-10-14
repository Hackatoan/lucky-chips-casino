// Three Card Poker client.
import { h, clear, fmt, cardsRow, card, btn, betPicker, sideBets } from '../ui.js';
import { sfx } from '../sfx.js';
import { roundsHooks } from '../rounds.js';

// shared-dealer table layout: one dealer hand, revealed when every seat has decided
const TABLE = {
  hasHand: pv => !!(pv.player && pv.player.length),
  hud: () => null,
  dealer: rd => { const d = rd.dealer; return d.cards.length ? [h('div', { class: 'zone-title' }, 'Dealer — needs Queen-high to qualify'), h('div', { class: 'cards', style: { minHeight: 0 } }, d.cards.map(c => card(c, {}))), d.name ? h('div', { class: 'center' }, h('span', { class: 'hand' }, h('span', { class: 'tot' }, d.name), d.qualifies === false ? h('span', { class: 'badge red', style: { marginLeft: '6px' } }, 'does not qualify') : null)) : null] : [h('div', { class: 'zone-title' }, 'Three Card Poker'), h('div', { class: 'center muted small' }, 'Place an Ante — everyone is dealt together, then play or fold.')]; },
  seat: pv => h('div', { class: 'shands' }, h('div', { class: 'shand' }, h('div', { class: 'cards', style: { minHeight: 0 } }, pv.player.map(c => card(c, {}))),
    h('div', { class: 'sline' }, pv.pname ? h('span', { class: 'tot' }, pv.pname) : null, h('span', { class: 'badge' }, '🪙 ' + fmt(pv.ante || 0)), pv.waiting ? h('span', { class: 'tot' }, pv.waiting) : (pv.phase === 'decide' ? h('span', { class: 'tot' }, 'deciding…') : null)),
    pv.phase === 'done' && pv.result ? h('div', { class: 'result-pill ' + (pv.result.play ? '' : 'lose') }, pv.result.play ? 'played' : 'folded') : null)),
  bet: ctx => { const bet = betPicker('threecard', { min: 1, max: 2000, def: 10, label: 'Ante' }), sides = sideBets(ctx.game.meta.bets, 'threecard'); return { node: h('div', null, bet.el, sides.el), body: () => ({ ante: bet.get(), sides: sides.get() }) }; },
  myTurn: v => v.phase === 'decide',
  play: (ctx, v) => { const c = ctx.coachOn() ? v.coach : null; return h('div', { class: 'actions' }, btn('Play  (+' + fmt(v.ante) + ')', 'green big' + (c && c.best === 'play' ? ' rec' : ''), () => ctx.call('play', {}), { title: c ? c.text : '' }), btn('Fold', 'red big' + (c && c.best === 'fold' ? ' rec' : ''), () => ctx.call('fold', {}), { title: c ? c.text : '' })); },
  coach: (ctx, v, on) => { const c = v && v.coach; return c ? h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, '★ ' + (c.best === 'play' ? 'Play' : 'Fold')), h('p', { class: 'small', style: { margin: '4px 0 0' } }, c.text)), h('p', { class: 'muted small' }, c.q64)) : h('div', { class: 'coach-content' }, h('p', null, 'The only decision is Play vs Fold. The coach applies the Queen-6-4 rule: play any hand of Q-6-4 or better.'), h('p', { class: 'muted small' }, 'Ante/Play edge 3.37%. Everyone at the table plays against the same dealer hand.')); },
  done: v => { const net = v.result ? 1 : 0; return v.result ? h('div', { class: 'banner-result' }, `Your ${v.pname} vs dealer ${v.dname || ''}`) : null; },
};
const HOOKS = roundsHooks(TABLE);
export default {
  ...HOOKS,
  init(ctx) {
    const s = ctx._tc = { prev: 0 };
    s.bet = betPicker('threecard', { min: 1, max: 2000, def: 10, label: 'Ante' });
    s.sides = sideBets(ctx.game.meta.bets, 'threecard');
    s.dealer = h('div', { class: 'dealer-zone' }); s.player = h('div', { class: 'player-zone' }); s.msg = h('div'); s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(s.dealer, s.msg, s.player, s.controls);
  },
  render(v, ctx) {
    if (HOOKS.tableRender(ctx)) return;
    const s = ctx._tc;
    clear(s.dealer); clear(s.player); clear(s.msg); clear(s.controls);
    s.dealer.append(h('div', { class: 'zone-title' }, 'Dealer — needs Queen-high to qualify'), cardsRow(v.dealer && v.dealer.length ? v.dealer : [null, null, null].slice(0, v.player ? 3 : 0), { from: v.phase === 'done' ? 3 : 0 }), v.dname ? h('div', { class: 'center' }, h('span', { class: 'hand' }, h('span', { class: 'tot' }, v.dname))) : null);
    if (v.player) { s.player.append(h('div', { class: 'zone-title' }, 'You'), cardsRow(v.player, { from: s.prev }), h('div', { class: 'center' }, h('span', { class: 'hand' }, h('span', { class: 'tot' }, v.pname), ' ', h('span', { class: 'badge' }, '🪙 Ante ' + fmt(v.ante))))); if (v.player.length > s.prev) for (let i = 0; i < v.player.length; i++) setTimeout(() => sfx.play('card'), i * 110); s.prev = v.player.length; }
    else { s.prev = 0; s.player.append(h('p', { class: 'center muted' }, 'Place an Ante and press Deal. One decision: Play (bet equal to your ante) or Fold.')); }
    const c = ctx.coachOn() ? v.coach : null;
    if (v.phase === 'decide') {
      s.controls.append(h('div', { class: 'actions' }, btn('Play  (+' + fmt(v.ante) + ')', 'green big' + (c && c.best === 'play' ? ' rec' : ''), () => ctx.call('play', {}), { title: c ? c.text : '' }), btn('Fold', 'red big' + (c && c.best === 'fold' ? ' rec' : ''), () => ctx.call('fold', {}), { title: c ? c.text : '' })));
      ctx.setCoach(c ? h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, '★ ' + (c.best === 'play' ? 'Play' : 'Fold')), h('p', { class: 'small', style: { margin: '4px 0 0' } }, c.text)), h('p', { class: 'muted small' }, c.q64)) : null);
    } else if (!ctx.readonly) {
      s.controls.append(s.bet.el, s.sides.el, h('div', { class: 'actions', style: { width: '100%' } }, btn('Deal', 'gold big', async () => { s.prev = 0; const r = await ctx.call('deal', { ante: s.bet.get(), sides: s.sides.get() }); if (r) sfx.play('chips'); })));
      ctx.setCoach(h('div', { class: 'coach-content' }, h('p', null, 'The only decision is Play vs Fold. The coach applies the Queen-6-4 rule: play any hand of Q-6-4 or better.'), h('p', { class: 'muted small' }, 'Ante/Play edge 3.37% · Pair Plus 7.3% · 6-Card Bonus 15%.')));
    }
  },
};
