// Texas Hold'em client: practice launcher (solo page) + the table (seats around the felt, your private cards, action bar, coach).
import { h, clear, card, btn, fmt, toast, store } from '../ui.js';
import { api, state } from '../api.js';
import { sfx } from '../sfx.js';
import { go } from '../app.js';

const BLINDS = [{ sb: 5, bb: 10 }, { sb: 10, bb: 20 }, { sb: 25, bb: 50 }, { sb: 50, bb: 100 }];
const STREET = { pre: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };

export default {
  init(ctx) {
    const s = ctx._pk = { keys: null, tick: null, prevBoard: 0, prevCards: {} };
    s.root = h('div', { class: 'pk' });
    ctx.stage.replaceChildren(s.root);
    s.keys = e => {
      if (ctx.readonly || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const snap = ctx.table && ctx.table.snap; const lg = snap && snap.pk && snap.pk.you && snap.pk.you.legal; if (!lg) return;
      const k = e.key.toLowerCase();
      if (k === 'f') { e.preventDefault(); act(ctx, 'fold'); }
      else if (k === 'c' || k === ' ') { e.preventDefault(); act(ctx, lg.check ? 'check' : 'call'); }
    };
    document.addEventListener('keydown', s.keys);
  },
  destroy(ctx) { const s = ctx._pk; if (s) { document.removeEventListener('keydown', s.keys); clearInterval(s.tick); } },
  // solo page: the practice launcher (the table itself is rendered from table snapshots)
  render(v, ctx) {
    if (ctx.table && ctx.table.snap && ctx.table.snap.mode === 'poker') return renderTable(ctx, ctx.table.snap, false);
    launcher(ctx);
    ctx.setCoach(h('div', { class: 'coach-content' }, h('p', null, 'At the table the coach shows your equity (how often your hand wins), the pot odds, and whether to fold, call or raise — and why.'),
      h('p', { class: 'muted small' }, 'Equity is estimated against random hands, so treat it as a guide, not gospel.')));
  },
  onTable(ctx, snap) { renderTable(ctx, snap, false); },
  spectate(ctx, snap) { if (!ctx._pk) { ctx.readonly = true; this.init(ctx); } renderTable(ctx, snap, true); },
};

function launcher(ctx) {
  const s = ctx._pk; const saved = store.get('holdem.practice', { bots: 3, bb: 10, buy: 100 });
  let bots = saved.bots, bb = saved.bb, buy = saved.buy;
  const botsOut = h('b', null, String(bots)), buyOut = h('b', null, '');
  const bSel = h('select', { 'aria-label': 'Blinds' }, BLINDS.map(b => h('option', { value: b.bb, selected: b.bb === bb }, `${b.sb} / ${b.bb}`)));
  const bots_ = h('input', { type: 'range', min: 1, max: 7, step: 1, value: bots, 'aria-label': 'Number of bots', style: { padding: 0 } });
  const buy_ = h('input', { type: 'range', min: 20, max: 200, step: 10, value: buy, 'aria-label': 'Buy-in in big blinds', style: { padding: 0 } });
  const upd = () => { bots = Number(bots_.value); bb = Number(bSel.value); buy = Number(buy_.value); botsOut.textContent = bots + (bots === 1 ? ' bot (heads-up)' : ' bots'); buyOut.textContent = `${buy} big blinds = ${fmt(buy * bb)} demo chips`; };
  bots_.oninput = buy_.oninput = bSel.onchange = upd; upd();
  clear(s.root);
  s.root.append(h('div', { class: 'pk-launch' },
    h('h2', null, '♠️ Practice Hold\'em against bots'),
    h('p', { class: 'muted' }, 'Pick how many bots sit down with you. Practice uses free demo chips — nothing touches your real balance, stats or leaderboards. Your cards stay private and the bots play at different styles (tight, solid, loose, aggressive).'),
    h('div', { class: 'pk-form' },
      h('label', null, 'Bot opponents: ', botsOut), bots_,
      h('label', null, 'Blinds (small / big)'), bSel,
      h('label', null, 'Buy-in: ', buyOut), buy_),
    h('div', { class: 'actions' }, btn('▶ Start practice game', 'gold big', async () => {
      store.set('holdem.practice', { bots, bb, buy });
      try { const r = await api('/table', { game: 'holdem', bots, blinds: { bb }, buyin: buy * bb }); sfx.play('join'); go('#/t/' + r.table.code); }
      catch (e) { toast(e.message, 'bad', 5000); }
    })),
    h('p', { class: 'muted small' }, 'Want real people? Use "Public table" (needs at least two players) or "Play with friends" above.')));
}

const cardNode = (c, cls) => { const n = c ? card(c, { animate: false }) : card(null); n.classList.add('pk-card'); if (cls) n.classList.add(cls); return n; };

function seatPositions(n, meIdx) {
  // spread seats on an ellipse with "me" at the bottom centre
  return Array.from({ length: n }, (_, i) => { const k = (i - meIdx + n) % n; const a = Math.PI / 2 + (k / n) * 2 * Math.PI; return { x: 50 + 40 * Math.cos(a), y: 50 + 36 * Math.sin(a) }; });
}

function renderTable(ctx, snap, spectator) {
  const s = ctx._pk; if (!s || !snap.pk) return;
  const pk = snap.pk, me = state.user.display, seats = pk.seats.slice().sort((a, b) => a.seat - b.seat);
  const meIdx = Math.max(0, seats.findIndex(x => x.name === me));
  const pos = seatPositions(seats.length || 1, spectator ? 0 : meIdx);
  const offset = (snap.now || Date.now()) - Date.now();
  clearInterval(s.tick);

  // ---- board + pot ----
  const board = h('div', { class: 'pk-board' }, pk.board.length ? pk.board.map(c => cardNode(c)) : h('span', { class: 'muted small' }, pk.state === 'hand' || pk.state === 'between' ? '' : ''));
  for (let i = pk.board.length; i < 5 && (pk.state === 'hand' || pk.state === 'between'); i++) board.append(h('div', { class: 'pk-slot' }));
  if (pk.board.length > s.prevBoard) for (let i = 0; i < pk.board.length - s.prevBoard; i++) setTimeout(() => sfx.play('card'), i * 120);
  s.prevBoard = pk.board.length;
  const pot = h('div', { class: 'pk-pot' }, pk.pot ? h('span', { class: 'badge gold' }, '🪙 Pot ' + fmt(pk.pot)) : null, pk.street ? h('span', { class: 'muted small' }, STREET[pk.street] || '') : null);
  const status = h('div', { class: 'pk-status' });
  const center = h('div', { class: 'pk-center' }, pot, board, status);

  // ---- seats ----
  const seatEls = seats.map((st, i) => {
    const mine = st.name === me && !spectator, acting = pk.acting === st.name;
    const cs = st.cards.length ? h('div', { class: 'pk-hole' }, st.cards.map(c => cardNode(c, mine ? 'mine' : ''))) : (st.folded ? h('div', { class: 'pk-folded' }, 'folded') : h('div', { class: 'pk-hole empty' }));
    const el = h('div', { class: 'pk-seat' + (mine ? ' me' : '') + (acting ? ' acting' : '') + (st.folded ? ' folded' : '') + (st.out || !st.online ? ' away' : '') + (st.won ? ' won' : ''), style: { '--x': pos[i].x + '%', '--y': pos[i].y + '%' } },
      st.button ? h('span', { class: 'pk-dealer', title: 'Dealer button' }, 'D') : null,
      cs,
      h('div', { class: 'pk-plate' }, h('div', { class: 'pk-name' }, (st.bot ? '' : '') + st.name + (mine ? ' (you)' : '')), h('div', { class: 'pk-stack' }, '🪙 ' + fmt(st.stack) + (st.allIn ? ' · ALL-IN' : ''))),
      st.bet ? h('div', { class: 'pk-bet' }, fmt(st.bet)) : null,
      st.won ? h('div', { class: 'pk-win' }, '+' + fmt(st.won)) : null,
      st.handName ? h('div', { class: 'pk-hand' }, st.handName) : (st.last && pk.state === 'hand' ? h('div', { class: 'pk-last' }, st.last) : null));
    return el;
  });
  const ring = h('div', { class: 'pk-ring' }, ...seatEls, center);

  // ---- my controls + coach ----
  const ctl = h('div', { class: 'pk-controls' });
  const you = pk.you;
  if (!spectator) {
    const inSeat = seats.find(x => x.name === me);
    if (you.legal) {
      const lg = you.legal, myBet = inSeat ? inSeat.bet : 0;
      const raiseIn = h('input', { type: 'number', min: lg.raise ? lg.raise.min : 0, max: lg.raise ? lg.raise.max : 0, value: lg.raise ? lg.raise.min : 0, 'aria-label': 'Raise to', style: { width: '110px' } });
      const row = h('div', { class: 'actions' }, btn('Fold  F', 'red', () => act(ctx, 'fold')), btn(lg.check ? 'Check  C' : `Call ${fmt(lg.call)}${lg.call < lg.toCall ? ' (all-in)' : ''}  C`, 'green big' + (you.advice && (you.advice.rec === 'call' || you.advice.rec === 'check') ? ' rec' : ''), () => act(ctx, lg.check ? 'check' : 'call')));
      ctl.append(row);
      if (lg.raise) {
        const setTo = v => { raiseIn.value = Math.max(lg.raise.min, Math.min(lg.raise.max, Math.round(v))); };
        const pot2 = pk.pot + lg.call;
        ctl.append(h('div', { class: 'pk-raise' },
          h('span', { class: 'small muted' }, lg.toCall ? 'Raise to' : 'Bet'), raiseIn,
          btn('Min', 'xs', () => setTo(lg.raise.min)), btn('½ pot', 'xs', () => setTo(pk.curBet + pot2 / 2)), btn('¾', 'xs', () => setTo(pk.curBet + pot2 * .75)), btn('Pot', 'xs', () => setTo(pk.curBet + pot2)), btn('All-in', 'xs', () => setTo(lg.raise.max)),
          btn(lg.toCall ? 'Raise' : 'Bet', 'gold' + (you.advice && you.advice.rec === 'raise' ? ' rec' : ''), () => act(ctx, 'raise', Number(raiseIn.value)))));
      }
    } else if (inSeat && inSeat.stack <= 0 && !inSeat.inHand) {
      ctl.append(h('div', { class: 'actions' }, btn('💰 Rebuy ' + fmt(pk.minBuy * 5), 'gold', async () => { try { await api(`/table/${ctx.table.code}/rebuy`, { amount: pk.minBuy * 5 }); } catch (e) { toast(e.message, 'bad'); } })));
    } else if (inSeat && !inSeat.inHand && inSeat.stack < pk.maxBuy && pk.state !== 'hand') {
      ctl.append(h('div', { class: 'actions' }, btn('➕ Add chips', 'xs', async () => { try { await api(`/table/${ctx.table.code}/rebuy`, { amount: pk.maxBuy }); } catch (e) { toast(e.message, 'bad'); } })));
    }
    // coach panel
    if (you.legal && you.advice) {
      const a = you.advice;
      ctx.setCoach(h('div', { class: 'coach-content' },
        h('div', { class: 'coach-best' }, h('div', { class: 'small muted' }, `Your hand: ${a.hand}${a.shape.length ? ' · ' + a.shape.join(', ') : ''}`), h('b', null, '★ Suggested: ' + ({ fold: 'Fold', call: 'Call', check: 'Check', raise: you.legal.toCall ? 'Raise' : 'Bet' })[a.rec]), h('p', { class: 'small', style: { margin: '4px 0 0' } }, a.why)),
        h('div', { class: 'pk-eq' }, h('div', { class: 'pk-eq-bar' }, h('i', { style: { width: Math.round(a.eq * 100) + '%' } })), h('span', { class: 'small' }, `Equity ${Math.round(a.eq * 100)}%` + (a.call ? ` · needs ${Math.round(a.odds * 100)}%` : ''))),
        h('p', { class: 'muted small' }, `Pot ${fmt(a.pot)} · ${a.opp} opponent${a.opp > 1 ? 's' : ''} still in. Equity is simulated against random hands.`)));
    } else ctx.setCoach(h('div', { class: 'coach-content' }, h('p', null, you.hole && you.hole.length ? 'Waiting for your turn — the coach will show your equity, pot odds and a suggestion.' : 'Sit tight — you\'ll be dealt in next hand.'), h('p', { class: 'muted small' }, 'Keys: F = fold · C = check/call.')));
  } else ctx.setCoach(h('p', { class: 'muted' }, 'Watching the table — hole cards are private.'));

  // ---- status line (with a live countdown) ----
  const paint = () => {
    const left = pk.state === 'hand' || pk.state === 'starting' ? Math.max(0, Math.ceil((snap.deadline - Date.now() - offset) / 1000)) : null;
    let t;
    if (pk.needPlayers && pk.state !== 'hand' && pk.state !== 'between') t = '⏳ Waiting for another player to sit down (a hand needs at least two).';
    else if (pk.state === 'starting') t = `🃏 Next hand in ${left}s…`;
    else if (pk.state === 'hand') t = pk.acting === me && !spectator ? `🟢 Your turn — ${left}s` : `Waiting for ${pk.acting || '…'} — ${left}s`;
    else if (pk.state === 'between' && pk.result) t = pk.result.winners.length ? '🏆 ' + pk.result.winners.map(w => `${w.name} wins ${fmt(w.amount)}${w.hand ? ' (' + w.hand + ')' : ''}`).join(' · ') : 'Hand over';
    else t = 'Waiting…';
    status.textContent = t; status.className = 'pk-status' + (pk.acting === me && !spectator && pk.state === 'hand' ? ' mine' : '');
  };
  paint(); if (pk.state === 'hand' || pk.state === 'starting') s.tick = setInterval(paint, 250);

  const log = h('div', { class: 'pk-log' }, (pk.log || []).slice(-5).map(l => h('div', null, logLine(l))));
  clear(s.root); s.root.append(ring, ctl, log);
  s.root.classList.toggle('spectating', !!spectator);
}
function logLine(l) {
  const who = l.who || '';
  switch (l.t) {
    case 'blinds': return `Blinds ${l.sb}/${l.bb}`;
    case 'fold': return `${who} folds`; case 'check': return `${who} checks`; case 'call': return `${who} calls ${fmt(l.amt)}`;
    case 'bet': return `${who} bets ${fmt(l.to)}${l.allIn ? ' (all-in)' : ''}`; case 'raise': return `${who} raises to ${fmt(l.to)}${l.allIn ? ' (all-in)' : ''}`;
    case 'street': return `— ${STREET[l.street]} —`;
    default: return l.t;
  }
}
async function act(ctx, action, to) {
  try { await api(`/table/${ctx.table.code}/pk`, { action, to }); sfx.play(action === 'fold' ? 'click' : 'chip'); } catch (e) { toast(e.message, 'bad'); }
}
