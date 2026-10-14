// Blackjack client: shoe + Hi-Lo HUD, coach tooltips, side bets, split hands.
import { h, clear, fmt, sgn, cardsRow, card, betPicker, sideBets, btn, resultBanner, badge, store } from '../ui.js';
import { sfx } from '../sfx.js';
import { state } from '../api.js';

const NAMES = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' };
const ACT = { hit: 'H', stand: 'S', double: 'D', split: 'P', surrender: 'R' };

export default {
  init(ctx) {
    const s = ctx._bj = { prev: { dealer: 0, hands: [] }, lastHole: false, seen: null };
    s.bet = betPicker('blackjack', { min: 2, max: 5000, step: 2, def: 10 });
    s.sides = sideBets(ctx.game.meta.sides, 'blackjack');
    s.hud = h('div', { class: 'hud' });
    s.notice = h('div', { class: 'small gold center' });
    s.dealer = h('div', { class: 'dealer-zone' });
    s.player = h('div', { class: 'player-zone' });
    s.banner = h('div');
    s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(s.hud, s.notice, s.dealer, s.banner, s.player, s.controls);
    s.key = e => {
      if (ctx.readonly || e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
      const v = ctx.view; if (!v) return;
      const k = e.key.toLowerCase();
      if (v.phase === 'player' && v.allowed && v.allowed.draw) { if (k === 'enter' || k === ' ') { e.preventDefault(); act(ctx, 'draw'); } }
      else if (v.phase === 'player') { const m = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' }[k]; if (m && v.allowed[m]) { e.preventDefault(); act(ctx, m); } }
      else if (v.phase === 'insurance') { if (k === 'y') insure(ctx, true); if (k === 'n') insure(ctx, false); }
      else if ((k === 'enter' || k === ' ') && (v.phase === 'idle' || v.phase === 'done')) { e.preventDefault(); if (ctx.table && ctx.table.snap && ctx.table.snap.mode === 'rounds') placeBet(ctx); else deal(ctx); }
    };
    document.addEventListener('keydown', s.key);
  },
  destroy(ctx) { if (ctx._bj) document.removeEventListener('keydown', ctx._bj.key); },
  // shared-dealer table: seated players get the same layout plus their own controls; watchers get a read-only copy
  onTable(ctx, snap) {
    const s = ctx._bj; if (!s || snap.mode !== 'rounds') return;
    const me = state.user.display, inRound = (snap.rd.order || []).includes(me);
    if (snap.rd.seq !== s.rseq) {
      s.rseq = snap.rd.seq;
      if (inRound || snap.phase === 'betting') { if (!s.refreshing) { s.refreshing = true; ctx.refresh().catch(() => renderTable(ctx, snap)).finally(() => { s.refreshing = false; }); return; } }
    }
    renderTable(ctx, snap);
  },
  spectate(ctx, snap) {
    if (!ctx._bj) { ctx.readonly = true; this.init(ctx); }
    renderTable(ctx, snap, true);
  },

  render(v, ctx) {
    const s = ctx._bj;
    if (ctx.table && ctx.table.snap && ctx.table.snap.mode === 'rounds') return renderTable(ctx, ctx.table.snap);
    const showCount = (state.user.settings || {}).showCount !== false;
    // --- HUD (Hi-Lo count) ---
    clear(s.hud);
    const c = v.count;
    s.hud.append(
      h('div', { class: 'stat' }, h('b', null, fmt(c.left)), h('span', null, 'cards in shoe')),
      h('div', { class: 'stat' }, h('b', null, (c.left / 52).toFixed(1)), h('span', null, 'decks left')));
    if (showCount) s.hud.append(
      h('div', { class: 'stat', title: 'Hi-Lo: 2-6 = +1, 7-9 = 0, 10-A = −1' }, h('b', { class: c.rc > 0 ? 'win' : c.rc < 0 ? 'lose' : '' }, (c.rc > 0 ? '+' : '') + c.rc), h('span', null, 'running count')),
      h('div', { class: 'stat', title: 'running count ÷ decks left' }, h('b', { class: c.tc >= 2 ? 'win' : c.tc <= -2 ? 'lose' : '' }, (c.tc > 0 ? '+' : '') + c.tc.toFixed(1)), h('span', null, 'true count')));
    s.notice.textContent = v.notice || '';

    // --- dealer ---
    const dFrom = v.dealer.cards.length < s.prev.dealer ? 0 : s.prev.dealer;
    const holeNow = v.dealer.cards.length > 1 && v.dealer.cards[1] !== null;
    const hasDealer = v.dealer.cards.length > 0;
    clear(s.dealer);
    if (hasDealer) {
      s.dealer.append(h('div', { class: 'zone-title' }, 'Dealer'),
        cardsRow(v.dealer.cards, { from: dFrom }),
        h('div', { class: 'center' }, h('span', { class: 'hand' }, h('span', { class: 'tot' + (v.dealer.total > 21 ? ' bust' : '') }, v.dealer.total > 21 ? 'Bust ' + v.dealer.total : (v.dealer.soft ? 'Soft ' : '') + v.dealer.total))));
    } else s.dealer.append(h('div', { class: 'zone-title' }, 'Dealer stands on all 17s · Blackjack pays 3:2 · Insurance pays 2:1'), h('div', { class: 'center muted small' }, 'Place your bet and press Deal'));
    // --- sounds for new cards ---
    const newCards = Math.max(0, v.dealer.cards.length - dFrom) + v.hands.reduce((a, hd, i) => a + Math.max(0, hd.cards.length - ((s.prev.hands[i]) || 0)), 0);
    if (newCards) for (let i = 0; i < Math.min(newCards, 6); i++) setTimeout(() => sfx.play('card'), i * 110);
    if (holeNow && !s.lastHole && v.dealer.cards.length >= 2 && s.prev.dealer >= 2) sfx.play('flip');
    s.lastHole = holeNow;

    // --- player hands ---
    clear(s.player);
    v.hands.forEach((hd, i) => {
      const from = (s.prev.hands[i] || 0) > hd.cards.length ? 0 : (s.prev.hands[i] || 0);
      const bust = hd.total > 21;
      s.player.append(h('div', { class: 'hand' + (hd.active ? ' active' : '') },
        cardsRow(hd.cards, { from }),
        h('div', null, h('span', { class: 'tot' + (bust ? ' bust' : '') }, bust ? 'Bust ' + hd.total : hd.bj ? 'Blackjack!' : (hd.soft ? 'Soft ' : '') + hd.total), ' ',
          h('span', { class: 'badge' }, '🪙 ' + fmt(hd.bet) + (hd.doubled ? ' (doubled)' : ''))),
        hd.result ? h('div', null, h('span', { class: 'result-pill ' + hd.result.tag }, hd.result.text + ' · ' + sgn(hd.result.net))) : null));
    });
    s.prev = { dealer: v.dealer.cards.length, hands: v.hands.map(x => x.cards.length) };

    // --- result banner & side bets summary ---
    clear(s.banner);
    if (v.phase === 'done') {
      const net = v.hands.reduce((a, x) => a + (x.result ? x.result.net : 0), 0) + (v.sideRes || []).reduce((a, r) => a + (r.x ? r.bet * r.x : -r.bet), 0);
      s.banner.append(h('div', { class: 'banner-result ' + (net > 0 ? 'win' : net < 0 ? 'lose' : '') }, net > 0 ? 'You win ' + fmt(net) : net < 0 ? 'Dealer wins' : 'Push'));
    }
    if (v.sideRes && v.sideRes.length) s.banner.append(h('div', { class: 'center small' }, v.sideRes.map(r => h('span', { class: 'badge ' + (r.x ? 'green' : 'red'), style: { margin: '2px' }, title: r.label }, `${ctx.game.meta.sides[r.id].name}: ${r.x ? '+' + fmt(r.bet * r.x) : '−' + fmt(r.bet)}`))));

    // --- controls ---
    clear(s.controls);
    const coach = ctx.coachOn() ? v.coach : null;
    if (v.phase === 'idle' || v.phase === 'done') {
      s.controls.append(s.bet.el, s.sides.el,
        h('div', { class: 'actions', style: { width: '100%' } }, btn('Deal  ⏎', 'gold big', () => deal(ctx), { disabled: ctx.sitting })));
      ctx.setCoach(coachNode(null, v, ctx, showCount));
    } else if (v.phase === 'insurance') {
      s.controls.append(h('div', { class: 'panel', style: { background: 'rgba(0,0,0,.35)', maxWidth: '520px' } },
        h('h3', null, 'Dealer shows an Ace — insurance?'), h('p', { class: 'small' }, 'Insurance costs half your bet and pays 2:1 if the dealer has blackjack. With a blackjack of your own it is "even money".'),
        h('div', { class: 'actions' }, btn('Take insurance  Y', 'blue' + (coach && coach.best === 'take' ? ' rec' : ''), () => insure(ctx, true), { title: coach ? coach.text : 'Costs half your bet' }), btn('No thanks  N', coach && coach.best === 'decline' ? 'rec' : '', () => insure(ctx, false), { title: coach ? coach.text : '' }))));
      ctx.setCoach(coachNode(coach, v, ctx, showCount));
    } else if (v.phase === 'player') {
      const al = v.allowed || {};
      const acts = h('div', { class: 'actions' });
      if (al.draw) acts.append(btn('Deal card  ⏎', 'gold big', () => act(ctx, 'draw'), { disabled: ctx.sitting, title: 'Deal the second card to this split hand' }));
      else for (const [k, code] of Object.entries(ACT)) {
        if (al[k] === undefined) continue;
        const opt = coach && coach.options && coach.options[k];
        const isRec = coach && coach.best === code;
        acts.append(btn(`${NAMES[code]}  ${code}`, ({ H: '', S: 'red', D: 'blue', P: 'green', R: 'ghost' })[code] + (isRec ? ' rec' : ''), () => act(ctx, k), { disabled: !al[k] || ctx.sitting, title: opt ? (opt.best ? '★ Recommended: ' : 'Not recommended: ') + opt.text : '' }));
      }
      s.controls.append(acts);
      ctx.setCoach(coachNode(coach, v, ctx, showCount));
    } else {
      s.controls.append(h('p', { class: 'muted' }, 'Dealer is playing…'));
    }
  },
};

// ---------- shared-dealer table layout: dealer on top, every seat on the bottom row, my controls underneath ----------
function seatNode(name, pv, { me, focus, last, staked, onclick }) {
  const hands = pv && pv.hands && pv.hands.length ? pv.hands : null;
  return h('div', { class: 'seat' + (me ? ' me' : '') + (focus ? ' focus' : ''), onclick },
    h('div', { class: 'seat-name' }, name + (me ? ' (you)' : '')),
    hands ? h('div', { class: 'shands' }, hands.map(hd => {
      const bust = hd.total > 21;
      return h('div', { class: 'shand' + (hd.active ? ' active' : '') }, cardsRow(hd.cards, { animate: false }),
        h('div', { class: 'sline' }, h('span', { class: 'tot' + (bust ? ' bust' : '') }, bust ? 'Bust ' + hd.total : hd.bj ? 'Blackjack!' : (hd.soft ? 'Soft ' : '') + hd.total), h('span', { class: 'badge' }, '🪙 ' + fmt(hd.bet) + (hd.doubled ? '×2' : ''))),
        hd.result ? h('div', { class: 'result-pill ' + hd.result.tag }, hd.result.text + ' · ' + sgn(hd.result.net)) : null);
    }))
      : h('div', { class: 'muted small', style: { padding: '14px 6px' } }, staked ? `✔ bet ${fmt(staked)} placed` : last ? h('span', { class: last.net > 0 ? 'win' : last.net < 0 ? 'lose' : '' }, 'last ' + sgn(last.net)) : 'waiting for a bet…'));
}
function renderTable(ctx, snap, spectator) {
  const s = ctx._bj; if (!s) return;
  const rd = snap.rd, me = state.user.display, v = ctx.view;
  const showCount = (state.user.settings || {}).showCount !== false;
  clear(s.hud);
  s.hud.append(h('div', { class: 'stat' }, h('b', null, fmt(rd.count.left)), h('span', null, 'cards in shoe')));
  if (showCount) s.hud.append(
    h('div', { class: 'stat', title: 'Hi-Lo: 2-6 = +1, 7-9 = 0, 10-A = −1' }, h('b', { class: rd.count.rc > 0 ? 'win' : rd.count.rc < 0 ? 'lose' : '' }, (rd.count.rc > 0 ? '+' : '') + rd.count.rc), h('span', null, 'running count')),
    h('div', { class: 'stat', title: 'running count ÷ decks left' }, h('b', { class: rd.count.tc >= 2 ? 'win' : rd.count.tc <= -2 ? 'lose' : '' }, (rd.count.tc > 0 ? '+' : '') + rd.count.tc.toFixed(1)), h('span', null, 'true count')));
  s.notice.textContent = rd.notice || '';
  // dealer (one hand for the whole table)
  const dc = rd.dealer.cards, from = dc.length < (s.prevDealer || 0) ? 0 : (s.prevDealer || 0);
  clear(s.dealer);
  if (dc.length) {
    s.dealer.append(h('div', { class: 'zone-title' }, 'Dealer'), cardsRow(dc, { from, animate: !spectator || from > 0 }),
      h('div', { class: 'center' }, h('span', { class: 'hand' }, h('span', { class: 'tot' + (rd.dealer.total > 21 ? ' bust' : '') }, rd.dealer.total > 21 ? 'Bust ' + rd.dealer.total : (rd.dealer.soft ? 'Soft ' : '') + rd.dealer.total))));
    if (dc.length > (s.prevDealer || 0)) for (let i = 0; i < Math.min(dc.length - (s.prevDealer || 0), 4); i++) setTimeout(() => sfx.play('card'), i * 110);
  } else s.dealer.append(h('div', { class: 'zone-title' }, 'Dealer stands on all 17s · Blackjack pays 3:2 · Insurance pays 2:1'), h('div', { class: 'center muted small' }, snap.phase === 'betting' ? 'Place your bets — everyone is dealt together' : 'Dealing…'));
  s.prevDealer = dc.length;
  // seats
  const names = rd.order && rd.order.length ? rd.order : snap.players.filter(p => !p.banker).map(p => p.name);
  if (spectator && !s.focus) s.focus = names[0];
  if (spectator && snap.bot && !s.manualFocus && rd.focus && names.includes(rd.focus)) s.focus = rd.focus;      // follow the bot that is acting
  clear(s.player); s.player.className = 'seats';
  for (const n of names) {
    const pl = snap.players.find(p => p.name === n) || {};
    const mine = n === me && !spectator;
    const pv = mine && v && v.hands && v.hands.length && rd.order.includes(me) ? v : (snap.pviews || {})[n];
    s.player.append(seatNode(n, pv, { me: mine, focus: spectator && s.focus === n, last: pl.last, staked: pl.staked, onclick: spectator ? () => { s.focus = n; s.manualFocus = true; renderTable(ctx, snap, true); } : null }));
  }
  clear(s.banner); clear(s.controls);
  const myPv = spectator ? (snap.pviews || {})[s.focus] : v;
  const coach = myPv && ctx.coachOn() ? myPv.coach : null;
  if (spectator) {                                       // watchers (bot tables) can follow the coach on any seat
    if (snap.bot) s.banner.append(h('div', { class: 'center small' }, btn(s.manualFocus ? '🎯 Follow the action' : '🎯 Following the action', 'xs' + (s.manualFocus ? '' : ' on'), () => { s.manualFocus = !s.manualFocus; renderTable(ctx, snap, true); }, { title: 'The coach panel jumps to whichever bot is about to move' })));
    if (snap.bot && myPv) ctx.setCoach(coachNode(coach, myPv, ctx, false)); else ctx.setCoach(h('p', { class: 'muted' }, 'Watching the table.'));
    return;
  }
  const inRound = rd.order.includes(me), mePl = snap.players.find(p => p.name === me) || {};
  if (snap.phase === 'betting') {
    if (mePl.staked > 0) s.controls.append(h('p', { class: 'center' }, `✔ Your bet of ${fmt(mePl.staked)} is in — the round starts when everyone has bet or the timer ends.`));
    else if (mePl.out) s.controls.append(h('p', { class: 'muted center' }, 'You\'re sitting out this round.'));
    else s.controls.append(s.bet.el, s.sides.el, h('div', { class: 'actions', style: { width: '100%' } }, btn('Place bet  ⏎', 'gold big', () => placeBet(ctx), { disabled: ctx.sitting })));
    ctx.setCoach(coachNode(null, v || { advice: null }, ctx, showCount && !!(v && v.advice)));
  } else if (!inRound) {
    s.controls.append(h('p', { class: 'muted center' }, 'Round in progress — you\'ll be dealt in next round.'));
  } else if (v && v.phase === 'insurance' && snap.phase === 'insurance') {
    s.controls.append(h('div', { class: 'panel', style: { background: 'rgba(0,0,0,.35)', maxWidth: '520px' } },
      h('h3', null, 'Dealer shows an Ace — insurance?'), h('p', { class: 'small' }, 'Costs half your bet, pays 2:1 if the dealer has blackjack. Everyone decides at once.'),
      h('div', { class: 'actions' }, btn('Take insurance  Y', 'blue' + (coach && coach.best === 'take' ? ' rec' : ''), () => insure(ctx, true)), btn('No thanks  N', coach && coach.best === 'decline' ? 'rec' : '', () => insure(ctx, false)))));
    ctx.setCoach(coachNode(coach, v, ctx, showCount));
  } else if (v && v.phase === 'player' && snap.phase === 'play') {
    const al = v.allowed || {}, acts = h('div', { class: 'actions' });
    if (al.draw) acts.append(btn('Deal card  ⏎', 'gold big', () => act(ctx, 'draw'), { title: 'Deal the second card to this split hand' }));
    else for (const [k, code] of Object.entries(ACT)) {
      if (al[k] === undefined) continue;
      const opt = coach && coach.options && coach.options[k];
      acts.append(btn(`${NAMES[code]}  ${code}`, ({ H: '', S: 'red', D: 'blue', P: 'green', R: 'ghost' })[code] + (coach && coach.best === code ? ' rec' : ''), () => act(ctx, k), { disabled: !al[k], title: opt ? (opt.best ? '★ Recommended: ' : 'Not recommended: ') + opt.text : '' }));
    }
    s.controls.append(acts);
    ctx.setCoach(coachNode(coach, v, ctx, showCount));
  } else if (v && v.phase === 'done') {
    const net = v.hands.reduce((a, x) => a + (x.result ? x.result.net : 0), 0) + (v.sideRes || []).reduce((a, r) => a + (r.x ? r.bet * r.x : -r.bet), 0);
    s.banner.append(h('div', { class: 'banner-result ' + (net > 0 ? 'win' : net < 0 ? 'lose' : '') }, net > 0 ? 'You win ' + fmt(net) : net < 0 ? 'Dealer wins' : 'Push'));
  } else s.controls.append(h('p', { class: 'muted center' }, snap.phase === 'play' || snap.phase === 'insurance' ? 'Waiting for the other players…' : 'Dealer is playing…'));
}
async function placeBet(ctx) {
  const s = ctx._bj, r = await ctx.primary('deal', { bet: s.bet.get(), sides: s.sides.get() });
  if (r) sfx.play('chips');
}

async function deal(ctx) {
  const s = ctx._bj;
  s.prev = { dealer: 0, hands: [] };
  const sides = s.sides.get();
  const r = await ctx.call('deal', { bet: s.bet.get(), sides });
  if (r) sfx.play('chips');
}
const act = async (ctx, name) => { const r = await ctx.call(name, {}); if (r && name === 'double') sfx.play('chip'); };
const insure = (ctx, take) => ctx.call('insurance', { take });

function coachNode(coach, v, ctx, showCount) {
  const out = h('div', { class: 'coach-content' });
  if (!coach) {
    out.append(h('p', null, 'Place a bet and deal. During your hand the coach explains the best play and why — hover any action button for a quick tip.'));
    if (showCount && v.advice) out.append(h('div', { class: 'coach-best' }, h('b', null, '🃏 Bet sizing by count'), h('p', { class: 'small', style: { margin: '4px 0 0' } }, v.advice.text)));
    out.append(h('p', { class: 'muted small' }, 'Shortcuts: H hit · S stand · D double · P split · R surrender · Enter deal'));
    return out;
  }
  if (coach.options === undefined) {   // insurance advice
    out.append(h('div', { class: 'coach-best' }, h('b', null, coach.best === 'take' ? '★ Take insurance' : '★ Decline insurance')), h('p', null, coach.text));
    return out;
  }
  out.append(h('div', { class: 'coach-best' }, h('div', { class: 'small muted' }, coach.title), h('b', null, '★ Best play: ' + coach.bestName), h('p', { class: 'small', style: { margin: '4px 0 0' } }, coach.options && Object.values(coach.options).find(o => o.best) ? Object.values(coach.options).find(o => o.best).text : (coach.text || ''))));
  if (coach.deviation) out.append(h('div', { class: 'coach-dev' }, h('b', null, '🔵 Count says: ' + coach.deviation.name), h('div', null, coach.deviation.text)));
  for (const [k, o] of Object.entries(coach.options || {})) {
    if (o.best) continue;
    out.append(h('div', { class: 'coach-opt no' }, h('b', null, NAMES[ACT[k]] + ' — not recommended'), o.text));
  }
  if (coach.bust != null) out.append(h('p', { class: 'muted small' }, `Dealer busts ~${coach.bust}% with this upcard.`));
  return out;
}
