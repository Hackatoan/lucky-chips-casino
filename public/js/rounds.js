// Generic layout for shared-dealer tables ("rounds" mode): dealer / community area on top, every seat on the bottom row, my controls below.
// Each game supplies an adapter: { hud?(rd), dealer(rd,s), seat(name,pv,info), idle(), bet(ctx)->{node,body()}, play(ctx,v,snap)->node|null, coach(ctx,v,coachOn), done?(v)->node }
import { h, clear, fmt, btn } from './ui.js';
import { state } from './api.js';
import { sfx } from './sfx.js';

export function roundsStage(ctx) {
  const s = ctx._rt = { hud: h('div', { class: 'hud' }), dealer: h('div', { class: 'dealer-zone' }), banner: h('div'), seats: h('div', { class: 'seats' }), controls: h('div', { class: 'controls' }), prev: {} };
  ctx.stage.replaceChildren(s.hud, s.dealer, s.banner, s.seats, s.controls);
  return s;
}
export function roundsRender(ctx, snap, spectator, A) {
  const s = ctx._rt || roundsStage(ctx);
  const rd = snap.rd, me = state.user.display, v = ctx.view;
  clear(s.hud); const hud = A.hud ? A.hud(rd) : null; if (hud) s.hud.append(...hud);
  clear(s.dealer); s.dealer.append(...[].concat(A.dealer(rd, s, snap)));
  const names = rd.order && rd.order.length ? rd.order : snap.players.filter(p => !p.banker).map(p => p.name);
  if (spectator && !s.focus) s.focus = names[0];
  if (spectator && snap.bot && !s.manualFocus && rd.focus && names.includes(rd.focus)) s.focus = rd.focus;
  clear(s.seats);
  for (const n of names) {
    const pl = snap.players.find(p => p.name === n) || {};
    const mine = n === me && !spectator;
    const pv = mine && v && rd.order.includes(me) && v.phase !== undefined ? v : (snap.pviews || {})[n];
    s.seats.append(h('div', { class: 'seat' + (mine ? ' me' : '') + (spectator && s.focus === n ? ' focus' : ''), onclick: spectator ? () => { s.focus = n; s.manualFocus = true; roundsRender(ctx, snap, true, A); } : null },
      h('div', { class: 'seat-name' }, n + (mine ? ' (you)' : '')),
      pv && A.hasHand(pv) ? A.seat(pv, { me: mine, snap }) : h('div', { class: 'muted small', style: { padding: '14px 6px' } }, pl.staked ? `✔ bet ${fmt(pl.staked)} placed` : pl.last ? h('span', { class: pl.last.net > 0 ? 'win' : pl.last.net < 0 ? 'lose' : '' }, 'last ' + (pl.last.net > 0 ? '+' : pl.last.net < 0 ? '−' : '±') + fmt(Math.abs(pl.last.net))) : 'waiting for a bet…')));
  }
  clear(s.banner); clear(s.controls);
  if (spectator) {
    const f = (snap.pviews || {})[s.focus];
    if (snap.bot) { if (f && A.coach) ctx.setCoach(A.coach(ctx, f, true)); s.banner.append(h('div', { class: 'center small' }, btn(s.manualFocus ? '🎯 Follow the action' : '🎯 Following the action', 'xs' + (s.manualFocus ? '' : ' on'), () => { s.manualFocus = !s.manualFocus; roundsRender(ctx, snap, true, A); }))); }
    else ctx.setCoach(h('p', { class: 'muted' }, 'Watching the table.'));
    return;
  }
  const inRound = rd.order.includes(me), mePl = snap.players.find(p => p.name === me) || {};
  if (snap.phase === 'betting') {
    if (mePl.staked > 0) s.controls.append(h('p', { class: 'center' }, `✔ Your bet of ${fmt(mePl.staked)} is in — the round starts when everyone has bet or the timer ends.`));
    else if (mePl.out) s.controls.append(h('p', { class: 'muted center' }, 'You\'re sitting out this round.'));
    else { s.bet = s.bet || A.bet(ctx); s.controls.append(s.bet.node, h('div', { class: 'actions', style: { width: '100%' } }, btn('Place bet', 'gold big', async () => { const r = await ctx.primary('deal', s.bet.body()); if (r) sfx.play('chips'); }, { disabled: ctx.sitting }))); }
    ctx.setCoach(A.coach(ctx, null, false));
  } else if (!inRound) s.controls.append(h('p', { class: 'muted center' }, 'Round in progress — you\'ll be dealt in next round.'));
  else if (v && A.myTurn(v, snap)) { s.controls.append(A.play(ctx, v, snap)); ctx.setCoach(A.coach(ctx, v, true)); }
  else if (v && v.phase === 'done') { const b = A.done ? A.done(v) : null; if (b) s.banner.append(b); }
  else s.controls.append(h('p', { class: 'muted center' }, snap.phase === 'results' ? 'Round over…' : 'Waiting for the other players…'));
}
// shared plumbing for a game client: table hooks that all three games use the same way
export function roundsHooks(A) {
  return {
    onTable(ctx, snap) {
      if (snap.mode !== 'rounds') return;
      const s = ctx._rt || roundsStage(ctx), me = state.user.display, inRound = (snap.rd.order || []).includes(me);
      if (snap.rd.seq !== s.rseq) { s.rseq = snap.rd.seq; if ((inRound || snap.phase === 'betting') && !s.refreshing) { s.refreshing = true; ctx.refresh().catch(() => roundsRender(ctx, snap, false, A)).finally(() => { s.refreshing = false; }); return; } }
      roundsRender(ctx, snap, false, A);
    },
    spectate(ctx, snap) { if (!ctx._rt) { ctx.readonly = true; roundsStage(ctx); } roundsRender(ctx, snap, true, A); },
    tableRender(ctx) { const snap = ctx.table && ctx.table.snap; if (snap && snap.mode === 'rounds') { roundsRender(ctx, snap, false, A); return true; } return false; },
  };
}
