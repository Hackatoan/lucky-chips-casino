'use strict';
const C = require('../lib/cards');
const R = require('../lib/rng');
const an = require('../lib/an');
const { fail } = require('../lib/engine');

const DECKS = 8;
const MAX_BET = 5000;
const bv = c => { const r = c % 13; return r === 12 ? 1 : r >= 8 ? 0 : r + 2; };
const total = cs => cs.reduce((s, c) => s + bv(c), 0) % 10;
const rankOf = c => c % 13;

// ---- bet catalogue (id, label, pays, edge) ----
const BETS = {
  player: { name: 'Player', pays: '1:1', edge: 0.0124, main: true, min: 1, step: 1, desc: 'The Player hand finishes closer to 9.' },
  banker: { name: 'Banker', pays: '1:1 minus 5% commission', edge: 0.0106, main: true, min: 20, step: 20, desc: 'The Banker hand finishes closer to 9. Best bet on the table. Bets in multiples of 20 so the 5% commission is a whole number.' },
  tie: { name: 'Tie', pays: '8:1', edge: 0.1436, main: true, min: 1, step: 1, desc: 'Both hands finish on the same total. Player/Banker bets push on a tie.' },
  pp: { name: 'Player Pair', pays: '11:1', edge: 0.1040, min: 1, step: 1, desc: 'Player\'s first two cards are a pair.' },
  bp: { name: 'Banker Pair', pays: '11:1', edge: 0.1040, min: 1, step: 1, desc: 'Banker\'s first two cards are a pair.' },
  either: { name: 'Either Pair', pays: '5:1', edge: 0.1350, min: 1, step: 1, desc: 'Either hand starts with a pair.' },
  perfect: { name: 'Perfect Pair', pays: '25:1 (200:1 if both)', edge: 0.0790, min: 1, step: 1, desc: 'A hand starts with a pair of the same rank AND suit.' },
  dragonP: { name: 'Dragon Bonus — Player', pays: 'Natural win 1:1 (8-pt margin 3:1, 9-pt 10:1) · other wins by 4→1:1, 5→2:1, 6→4:1, 7→6:1', edge: 0.0250, min: 1, step: 1, desc: 'Player wins by a natural (8/9) or by a big margin. Natural tie pushes.' },
  dragonB: { name: 'Dragon Bonus — Banker', pays: 'Natural win 1:1 (8-pt margin 4:1, 9-pt 10:1) · other wins by 4→1:1, 5→2:1, 6→4:1, 7→6:1', edge: 0.0492, min: 1, step: 1, desc: 'Banker wins by a natural or by a big margin. Natural tie pushes.' },
  lucky6: { name: 'Lucky 6', pays: '12:1 (2 cards) · 20:1 (3 cards)', edge: 0.1707, min: 1, step: 1, desc: 'Banker wins with a total of exactly 6.' },
  panda8: { name: 'Panda 8', pays: '25:1', edge: 0.1061, min: 1, step: 1, desc: 'Player wins with a three-card total of 8.' },
  dragon7: { name: 'Dragon 7', pays: '40:1', edge: 0.0705, min: 1, step: 1, desc: 'Banker wins with a three-card total of 7.' },
};
// Dragon Bonus pays by winning margin. (Published tables vary by casino; these were tuned by simulation to keep
// the house edge in a realistic range — see test/baccarat.sides.js.)
const NONNAT_PAYS = { 4: 1, 5: 2, 6: 4, 7: 6 };                 // non-natural win by this margin (needs margin >= 4)
const NAT_PAYS = { player: { 8: 3, 9: 10 }, banker: { 8: 4, 9: 10 } };   // natural win by 8/9; smaller natural margins pay 1:1

