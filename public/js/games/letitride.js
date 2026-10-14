// Let It Ride client.
import { h, clear, fmt, cardsRow, card, btn, betPicker } from '../ui.js';
import { sfx } from '../sfx.js';

export default {
  init(ctx) {
    const s = ctx._lir = { prevH: 0 };
    s.bet = betPicker('letitride', { min: 1, max: 1000, def: 10, label: 'Bet (×3)' });
    s.bonus = betPicker('letitride.bonus', { min: 0, max: 500, def: 0, label: '3-Card Bonus' });
    s.circles = h('div', { class: 'lir-circles' }); s.comm = h('div', { class: 'cards' }); s.hand = h('div'); s.msg = h('div'); s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(h('div', { class: 'zone-title' }, 'Community cards'), s.comm, s.circles, h('div', { class: 'zone-title' }, 'Your hand'), s.hand, s.msg, s.controls);
  },
  render(v, ctx) {
    const s = ctx._lir;
    clear(s.comm); clear(s.hand); clear(s.circles); clear(s.msg); clear(s.controls);
    const cm = v.community || [null, null];
    cm.forEach(c => s.comm.append(card(c, { delay: c ? 0 : undefined })));
    if (v.cards) {
      s.hand.append(cardsRow(v.cards, { from: s.prevH })); if (v.cards.length > s.prevH) for (let i = 0; i < 3; i++) setTimeout(() => sfx.play('card'), i * 110); s.prevH = v.cards.length;
      const circ = (label, state, amt) => h('div', { class: 'lir-circ ' + state }, h('b', null, label), h('span', null, state === 'pulled' ? 'pulled' : state === 'lost' ? '' : fmt(amt)));
      const done = v.phase === 'done';
      s.circles.append(circ('1', v.pulled[0] ? 'pulled' : 'on', v.unit), circ('2', v.pulled[1] ? 'pulled' : 'on', v.unit), circ('$', 'locked', v.unit));
      if (done) s.msg.append(h('div', { class: 'banner-result' }, v.result.kind ? v.result.name : 'No paying hand'));
    } else { s.prevH = 0; s.hand.append(h('p', { class: 'center muted' }, 'Three equal bets (1, 2 and $). Look at your cards, then decide whether to pull bets 1 and 2 back.')); }
    if (ctx.readonly) return;
    const c = ctx.coachOn() ? v.coach : null;
    if (v.phase === 'd1' || v.phase === 'd2') {
      s.controls.append(h('div', { class: 'actions' }, btn('Let it ride', 'green big' + (c && c.best === 'ride' ? ' rec' : ''), () => ctx.call('ride', {})), btn('Pull back bet ' + (v.phase === 'd1' ? '1' : '2'), 'red big' + (c && c.best === 'pull' ? ' rec' : ''), () => ctx.call('pull', {}))));
      ctx.setCoach(c ? h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, '★ ' + (c.best === 'ride' ? 'Let it ride' : 'Pull the bet back')), h('p', { class: 'small', style: { margin: '4px 0 0' } }, c.why)),
        h('div', { class: 'coach-opt' }, h('b', null, 'Exact expected value'), `Let it ride: ${c.evRide.toFixed(2)} bets · Pull back: ${c.evPull.toFixed(2)} bets (difference ${(Math.abs(c.evRide - c.evPull)).toFixed(2)}).`), h('p', { class: 'muted small' }, 'Pulled bets come back in full; the $ bet always stays.')) : null);
    } else {
      s.controls.append(s.bet.el, s.bonus.el, h('div', { class: 'actions', style: { width: '100%' } }, btn('Deal (' + fmt(s.bet.get() * 3 + s.bonus.get()) + ')', 'gold big', async () => { s.prevH = 0; const r = await ctx.call('deal', { bet: s.bet.get(), bonus: s.bonus.get() || undefined }); if (r) sfx.play('chips'); })));
      ctx.setCoach(h('div', { class: 'coach-content' }, h('p', null, 'Deal three bets. You\'ll see exact EVs for both decisions.'), h('p', { class: 'muted small' }, 'Paying hands: pair of 10s+ 1:1 · two pair 2:1 · trips 3:1 · straight 5:1 · flush 8:1 · full house 11:1 · quads 50:1 · straight flush 200:1 · royal 1000:1.')));
    }
  },
};
