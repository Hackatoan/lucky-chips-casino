// Baccarat client: 12 bets on one board, animated hands, road (bead plate), tableau explanations.
import { h, clear, fmt, sgn, cardsRow, btn, resultBanner } from '../ui.js';
import { betBoard } from '../betboard.js';
import { sfx } from '../sfx.js';
import { sleep } from '../ui.js';
import { animOn } from '../fx.js';

const GROUPS = [{ id: 'main', label: 'Main bets' }, { id: 'pairs', label: 'Pair bets' }, { id: 'bonus', label: 'Bonus bets' }];
const GROUP_OF = { player: 'main', banker: 'main', tie: 'main', pp: 'pairs', bp: 'pairs', either: 'pairs', perfect: 'pairs', dragonP: 'bonus', dragonB: 'bonus', lucky6: 'bonus', panda8: 'bonus', dragon7: 'bonus' };
const CLS = { player: 'blue', banker: 'red', tie: 'green' };
const roadChip = r => h('span', { class: 'road ' + ({ P: 'p', B: 'b', T: 't' })[r] }, r);

export default {
  init(ctx) {
    const s = ctx._bac = { shown: '' };
    const defs = ctx.game.meta.bets;
    s.board = betBoard({ storeKey: 'baccarat', groups: GROUPS, cols: 3, rows: Object.entries(defs).map(([id, d]) => ({ id, name: d.name, pays: d.pays.split(' · ')[0].split(' minus')[0], edge: d.edge, desc: d.desc, step: d.step, group: GROUP_OF[id], cls: CLS[id] })) });
    s.road = h('div', { class: 'road-strip' });
    s.table = h('div', { class: 'bac-table' });
    s.msg = h('div', { class: 'center' });
    s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(h('div', { class: 'zone-title' }, 'Punto Banco · 8 decks'), s.table, s.msg, s.road, s.controls);
  },
  render(v, ctx) {
    const s = ctx._bac;
    clear(s.road); (v.road || []).slice(-30).forEach(r => s.road.append(roadChip(r)));
    if (v.last && JSON.stringify(v.last) !== s.shown) { s.shown = JSON.stringify(v.last); drawHands(s, v.last, true); }
    else if (!v.last && !s.table.firstChild) s.table.append(h('p', { class: 'center muted' }, 'Place your bets — Banker is the best main bet (1.06% edge).'));
    clear(s.controls);
    if (!ctx.readonly) {
      const tab = ctx.table && ctx.table.role === 'player';
      s.msg.textContent = v.pending ? `✔ Bets placed (${fmt(v.pending.staked)}) — waiting for the round…` : '';
      s.controls.append(s.board.el, h('div', { class: 'actions', style: { width: '100%' } }, btn(tab ? 'Place bets' : 'Deal', 'gold big', () => deal(ctx), { disabled: !!v.pending || ctx.sitting })));
    }
    ctx.setCoach(h('div', { class: 'coach-content' },
      h('div', { class: 'coach-best' }, h('b', null, '★ Best bet: Banker'), h('p', { class: 'small', style: { margin: '4px 0 0' } }, 'Banker 1.06% (after 5% commission) · Player 1.24% · Tie 14.4%. Never bet both Player and Banker — they cancel out and you pay commission for nothing.')),
      h('div', { class: 'coach-opt no' }, h('b', null, 'About the road'), 'The bead road / history strip above does not predict the next hand. Every hand is dealt from a shuffled 8-deck shoe — streaks are just what randomness looks like.'),
      h('div', { class: 'coach-opt' }, h('b', null, 'Side bets'), 'Dragon Bonus is the cheapest side bet (~2.5–5%). Pairs, Lucky 6 and Panda 8 cost 10–17%.'),
      h('p', { class: 'muted small' }, 'Tip: right-click (or long-press) a bet to clear it.')));
  },
  async onResult(ctx, data) {
    const s = ctx._bac; if (!s) return;
    const o = data.outcome; if (!o || !o.player) return;
    await animateHands(s, o);
  },
  spectate(ctx, snap) {
    if (!ctx._bac) { this.init(ctx); ctx.stage.prepend(h('div', { class: 'spectator-banner' }, '👁 Watching table ' + snap.code)); ctx._bac.controls.remove(); }
    const s = ctx._bac;
    clear(s.road); ((snap.mem && snap.mem.road) || []).slice(-30).forEach(r => s.road.append(roadChip(r)));
    if (snap.outcome && JSON.stringify(snap.outcome) !== s.shown && snap.phase !== 'results') { s.shown = JSON.stringify(snap.outcome); drawHands(s, snap.outcome, true); }
    s.msg.textContent = snap.phase === 'results' ? `Round ${snap.round - 1} complete` : snap.deadline ? `Round ${snap.round}: bets are in` : 'Waiting for bets…';
  },
};
function drawHands(s, o, instant) {
  clear(s.table);
  const hand = (name, cards, total, cls, win) => h('div', { class: 'bac-hand ' + cls + (win ? ' win' : '') }, h('div', { class: 'zone-title' }, name), cardsRow(cards, { from: instant ? 0 : 999 }), h('div', { class: 'center' }, h('span', { class: 'hand' }, h('span', { class: 'tot' }, total))));
  s.table.append(hand('Player', o.player, o.pt, 'p', o.winner === 'player'), hand('Banker', o.banker, o.bt, 'b', o.winner === 'banker'));
  s.msg.replaceChildren(h('b', { class: 'gold' }, o.winner === 'tie' ? 'Tie!' : (o.winner === 'player' ? 'Player' : 'Banker') + ' wins ' + Math.max(o.pt, o.bt) + ' – ' + Math.min(o.pt, o.bt)), o.notes && o.notes.length ? h('div', { class: 'muted small' }, o.notes.join(' ')) : null);
}
async function animateHands(s, o) {
  clear(s.table);
  const pe = h('div', { class: 'bac-hand p' }, h('div', { class: 'zone-title' }, 'Player')), be = h('div', { class: 'bac-hand b' }, h('div', { class: 'zone-title' }, 'Banker'));
  s.table.append(pe, be);
  const pc = h('div', { class: 'cards' }), bc = h('div', { class: 'cards' }); pe.append(pc); be.append(bc);
  const { card } = await import('../ui.js');
  const order = [['p', 0], ['b', 0], ['p', 1], ['b', 1], ['p', 2], ['b', 2]];
  for (const [who, i] of order) {
    const cards = who === 'p' ? o.player : o.banker; if (!cards[i]) continue;
    (who === 'p' ? pc : bc).append(card(cards[i], { delay: 0 })); sfx.play('card'); await sleep(animOn() ? 550 : 0);
  }
  drawHands(s, o, false);
  sfx.play(o.winner === 'tie' ? 'push' : 'chip');
}
async function deal(ctx) {
  const s = ctx._bac; const bets = s.board.get();
  if (!Object.keys(bets).length) return ctx.toast('Place a bet first.', 'bad');
  s.board.remember();
  const solo = !(ctx.table && ctx.table.role === 'player');
  const r = await ctx.primary('deal', { bets });
  if (r && solo) { s.board.clear(); if (r.view && r.view.last) { s.shown = JSON.stringify(r.view.last); await animateHands(s, r.view.last); } }
}