function dealRound(holder) {
  if (!holder.shoe || holder.shoe.length < 20) { holder.shoe = C.newShoe(DECKS); holder.reshuffled = true; }
  const pop = () => holder.shoe.pop();
  const P = [pop()], Bk = [];
  Bk.push(pop()); P.push(pop()); Bk.push(pop());
  let pt = total(P), bt = total(Bk), pThird = null;
  const notes = [];
  const natural = pt >= 8 || bt >= 8;
  if (natural) notes.push(`Natural: ${pt >= 8 && bt >= 8 ? 'both hands' : pt >= 8 ? 'Player' : 'Banker'} showed 8 or 9, so no more cards are drawn.`);
  else {
    if (pt <= 5) { pThird = pop(); P.push(pThird); pt = total(P); notes.push(`Player had ${total(P.slice(0, 2))} (0–5), so Player draws a third card.`); }
    else notes.push(`Player stands on ${pt} (6 or 7).`);
    const b2 = total(Bk);
    let draw;
    if (pThird === null) { draw = b2 <= 5; notes.push(draw ? `Player stood, so Banker (${b2}) draws on 0–5.` : `Player stood, so Banker stands on ${b2} (6–7).`); }
    else {
      const x = bv(pThird);
      if (b2 <= 2) draw = true;
      else if (b2 === 3) draw = x !== 8;
      else if (b2 === 4) draw = x >= 2 && x <= 7;
      else if (b2 === 5) draw = x >= 4 && x <= 7;
      else if (b2 === 6) draw = x === 6 || x === 7;
      else draw = false;
      notes.push(`Banker has ${b2} and Player's third card was worth ${x}: Banker ${draw ? 'draws' : 'stands'} (tableau).`);
    }
    if (draw) { Bk.push(pop()); bt = total(Bk); }
  }
  const winner = pt > bt ? 'player' : bt > pt ? 'banker' : 'tie';
  const pair = h => rankOf(h[0]) === rankOf(h[1]);
  const perfectPair = h => pair(h) && C.suit(h[0]) === C.suit(h[1]);
  return {
    player: P, banker: Bk, pt, bt, winner, notes,
    pPair: pair(P.slice(0, 2)), bPair: pair(Bk.slice(0, 2)), pPerfect: perfectPair(P.slice(0, 2)), bPerfect: perfectPair(Bk.slice(0, 2)),
    natural,
  };
}

// ---- placing & settling ----
function placeBets(ctx, body) {
  const noComm = ctx.opt('commission') === 'none';
  const raw = body.bets || {};
  const bets = {};
  let totalBet = 0;
  for (const [id, d] of Object.entries(BETS)) {
    if (!raw[id]) continue;
    bets[id] = ctx.int(raw[id], { min: d.min, max: MAX_BET, step: d.step, label: d.name });
    totalBet += bets[id];
  }
  if (!totalBet) fail('Place at least one bet first.');
  const st = ctx.state || { road: [], shoe: null };
  ctx.state = st;
  ctx.debit(totalBet);
  // smart-betting grade: judged on the house edge of what you chose (public information)
  const items = Object.keys(bets).map(id => ({ id, q: Math.max(0, 1 - (BETS[id].edge - 0.0106) / 0.14) }));
  for (const it of items) ctx.rate('bac:bet:' + it.id, it.id === 'banker' || it.id === 'player' ? 900 : 1100, it.q);
  return { bets, total: totalBet, fee: ctx.lastFee, noComm };
}

function sideMultiplier(id, o, noComm) {
  switch (id) {
    case 'pp': return o.pPair ? 11 : 0;
    case 'bp': return o.bPair ? 11 : 0;
    case 'either': return o.pPair || o.bPair ? 5 : 0;
    case 'perfect': return o.pPerfect && o.bPerfect ? 200 : o.pPerfect || o.bPerfect ? 25 : 0;
    case 'lucky6': return o.winner === 'banker' && o.bt === 6 ? (o.banker.length === 2 ? 12 : 20) : 0;
    case 'panda8': return o.winner === 'player' && o.pt === 8 && o.player.length === 3 ? 25 : 0;
    case 'dragon7': return o.winner === 'banker' && o.bt === 7 && o.banker.length === 3 ? 40 : 0;
    case 'dragonP': case 'dragonB': {
      const mine = id === 'dragonP' ? 'player' : 'banker';
      const nat = (o.pt >= 8 && o.player.length === 2) || (o.bt >= 8 && o.banker.length === 2);
      if (o.winner === 'tie') return nat && (o.pt >= 8) ? -1 : 0;      // natural tie pushes
      if (o.winner !== mine) return 0;
      const margin = Math.abs(o.pt - o.bt);
      const myTotal = mine === 'player' ? o.pt : o.bt;
      const myNatural = myTotal >= 8 && (mine === 'player' ? o.player.length : o.banker.length) === 2;
      if (myNatural) return (NAT_PAYS[mine][margin]) || 1;
      return NONNAT_PAYS[margin] || 0;
    }
  }
  return 0;
}

