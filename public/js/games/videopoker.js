// Video poker client: paytable, tap-to-hold, exact-EV coach, double-up gamble.
import { h, clear, fmt, sgn, card, btn, betPicker } from '../ui.js';
import { sfx } from '../sfx.js';
import { sleep } from '../ui.js';
import { animOn } from '../fx.js';

export default {
  init(ctx) {
    const s = ctx._vp = { holds: [false, false, false, false, false], phaseSeen: '', hand: '' };
    s.bet = betPicker('videopoker', { min: 1, max: 2000, def: 10 });
    s.pay = h('div', { class: 'vp-pay' });
    s.title = h('div', { class: 'zone-title' });
    s.cards = h('div', { class: 'vp-cards' });
    s.msg = h('div', { class: 'banner-result' });
    s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(s.title, s.pay, s.cards, s.msg, s.controls);
  },
  render(v, ctx) {
    const s = ctx._vp; s.v = v;
    s.title.textContent = `${v.variant} · ${(v.rtp * 100).toFixed(2)}% return`;
    clear(s.pay);
    const won = v.result && v.result.name;
    for (const [name, mult] of v.paytable) s.pay.append(h('div', { class: 'vp-row' + (won === name && (v.phase === 'collect' || v.phase === 'gamble' || v.phase === 'gamble-done' || v.phase === 'done') ? ' hit' : '') }, h('span', null, name), h('b', null, mult)));
    if (v.phase === 'draw' && s.phaseSeen !== 'draw') s.holds = [false, false, false, false, false];
    s.phaseSeen = v.phase;
    drawCards(ctx);
    clear(s.msg);
    if (v.phase === 'collect') s.msg.append(`${v.result.name} — pays ${v.result.mult}× → `, h('span', { class: 'gold' }, fmt(v.pot)), v.ups ? ` (doubled ${v.ups}×)` : '');
    else if (v.phase === 'done') s.msg.append(v.result && v.result.mult ? `${v.result.name}` : 'No win');
    else if (v.phase === 'draw') s.msg.append(h('span', { class: 'small muted' }, 'Tap the cards you want to HOLD, then Draw'));
    clear(s.controls);
    if (ctx.readonly) { if (v.phase === 'gamble' || v.phase === 'gamble-done') s.controls.append(gambleBoard(ctx, v)); return; }
    if (v.phase === 'idle' || v.phase === 'done') {
      s.controls.append(s.bet.el, h('div', { class: 'actions', style: { width: '100%' } }, btn('Deal', 'gold big', () => { s.holds = [false, false, false, false, false]; ctx.call('deal', { bet: s.bet.get() }).then(r => r && sfx.play('chips')); })));
    } else if (v.phase === 'draw') {
      const c = ctx.coachOn() ? v.coach : null;
      s.controls.append(h('div', { class: 'actions' }, c ? btn('Hold the best cards', '', () => { s.holds = [0, 1, 2, 3, 4].map(i => !!(c.best >> i & 1)); drawCards(ctx); sfx.play('click'); }) : null, btn('Draw', 'gold big', () => draw(ctx))));
    } else if (v.phase === 'collect') {
      s.controls.append(h('div', { class: 'actions' }, btn('Collect ' + fmt(v.pot), 'gold big', () => ctx.call('collect', {})), v.ups < 5 ? btn('Double up (50/50) ×' + fmt(v.pot * 2), 'red', () => ctx.call('double', {})) : null));
    } else if (v.phase === 'gamble' || v.phase === 'gamble-done') s.controls.append(gambleBoard(ctx, v));
    drawCoach(ctx, v);
  },
};
function drawCards(ctx) {
  const s = ctx._vp, v = s.v; clear(s.cards);
  if (!v.hand) { for (let i = 0; i < 5; i++) s.cards.append(card(null)); return; }
  const key = v.hand.join(','), newHand = key !== s.hand; s.hand = key;
  v.hand.forEach((c, i) => {
    const held = v.phase === 'draw' ? s.holds[i] : (v.holds && v.holds[i]);
    const w = h('button', { type: 'button', class: 'vp-card' + (held ? ' held' : ''), disabled: v.phase !== 'draw' || ctx.readonly, 'aria-pressed': String(!!held), onclick: () => { s.holds[i] = !s.holds[i]; sfx.play('click'); drawCards(ctx); } },
      card(c, { delay: newHand ? i * 100 : undefined }), held ? h('span', { class: 'held-tag' }, 'HELD') : null);
    s.cards.append(w);
  });
  if (newHand && v.phase === 'draw') for (let i = 0; i < 5; i++) setTimeout(() => sfx.play('card'), i * 100);
}
async function draw(ctx) {
  const s = ctx._vp; const r = await ctx.call('draw', { holds: s.holds });
  if (r) sfx.play('flip');
}
function gambleBoard(ctx, v) {
  const done = v.phase === 'gamble-done';
  const box = h('div', { class: 'center' }, h('div', { class: 'small muted' }, `Double up for ${fmt(v.pot * (done ? 1 : 2))} — pick a card higher than the dealer's (tie = push)`),
    h('div', { class: 'row', style: { justifyContent: 'center', gap: '14px', margin: '8px 0' } }, h('div', null, h('div', { class: 'small muted' }, 'Dealer'), card(v.dealer)),
      ...(done ? v.cards.map((c, i) => h('div', null, h('div', { class: 'small muted' }, i === v.picked ? 'You' : ' '), card(c, { cls: i === v.picked ? 'hl' : '' }))) : [0, 1, 2, 3].map(i => h('button', { type: 'button', class: 'vp-card', disabled: ctx.readonly, onclick: () => ctx.call('pick', { index: i }) }, card(null))))));
  if (done) box.append(h('div', { class: 'banner-result ' + (v.outcome === 'win' ? 'win' : v.outcome === 'lose' ? 'lose' : '') }, v.outcome === 'win' ? 'You win! Pot doubled' : v.outcome === 'push' ? 'Tie — push' : 'Dealer wins'), ctx.readonly ? null : btn(v.outcome === 'lose' ? 'Continue' : 'Next', 'gold', () => ctx.call('next', {})));
  return box;
}
function drawCoach(ctx, v) {
  const c = v.coach;
  if (!c) { ctx.setCoach(h('div', { class: 'coach-content' }, h('p', null, 'Deal a hand. The coach computes the exact expected value of all 32 possible holds and ranks them.'), h('p', { class: 'muted small' }, 'Paytable matters: ' + v.table))); return; }
  ctx.setCoach(h('div', { class: 'coach-content' },
    h('div', { class: 'coach-best' }, h('b', null, '★ Best hold: ' + c.top[0].name), h('div', { class: 'small' }, `Expected return ${(c.bestEV * 100).toFixed(1)}% of your bet`), h('p', { class: 'small', style: { margin: '4px 0 0' } }, c.top[0].why)),
    c.top.slice(1).map(t => h('div', { class: 'coach-opt no' }, h('b', null, `${t.name} — EV ${(t.ev * 100).toFixed(1)}%`), t.why || 'Lower expected value.', h('div', { class: 'muted small' }, `${((c.bestEV - t.ev) * 100).toFixed(1)}% of your bet worse than the best hold`))),
    h('p', { class: 'muted small' }, 'EVs are exact: every possible draw from the remaining 47 cards is enumerated.')));
}