function settleBets(ctx, placed, o) {
  const st = ctx.state;
  const { bets, noComm } = placed;
  let returned = 0;
  const lines = [], notes = [];
  for (const [id, amt] of Object.entries(bets)) {
    const d = BETS[id];
    let ret = 0, text;
    if (id === 'player' || id === 'banker' || id === 'tie') {
      if (o.winner === 'tie' && id !== 'tie') { ret = amt; text = 'pushed on the tie'; }
      else if (o.winner === id) {
        if (id === 'player') ret = amt * 2;
        else if (noComm) ret = o.bt === 6 ? amt + amt / 2 : amt * 2;
        else ret = amt + amt - Math.round(amt * 0.05);
        if (id === 'tie') ret = amt * 9;
        text = id === 'banker' && noComm && o.bt === 6 ? 'won (Banker 6 pays 1:2)' : id === 'banker' && !noComm ? `won (5% commission: ${Math.round(amt * 0.05)})` : 'won';
      } else text = 'lost';
    } else {
      const m = sideMultiplier(id, o, noComm);
      if (m === -1) { ret = amt; text = 'pushed (natural tie)'; }
      else if (m > 0) { ret = amt * (m + 1); text = `won ${m}:1`; }
      else text = 'lost';
    }
    returned += ret;
    const net = ret - amt;
    lines.push((net > 0 ? an.good : net < 0 ? an.bad : an.info)(`${d.name} ${an.fmt(amt)} — ${text} (${an.signed(net)}) · house edge ${(d.edge * 100).toFixed(2)}%`));
  }
  ctx.credit(returned);
  const net = returned - placed.total;
  st.road.push(o.winner[0].toUpperCase()); if (st.road.length > 60) st.road.shift();

  const hand = [
    an.info(`Player: ${C.shorts(o.player)} = ${o.pt}${o.player.length === 3 ? ' (drew a third card)' : ''}`),
    an.info(`Banker: ${C.shorts(o.banker)} = ${o.bt}${o.banker.length === 3 ? ' (drew a third card)' : ''}`),
    an.info(o.winner === 'tie' ? `Tie at ${o.pt}.` : `${o.winner === 'player' ? 'Player' : 'Banker'} wins ${Math.max(o.pt, o.bt)} to ${Math.min(o.pt, o.bt)}.`),
  ];
  const why = o.notes.map(n => an.tip(n));

  const bank = [];
  const wag = placed.total;
  const exp = Object.entries(bets).reduce((s, [id, a]) => s + a * BETS[id].edge, 0);
  bank.push(an.info(`Your bets carry an average house edge of ${(exp / wag * 100).toFixed(2)}% — expected loss this round ≈ ${exp.toFixed(exp < 10 ? 2 : 1)} chips.`));
  if (bets.player && bets.banker) bank.push(an.warn('You bet both Player and Banker. They cancel out (except for the 5% commission and ties), so this just pays the house for nothing.'));
  if (bets.tie) bank.push(an.warn('Tie pays 8:1 but happens only ~9.5% of the time — a 14.4% house edge, over 10× worse than Banker.'));
  if (!bets.banker && bets.player) bank.push(an.tip('Banker is mathematically the better main bet (1.06% vs 1.24%). The 5% commission is more than paid for by the Banker\'s slight edge from the third-card rules.'));
  if (Object.keys(bets).some(id => !BETS[id].main)) bank.push(an.tip('Side bets (pairs, Dragon, Lucky 6, Panda 8, Dragon 7) are fun but cost far more than the main bets — only Dragon Bonus is near the main bets in value.'));
  if (noComm) bank.push(an.info('Commission-free table: Banker wins pay 1:1, except a winning Banker 6 pays only 1:2. That small tweak is how the house makes the Banker bet break even (edge ≈ 1.46%).'));
  bank.push(an.tip('The road (history strip) does not predict anything: each hand is dealt from a well-shuffled shoe and past results have no influence on the next one.'));
  ctx.end(`Baccarat ${o.winner} ${o.pt}-${o.bt}`);
  return an.review(o.winner === 'tie' ? 'Tie' : o.winner === 'player' ? 'Player wins' : 'Banker wins', net, [['The hand', hand], ['Why the cards fell that way', why], ['Your bets', lines], ['Odds & expectation', bank]]);
}

function view(st, { rules } = {}) {
  return {
    road: st ? st.road : [],
    pending: st && st.pending ? { staked: st.pending.total } : null,
    last: st && st.last ? st.last : null,
    commission: rules ? rules.commission : 'five',
    maxBet: MAX_BET,
  };
}
const outView = o => ({ player: C.strs(o.player), banker: C.strs(o.banker), pt: o.pt, bt: o.bt, winner: o.winner, text: `${o.winner === 'tie' ? 'Tie' : o.winner === 'player' ? 'Player' : 'Banker'} ${Math.max(o.pt, o.bt)}-${Math.min(o.pt, o.bt)}`, notes: o.notes, c: o.winner === 'player' ? 'blue' : o.winner === 'banker' ? 'red' : 'green', n: o.winner[0].toUpperCase() });

const actions = {
  deal(ctx, body) {
    const placed = placeBets(ctx, body);
    const o = dealRound(ctx.state);
    ctx.state.last = outView(o);
    return settleBets(ctx, placed, o);
  },
};
const shared = {
  mode: 'simul', max: 7, secs: 22, primary: ['deal'], resultMs: 9000,
  init: () => ({ shoe: null, road: [] }),
  place(ctx, body) { const placed = placeBets(ctx, body); ctx.state.pending = placed; ctx.out = { staked: placed.total, count: Object.keys(placed.bets).length }; },
  roll(mem) { const o = dealRound(mem); mem.road.push(o.winner[0].toUpperCase()); if (mem.road.length > 60) mem.road.shift(); return o; },
  settle(ctx, o) { const placed = ctx.state.pending; ctx.state.pending = null; ctx.state.last = outView(o); return settleBets(ctx, placed, o); },
  // conservative cap on what the bank could owe: best main-bet outcome + every side bet hitting its top prize
  exposure(placed) {
    const b = placed.bets, g = id => b[id] || 0;
    const main = Math.max(g('player') * 2 + g('banker') * 0 + g('tie') * 0, g('banker') * 2 + g('player') * 0, g('tie') * 9 + g('player') + g('banker'));
    const side = g('pp') * 12 + g('bp') * 12 + g('either') * 6 + g('perfect') * 201 + g('dragonP') * 11 + g('dragonB') * 11 + g('lucky6') * 21 + g('panda8') * 26 + g('dragon7') * 41;
    return main + side;
  },
  describe: o => outView(o).text,
  outcomeView: outView,
  publicMem: mem => ({ road: mem.road }),
};

module.exports = {
  id: 'baccarat', name: 'Baccarat', icon: '🎴', category: 'cards', skill: 'none',
  blurb: 'Punto Banco with 12 bets: Player, Banker, Tie, pairs, Dragon Bonus, Lucky 6, Panda 8 and Dragon 7.',
  edge: '1.06% (Banker)', shared,
  meta: {
    rules: [
      'Bet on which hand — Player or Banker — will finish closest to 9, or on a Tie. Cards 2–9 are worth face value, Ace = 1, 10/J/Q/K = 0, and only the last digit of the total counts (7 + 8 = 15 → 5).',
      'Each hand gets two cards. A total of 8 or 9 is a "natural" and the round ends. Otherwise the Player draws on 0–5 and stands on 6–7, and the Banker draws or stands by a fixed table that depends on the Player\'s third card. You never make a drawing decision.',
      'Player wins pay 1:1. Banker wins pay 1:1 minus a 5% commission (so Banker bets are in multiples of 20). Tie pays 8:1 and Player/Banker bets push.',
      'Side bets: Player/Banker Pair 11:1 · Either Pair 5:1 · Perfect Pair 25:1/200:1 · Dragon Bonus (natural wins and big margins) · Lucky 6 12:1/20:1 · Panda 8 25:1 · Dragon 7 40:1.',
    ],
    tips: [
      'The only real decision is which bet to make: Banker (1.06% edge) beats Player (1.24%), and both crush Tie (14.4%).',
      'Never bet both Player and Banker in the same hand — they cancel out and you just pay commission.',
      'Roads and bead plates are a tradition, not a strategy: shoe history carries no predictive information.',
      'Dragon Bonus has the lowest house edge among side bets (~2.7%); the pair and Lucky 6 bets cost 10–15%.',
    ],
    bets: BETS,
    options: [
      { key: 'commission', label: 'Banker payout', type: 'select', default: 'five', choices: [
        { v: 'five', label: 'Standard: 5% commission (Banker edge 1.06%)', edge: 1.06 },
        { v: 'none', label: 'Commission-free: Banker 6 pays only 1:2 (Banker edge 1.46%)', edge: 1.46 }] },
    ],
  },
  view, actions,
  _t: { dealRound, sideMultiplier, BETS },
};
