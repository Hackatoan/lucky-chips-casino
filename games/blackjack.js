'use strict';
const C = require('../lib/cards');
const an = require('../lib/an');
const { fail } = require('../lib/engine');

const DECKS = 6;
const RESHUFFLE_AT = 78;           // reshuffle when < 1.5 decks remain (75% penetration)
const MAX_HANDS = 4;
const MAX_BET = 5000;

// ---------- card values / counting ----------
const val = c => { const r = c % 13; return r === 12 ? 11 : r >= 8 ? 10 : r + 2; };
const hilo = c => { const r = c % 13; return r <= 4 ? 1 : r <= 7 ? 0 : -1; };
const upName = v => (v === 11 ? 'Ace' : String(v));

function info(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { t += val(c); if (c % 13 === 12) aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { total: t, soft: aces > 0, bj: cards.length === 2 && t === 21 };
}

// ---------- dealer bust odds (S17, approx) and hit-bust odds ----------
const DEALER_BUST = { 2: 35, 3: 37, 4: 40, 5: 42, 6: 42, 7: 26, 8: 24, 9: 23, 10: 21, 11: 12 };
function bustOnHit(t) {   // % chance a single hit busts a HARD total t (infinite-deck)
  if (t <= 11) return 0;
  let bad = 0;
  for (let v = 1; v <= 10; v++) if (t + v > 21) bad += v === 10 ? 4 : 1;
  return Math.round((bad / 13) * 100);
}

// ---------- basic strategy (6 deck, S17, DAS, late surrender, no resplit aces) ----------
function pairAction(v, up) {
  switch (v) {
    case 11: case 8: return 'P';
    case 10: case 5: return null;
    case 9: return [2, 3, 4, 5, 6, 8, 9].includes(up) ? 'P' : null;
    case 7: return up <= 7 ? 'P' : null;
    case 6: return up <= 6 ? 'P' : null;
    case 4: return up === 5 || up === 6 ? 'P' : null;
    case 3: case 2: return up <= 7 ? 'P' : null;
  }
  return null;
}
// returns base code: H S D(double else hit) Ds(double else stand) P R(surrender else hit)
function baseCode(cards, up, canSplit, canSurr) {
  const { total, soft } = info(cards);
  if (canSplit && cards.length === 2 && val(cards[0]) === val(cards[1])) {
    const p = pairAction(val(cards[0]), up);
    if (p) return p;
  }
  if (!soft || total > 21) {
    if (canSurr) {
      if (total === 16 && [9, 10, 11].includes(up)) return 'R';
      if (total === 15 && up === 10) return 'R';
    }
    if (total <= 8) return 'H';
    if (total === 9) return up >= 3 && up <= 6 ? 'D' : 'H';
    if (total === 10) return up <= 9 ? 'D' : 'H';
    if (total === 11) return up <= 10 ? 'D' : 'H';
    if (total === 12) return up >= 4 && up <= 6 ? 'S' : 'H';
    if (total <= 16) return up <= 6 ? 'S' : 'H';
    return 'S';
  }
  if (total <= 14) return up === 5 || up === 6 ? 'D' : 'H';
  if (total <= 16) return up >= 4 && up <= 6 ? 'D' : 'H';
  if (total === 17) return up >= 3 && up <= 6 ? 'D' : 'H';
  if (total === 18) return up >= 3 && up <= 6 ? 'Ds' : up <= 8 ? 'S' : 'H';
  return 'S';
}
function resolve(base, can) {
  if (base === 'D') return can.double ? 'D' : 'H';
  if (base === 'Ds') return can.double ? 'D' : 'S';
  if (base === 'R') return can.surrender ? 'R' : 'H';
  if (base === 'P') return can.split ? 'P' : null;
  return base;
}
function bestPlay(cards, up, can) {
  let base = baseCode(cards, up, can.split, can.surrender);
  let code = resolve(base, can);
  if (code === null) { base = baseCode(cards, up, false, can.surrender); code = resolve(base, can); }
  return { base, code };
}

// ---------- Hi-Lo index plays ("Illustrious 18" + a few) ----------
// {k: hand key, up, play, tc, dir}  dir '>=' means play when TC >= tc, '<' means when TC < tc
const DEVS = [
  { h: 'hard', t: 16, up: 10, play: 'S', tc: 0, dir: '>=' },
  { h: 'hard', t: 15, up: 10, play: 'S', tc: 4, dir: '>=' },
  { h: 'hard', t: 10, up: 10, play: 'D', tc: 4, dir: '>=' },
  { h: 'hard', t: 12, up: 3, play: 'S', tc: 2, dir: '>=' },
  { h: 'hard', t: 12, up: 2, play: 'S', tc: 3, dir: '>=' },
  { h: 'hard', t: 11, up: 11, play: 'D', tc: 1, dir: '>=' },
  { h: 'hard', t: 9, up: 2, play: 'D', tc: 1, dir: '>=' },
  { h: 'hard', t: 10, up: 11, play: 'D', tc: 4, dir: '>=' },
  { h: 'hard', t: 9, up: 7, play: 'D', tc: 3, dir: '>=' },
  { h: 'hard', t: 16, up: 9, play: 'S', tc: 5, dir: '>=' },
  { h: 'hard', t: 13, up: 2, play: 'H', tc: -1, dir: '<' },
  { h: 'hard', t: 12, up: 4, play: 'H', tc: 0, dir: '<' },
  { h: 'hard', t: 12, up: 5, play: 'H', tc: -2, dir: '<' },
  { h: 'hard', t: 12, up: 6, play: 'H', tc: -1, dir: '<' },
  { h: 'hard', t: 13, up: 3, play: 'H', tc: -2, dir: '<' },
  { h: 'pair', t: 20, up: 5, play: 'P', tc: 5, dir: '>=' },
  { h: 'pair', t: 20, up: 6, play: 'P', tc: 4, dir: '>=' },
  { h: 'hard', t: 14, up: 10, play: 'R', tc: 3, dir: '>=' },
  { h: 'hard', t: 15, up: 9, play: 'R', tc: 2, dir: '>=' },
];
function deviation(cards, up, tc, can) {
  const { total, soft } = info(cards);
  const isPair = cards.length === 2 && val(cards[0]) === val(cards[1]);
  for (const d of DEVS) {
    if (d.up !== up) continue;
    if (d.h === 'pair') { if (!(isPair && can.split && val(cards[0]) * 2 === d.t)) continue; }
    else {
      if (soft || total !== d.t) continue;
      if (isPair && can.split && pairAction(val(cards[0]), up)) continue;   // basic already says split
    }
    if (d.play === 'D' && !can.double) continue;
    if (d.play === 'R' && !can.surrender) continue;
    const on = d.dir === '>=' ? tc >= d.tc : tc < d.tc;
    if (on) return d;
  }
  return null;
}
// Basic-strategy chart + count-deviation list, generated from the same tables the coach uses (for the Learn page)
function chartData() {
  const ups = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const rk = v => (v === 11 ? 12 : v === 10 ? 8 : v - 2);
  const code = (c1, c2, up, split) => baseCode([rk(c1), rk(c2) + 13], up, split, true);
  const hard = {}, soft = {}, pairs = {};
  for (let t = 5; t <= 20; t++) {
    let a = Math.max(2, t - 10), b = t - a; if (a === b) { a++; b--; }
    if (b < 2 || b > 10) { a = 10; b = t - 10; }
    hard[t] = ups.map(u => code(a, b, u, false));
  }
  for (let x = 2; x <= 9; x++) soft['A' + x] = ups.map(u => code(11, x, u, false));
  for (const v of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) pairs[v === 11 ? 'AA' : v + ',' + v] = ups.map(u => code(v, v, u, true));
  const devs = DEVS.map(d => ({ hand: d.h === 'pair' ? `${d.t / 2},${d.t / 2}` : `hard ${d.t}`, up: d.up === 11 ? 'A' : d.up, play: PLAY_NAME[d.play], when: d.dir === '>=' ? `true count ≥ ${d.tc >= 0 ? '+' : ''}${d.tc}` : `true count < ${d.tc}` }));
  return { ups, hard, soft, pairs, devs };
}
const PLAY_NAME = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' };
const GERUND = { H: 'hitting', S: 'standing', D: 'doubling', P: 'splitting', R: 'surrendering' };

// ---------- explanations ----------
function describe(cards, up) {
  const { total, soft } = info(cards);
  const pair = cards.length === 2 && val(cards[0]) === val(cards[1]);
  return { total, soft, pair, pv: val(cards[0]), up, upn: upName(up), bust: DEALER_BUST[up], bh: bustOnHit(soft ? 12 : total) };
}
function handLabel(cards, up) {
  const d = describe(cards, up);
  const base = d.pair && d.pv !== 5 && d.pv !== 10 ? `Pair of ${d.pv === 11 ? 'Aces' : d.pv + 's'}` : d.soft ? `Soft ${d.total}` : `Hard ${d.total}`;
  return `${base} vs ${d.upn}`;
}
function whyBest(code, base, cards, up) {
  const d = describe(cards, up);
  const strong = up >= 7;
  switch (code) {
    case 'P':
      if (d.pv === 11) return `Aces are the best starting card in the game. A lone 12 is a weak hand, but two hands starting on an Ace give you two real shots at 21 (one card each on split aces). Always split aces.`;
      if (d.pv === 8) return `16 is the worst total in blackjack — hit it and you bust ${bustOnHit(16)}% of the time, stand and you lose to anything 17+. Two hands starting on 8 are far better than one 16, so always split 8s${up >= 9 ? ' (even against a strong ' + d.upn + ', splitting loses less than playing the 16)' : ''}.`;
      return `The dealer's ${d.upn} is weak (busts ~${d.bust}%), so turning one mediocre pair of ${d.pv}s into two hands that each start with ${d.pv} lets you win more often in total than playing one hand.`;
    case 'D':
      if (d.soft) return `You can't bust a soft hand with one card, and the dealer's ${d.upn} is weak (busts ~${d.bust}%). That makes this a low-risk spot to put double the money out.`;
      if (d.total === 11) return `With 11, any 10-value card (31% of the deck) makes 21, and most others give you a strong 17–20. You're the favourite against a ${d.upn}, so get more money on the table.`;
      if (d.total === 10) return `10 turns into 20 with any ten-value card and you can't bust. The dealer's ${d.upn} isn't strong enough to stop you being a favourite — double.`;
      return `9 vs a weak ${d.upn} (busts ~${d.bust}%): one good card makes a 19–20 and the dealer is already in trouble. Double.`;
    case 'S':
      if (d.total >= 17 && !d.soft) return `${d.total} is a made hand. A hit would bust ${d.bh}% of the time and the improvement is rarely worth it.`;
      if (d.soft) return `Soft ${d.total} already beats most dealer finals. Hitting risks turning a good hand into a worse one for little gain — stand against the ${d.upn}.`;
      return `The dealer's ${d.upn} is weak and busts about ${d.bust}% of the time. Your ${d.total} would bust ${d.bh}% if you hit — let the dealer take the risk.`;
    case 'H':
      if (d.soft) return `Soft ${d.total}: the Ace can drop to a 1, so a hit can never bust you. Against a ${d.upn} your hand isn't good enough as is — take a free card.`;
      if (d.total <= 11) return `${d.total} can't bust on one card, so there's no risk in hitting — you only improve.`;
      if (strong) return `Dealer's ${d.upn} is strong: they make 17+ ~${100 - d.bust}% of the time and bust only ~${d.bust}%. Standing on ${d.total} loses too often; hitting risks a ${d.bh}% bust but it's still your best chance.`;
      return `Against a ${d.upn} (busts only ~${d.bust}%) ${d.total} is too weak to stand on. A hit busts ${d.bh}% — still the lower-loss option.`;
    case 'R':
      return `${d.total} against a ${d.upn} wins only about 21–23% of the time. Surrendering costs exactly half your bet; playing on loses more than that on average (~−54%). Giving up half is the mathematically cheaper loss.`;
  }
  return '';
}
function whyNot(played, best, cards, up) {
  const d = describe(cards, up);
  const key = played + best;
  switch (played) {
    case 'S': return best === 'D' ? `Standing leaves value on the table — this is a spot where you're the favourite, so ${GERUND[best]} earns more.` :
      best === 'P' ? `Standing on a ${d.pair ? 'pair of ' + d.pv + 's' : d.total} wastes a splitting spot where two hands do better than one.` :
      best === 'R' ? `Standing on ${d.total} vs ${d.upn} loses more than the half-bet you'd give up by surrendering.` :
      `Standing on ${d.total} vs ${d.upn}: the dealer makes a hand ${100 - d.bust}% of the time, so you'd only win when they bust (${d.bust}%). Better to improve.`;
    case 'H': return best === 'S' ? `Hitting ${d.total}: ${d.bh}% chance you bust immediately, and the dealer's ${d.upn} busts ${d.bust}% on their own. You'd be giving up a hand that is already good enough.` :
      best === 'D' ? `Hitting works, but this is a doubling spot — you're the favourite, so you should have more money out.` :
      best === 'P' ? `Hitting one ${d.pair ? 'pair of ' + d.pv + 's' : 'hand'} is worse than splitting into two hands that each start better.` :
      `Hitting loses more than surrendering would here.`;
    case 'D': return `Doubling puts twice the money on ${d.soft ? 'soft ' : ''}${d.total} vs ${d.upn}, but you aren't a big enough favourite — the extra bet loses more often than it wins. ${best === 'S' ? 'Just stand.' : best === 'H' ? 'Take a normal hit.' : 'Another play is better.'}`;
    case 'P': return `Splitting ${d.pv === 11 ? 'Aces' : d.pv + 's'} against a ${d.upn} gives you two hands that are each worse than the one you have${d.pv === 10 ? ' — never split tens; 20 is already a winner' : d.pv === 5 ? ' — a pair of 5s is a 10, a great doubling hand, not two weak 5s' : ''}.`;
    case 'R': return `Surrender only makes sense when you'd win less than ~25% of the time. Here ${GERUND[best]} does better than giving up half your bet.`;
  }
  return '';
}

// ---------- skill rating inputs ----------
// How hard a spot is (Elo scale). Easy "obvious" plays ~800, counter-intuitive plays 1300-1750, count deviations 1900+.
function spotDifficulty(cards, up, code) {
  const d = describe(cards, up);
  const { total, soft, pv } = d;
  if (code === 'P') return pv === 11 || pv === 8 ? 1100 : pv === 9 ? 1700 : pv === 7 || pv === 6 ? 1550 : 1650;
  if (code === 'R') return 1750;
  if (code === 'D') return soft ? 1550 : total === 11 ? 1000 : total === 10 ? 1150 : 1450;
  if (soft) return code === 'S' ? (total >= 19 ? 900 : 1500) : 1300;
  if (code === 'S') { if (total >= 17) return 800; if (up <= 6) return total === 12 ? 1250 : 1100; return 1400; }
  if (total <= 8) return 800;
  if (total <= 11) return 900;
  return up >= 7 ? 1350 : total === 12 ? 1500 : 1300;
}
// partial credit for sensible-but-second-best plays (hit instead of double, etc.)
const PARTIAL = { DH: 0.4, DS: 0.15, RH: 0.35, RS: 0.2, PH: 0.25, PS: 0.1, SH: 0.1, HS: 0.15, HD: 0.1, SD: 0.1, HP: 0.1, SP: 0.1, HR: 0.25, SR: 0.25 };
const playQuality = (played, best) => (played === best ? 1 : PARTIAL[best + played] || 0);

// ---------- state ----------
function newState() { return { shoe: C.newShoe(DECKS), rc: 0, phase: 'idle', hands: [], dealer: [], holeHidden: false, decisions: [], results: [], sideRes: [], sides: {}, insBet: 0, stats: { hands: 0 }, notice: '' }; }
function reveal(st, c) { st.rc += hilo(c); }
function drawCard(st, hidden) {
  if (st.shoe.length === 0) { st.shoe = C.newShoe(DECKS); st.rc = 0; st.notice = 'The shoe ran out mid-hand and was reshuffled.'; }
  const c = st.shoe.pop();
  if (!hidden) reveal(st, c);
  return c;
}
function trueCount(st) { return st.rc / Math.max(st.shoe.length / 52, 0.5); }

// ---------- side bets ----------
const SIDE = {
  pp: { name: 'Perfect Pairs', pays: 'Perfect 25:1 · Colored 12:1 · Mixed 6:1', edge: 0.0450, min: 1, max: 500, desc: 'Your first two cards are a pair. Perfect = same rank and suit; colored = same color, different suit; mixed = different colors. Settled immediately.' },
  t3: { name: '21+3', pays: 'Flush 5:1 · Straight 10:1 · Trips 30:1 · Str. flush 40:1 · Suited trips 100:1', edge: 0.0320, min: 1, max: 500, desc: 'Your two cards + dealer upcard make a poker hand. Settled immediately.' },
  rm: { name: 'Royal Match', pays: 'Suited 2:1 · Suited K-Q 25:1', edge: 0.0600, min: 1, max: 500, desc: 'Your first two cards are the same suit. King + Queen of the same suit is the royal. Settled immediately.' },
  ll: { name: 'Lucky Ladies', pays: 'Any 20: 4:1 · Suited 20: 9:1 · Matched 20: 19:1 · Q♥Q♥: 125:1 (1000:1 vs dealer BJ)', edge: 0.2500, min: 1, max: 500, desc: 'Your first two cards total 20. Settled immediately.' },
  bb: { name: 'Buster', pays: 'Dealer busts: 3 cards 2:1 · 4 cards 2:1 · 5 cards 4:1 · 6 cards 12:1 · 7 cards 50:1 · 8+ 250:1', edge: 0.0200, min: 1, max: 500, desc: 'Wins when the dealer busts; pays more the more cards they used. Settled when the dealer finishes.' },
};
const isStraight3 = rs => {
  const s = [...rs].sort((a, b) => a - b);
  if (s[0] + 1 === s[1] && s[1] + 1 === s[2]) return true;
  return s[0] === 0 && s[1] === 1 && s[2] === 12;   // A-2-3 (ace low)
};
function evalPP(a, b) {
  if (a % 13 !== b % 13) return null;
  if (C.suit(a) === C.suit(b)) return { x: 25, label: 'Perfect pair' };
  if (C.isRed(a) === C.isRed(b)) return { x: 12, label: 'Colored pair' };
  return { x: 6, label: 'Mixed pair' };
}
function eval21p3(a, b, u) {
  const rs = [C.rank(a), C.rank(b), C.rank(u)];
  const flush = C.suit(a) === C.suit(b) && C.suit(b) === C.suit(u);
  const trips = rs[0] === rs[1] && rs[1] === rs[2];
  const str = isStraight3(rs) && new Set(rs).size === 3;
  if (trips && flush) return { x: 100, label: 'Suited three of a kind' };
  if (str && flush) return { x: 40, label: 'Straight flush' };
  if (trips) return { x: 30, label: 'Three of a kind' };
  if (str) return { x: 10, label: 'Straight' };
  if (flush) return { x: 5, label: 'Flush' };
  return null;
}
function evalRM(a, b) {
  if (C.suit(a) !== C.suit(b)) return null;
  const rs = [C.rank(a), C.rank(b)].sort();
  if (rs[0] === 10 && rs[1] === 11) return { x: 25, label: 'Royal match (K-Q suited)' };
  return { x: 2, label: 'Suited' };
}
function evalLL(a, b, dealerBJ) {
  if (val(a) + val(b) !== 20) return null;
  const isQH = c => C.rank(c) === 10 && C.suit(c) === 1;
  if (isQH(a) && isQH(b)) return dealerBJ ? { x: 1000, label: 'Queen of Hearts pair vs dealer blackjack' } : { x: 125, label: 'Queen of Hearts pair' };
  if (a % 13 === b % 13 && C.suit(a) === C.suit(b)) return { x: 19, label: 'Matched 20' };
  if (C.suit(a) === C.suit(b)) return { x: 9, label: 'Suited 20' };
  return { x: 4, label: 'Any 20' };
}
const BUSTER = { 3: 2, 4: 2, 5: 4, 6: 12, 7: 50 };

// ---------- flow ----------
function canFor(st, bal) {
  const h = st.hands[st.cur];
  if (st.phase !== 'player' || !h) return {};
  const two = h.cards.length === 2;
  return {
    hit: !h.aceSplit, stand: true,
    double: two && bal >= h.bet && !h.aceSplit,
    split: two && !h.aceSplit && st.hands.length < MAX_HANDS && val(h.cards[0]) === val(h.cards[1]) && bal >= h.bet && !(h.fromSplit && h.cards[0] % 13 === 12),
    surrender: two && st.hands.length === 1 && !h.fromSplit,
  };
}
function advanceHand(ctx, st) {
  while (st.cur < st.hands.length) {
    const h = st.hands[st.cur];
    if (h.done) { st.cur++; continue; }
    // a split hand needs its second card dealt when it becomes active
    if (h.cards.length === 1) {
      h.cards.push(drawCard(st));
      if (h.aceSplit) { h.done = true; st.cur++; continue; }
    }
    if (info(h.cards).total >= 21) { h.done = true; st.cur++; continue; }
    return;
  }
  dealerPlay(ctx, st);
}
function dealerPlay(ctx, st) {
  st.phase = 'dealer';
  if (st.holeHidden) { st.holeHidden = false; reveal(st, st.dealer[1]); }
  const live = st.hands.some(h => !h.surrendered && info(h.cards).total <= 21 && !(h.bj));
  if (live) { while (info(st.dealer).total < 17) st.dealer.push(drawCard(st)); }
  settle(ctx, st);
}

function settle(ctx, st) {
  const d = info(st.dealer);
  const dealerBJ = st.dealer.length === 2 && d.total === 21;
  let totalNet = 0;
  st.results = st.hands.map((h, i) => {
    const hi = info(h.cards);
    const total = hi.total;
    let net, text, tag;
    if (h.surrendered) { ctx.credit(h.bet / 2); net = -h.bet / 2; text = 'Surrendered'; tag = 'lose'; }
    else if (h.bj && !h.fromSplit) {
      if (dealerBJ) { ctx.credit(h.bet); net = 0; text = 'Blackjack — push (dealer also has blackjack)'; tag = 'push'; }
      else { const win = Math.floor(h.bet * 1.5); ctx.credit(h.bet + win); net = win; text = 'Blackjack pays 3:2'; tag = 'win'; }
    }
    else if (total > 21) { net = -h.bet; text = 'Bust'; tag = 'lose'; }
    else if (dealerBJ) { net = -h.bet; text = 'Dealer blackjack'; tag = 'lose'; }
    else if (d.total > 21) { ctx.credit(h.bet * 2); net = h.bet; text = 'Dealer busts'; tag = 'win'; }
    else if (total > d.total) { ctx.credit(h.bet * 2); net = h.bet; text = `Win ${total} to ${d.total}`; tag = 'win'; }
    else if (total === d.total) { ctx.credit(h.bet); net = 0; text = `Push at ${total}`; tag = 'push'; }
    else { net = -h.bet; text = `Lose ${total} to ${d.total}`; tag = 'lose'; }
    totalNet += net;
    return { net, text, tag };
  });

  // Buster side bet
  if (st.sides.bb) {
    const bet = st.sides.bb;
    const busted = d.total > 21;
    const mult = busted ? (BUSTER[st.dealer.length] ?? 250) : 0;
    if (mult) { ctx.credit(bet * (mult + 1)); st.sideRes.push({ id: 'bb', bet, x: mult, label: `Dealer busted with ${st.dealer.length} cards` }); }
    else st.sideRes.push({ id: 'bb', bet, x: 0, label: busted ? 'Dealer busted' : 'Dealer did not bust' });
  }
  st.phase = 'done';
  const sideNet = st.sideRes.reduce((s, r) => s + (r.x ? r.bet * r.x : -r.bet), 0);
  const insNet = st.insBet ? (dealerBJ ? st.insBet * 2 : -st.insBet) : 0;
  const mainNet = totalNet;
  const net = mainNet + sideNet + insNet;

  // skill accounting
  const okCount = st.decisions.filter(x => x.ok).length;
  ctx.skill(okCount, st.decisions.length);
  ctx.analysis = buildReview(st, { d, dealerBJ, mainNet, sideNet, insNet, net });
  ctx.end(`Blackjack ${st.hands.map((h, i) => st.results[i].text).join(' / ')}`);
}

function buildReview(st, { d, dealerBJ, mainNet, sideNet, insNet, net }) {
  const out = [];
  const nHands = st.hands.length;
  const dTxt = `Dealer: ${C.shorts(st.dealer)} = ${d.total}${dealerBJ ? ' (blackjack)' : d.total > 21 ? ' (bust)' : ''}`;
  const resItems = [an.info(dTxt)];
  st.hands.forEach((h, i) => {
    const r = st.results[i];
    resItems.push((r.tag === 'win' ? an.good : r.tag === 'lose' ? an.bad : an.info)(
      `${nHands > 1 ? 'Hand ' + (i + 1) + ': ' : 'You: '}${C.shorts(h.cards)} = ${info(h.cards).total} → ${r.text} (${an.signed(r.net)})`));
  });
  out.push(['Result', resItems]);

  const decItems = st.decisions.map(x => {
    if (x.kind === 'dev') return an.good(`${x.label}: ${x.playedName} — correct count deviation. ${x.text}`);
    if (x.ok) return an.good(`${x.label}: ${x.playedName} ✔ matches basic strategy. ${x.text || ''}`);
    return an.bad(`${x.label}: you chose ${x.playedName}, basic strategy says ${x.bestName}. ${x.text}`);
  });
  const infoDev = st.decisions.filter(x => x.ok && x.kind !== 'dev' && x.devNote).map(x => an.tip(x.devNote));
  if (decItems.length) out.push(['Your decisions', decItems.concat(infoDev)]);

  const sideItems = [];
  for (const r of st.sideRes) {
    const s = SIDE[r.id];
    if (r.x) sideItems.push(an.good(`${s.name}: ${r.label} paid ${r.x}:1 (+${an.fmt(r.bet * r.x)}).`));
    else sideItems.push(an.bad(`${s.name}: ${r.label} — lost ${an.fmt(r.bet)}.`));
  }
  if (st.insBet) sideItems.push((insNet > 0 ? an.good : an.bad)(`Insurance: dealer ${dealerBJ ? 'had' : 'did not have'} blackjack (${an.signed(insNet)}).`));
  if (sideItems.length) {
    const wag = st.sideRes.reduce((s, r) => s + r.bet, 0);
    sideItems.push(an.tip(`Side bets cost far more than the main game: the main game has a ~0.5% edge with basic strategy, but ${st.sideRes.map(r => SIDE[r.id].name + ' ≈ ' + (SIDE[r.id].edge * 100).toFixed(1) + '%').join(', ')}${st.insBet ? ', insurance ≈ 7.7% (without counting)' : ''}. They pay big occasionally, which is exactly why they feel fun — and expensive.`));
    out.push(['Side bets', sideItems]);
  }

  const insights = [];
  const up = val(st.dealer[0]);
  if (d.total > 21) insights.push(an.info(`The dealer busted showing ${upName(up)} — that happens ~${DEALER_BUST[up]}% of the time with that upcard.`));
  else if (!dealerBJ) insights.push(an.info(`Dealer finished on ${d.total}. With a ${upName(up)} up, they bust ~${DEALER_BUST[up]}% and otherwise land on 17–21.`));
  const bad = st.decisions.filter(x => !x.ok);
  if (nHands >= 1 && st.decisions.length) {
    if (!bad.length && mainNet < 0) insights.push(an.tip('You played every decision correctly and still lost. That is variance, not a mistake: even perfect basic strategy wins only ~42–43% of hands. Judge decisions, not outcomes.'));
    else if (bad.length && mainNet > 0) insights.push(an.warn('You won, but at least one play deviated from basic strategy. Getting lucky does not make a play right — over thousands of hands those deviations cost you roughly 1–4% of your bets each.'));
    else if (bad.length) insights.push(an.warn(`${bad.length} play${bad.length > 1 ? 's' : ''} differed from basic strategy. Use the Coach panel before each move until the chart feels automatic.`));
    else insights.push(an.good('Perfect basic strategy this hand. Over the long run that shrinks the house edge to about 0.5%.'));
  }
  if (insights.length) out.push(['Insight', insights]);

  const tc = trueCount(st);
  const cnt = [an.info(`Running count ${st.rc >= 0 ? '+' : ''}${st.rc} · ${(st.shoe.length / 52).toFixed(1)} decks left · true count ${tc >= 0 ? '+' : ''}${tc.toFixed(1)}.`), an.tip(betAdvice(tc).text)];
  out.push(['Card counting', cnt]);

  const headline = st.results.some(x => x.text.startsWith('Blackjack')) && net > 0 ? 'Blackjack!' : d.total > 21 ? 'Dealer busts' : net > 0 ? 'You win' : net < 0 ? 'Dealer wins' : 'Push';
  const r = an.review(headline, net, out);
  r.hand = { sides: sideNet, ins: insNet };
  return r;
}

function betAdvice(tc) {
  const t = tc;
  const edge = (-0.5 + 0.5 * t).toFixed(1);
  let units, text;
  if (t < 1) { units = 1; text = `True count ${t.toFixed(1)}: the shoe favours the house (your edge ≈ ${edge}%). Bet your minimum.`; }
  else if (t < 2) { units = 2; text = `True count +${t.toFixed(1)}: roughly break-even (edge ≈ ${edge}%). Bet about 2 units.`; }
  else if (t < 3) { units = 4; text = `True count +${t.toFixed(1)}: the shoe is rich in tens and aces (edge ≈ +${edge}%). Raise to about 4 units.`; }
  else if (t < 4) { units = 6; text = `True count +${t.toFixed(1)}: a clear player edge (≈ +${edge}%). Bet about 6 units.`; }
  else { units = 8; text = `True count +${t.toFixed(1)}: strong player edge (≈ +${edge}%). Bet your maximum spread, about 8 units.`; }
  return { units, text };
}

// ---------- coach (live) ----------
function coachFor(st, bal) {
  const h = st.hands[st.cur];
  if (st.phase === 'insurance') {
    const tc = trueCount(st);
    const take = tc >= 3;
    return {
      title: 'Insurance?',
      best: take ? 'take' : 'decline',
      text: take
        ? `True count is +${tc.toFixed(1)}. Insurance pays 2:1 and wins when the dealer has a ten underneath. At +3 or higher the deck is so ten-rich that insurance becomes profitable — this is the most valuable counting deviation.`
        : `Decline. Insurance is a side bet that the dealer has a ten in the hole. With an average deck only 4 of 13 cards are tens (30.8%), but it pays 2:1 so it needs 33.3% to break even — a ~7.7% house edge. It becomes +EV only when the true count is +3 or higher (now ${tc >= 0 ? '+' : ''}${tc.toFixed(1)}).`,
    };
  }
  if (st.phase !== 'player' || !h) return null;
  const can = canFor(st, bal);
  const up = val(st.dealer[0]);
  const bp = bestPlay(h.cards, up, can);
  const tc = trueCount(st);
  const dev = deviation(h.cards, up, tc, can);
  const options = {};
  for (const [act, code] of [['hit', 'H'], ['stand', 'S'], ['double', 'D'], ['split', 'P'], ['surrender', 'R']]) {
    if (!can[act]) continue;
    const isBest = code === bp.code;
    options[act] = { best: isBest, text: isBest ? whyBest(code, bp.base, h.cards, up) : whyNot(code, bp.code, h.cards, up) };
  }
  let devInfo = null;
  if (dev) {
    const word = dev.dir === '>=' ? `true count is +${tc.toFixed(1)} (index ${dev.tc >= 0 ? '≥ +' : '≥ '}${dev.tc})` : `true count is ${tc.toFixed(1)} (index < ${dev.tc})`;
    devInfo = { play: dev.play, name: PLAY_NAME[dev.play], text: `Count deviation: because the ${word}, the better play is ${PLAY_NAME[dev.play].toUpperCase()} instead of ${PLAY_NAME[bp.code]}. ${dev.dir === '>=' ? 'A high count means more tens left, which makes the dealer stronger and our doubles/stands better.' : 'A low count means fewer tens, so a hit is safer than usual.'}` };
  }
  return { title: handLabel(h.cards, up), best: bp.code, bestName: PLAY_NAME[bp.code], options, deviation: devInfo, bust: DEALER_BUST[up] };
}

// ---------- view ----------
function view(st, { balance, coachOn = true }) {
  if (!st) {
    return { phase: 'idle', count: { left: DECKS * 52, decks: DECKS, rc: 0, tc: 0 }, hands: [], dealer: [], sides: {}, sideRes: [], advice: betAdvice(0), balance };
  }
  const tc = trueCount(st);
  const dealerCards = st.dealer.map((c, i) => (i === 1 && st.holeHidden ? null : C.str(c)));
  const dinfo = st.holeHidden ? { total: val(st.dealer[0]) } : info(st.dealer);
  const v = {
    phase: st.phase, cur: st.cur, notice: st.notice, balance,
    count: { left: st.shoe.length, decks: DECKS, rc: st.rc, tc: Math.round(tc * 10) / 10 },
    dealer: { cards: dealerCards, total: dinfo.total, soft: !st.holeHidden && info(st.dealer).soft },
    hands: st.hands.map((h, i) => {
      const hi = info(h.cards);
      return { cards: C.strs(h.cards), total: hi.total, soft: hi.soft, bet: h.bet, done: !!h.done, doubled: !!h.doubled, bj: hi.bj && !h.fromSplit, result: st.results[i] || null, active: st.phase === 'player' && i === st.cur };
    }),
    insBet: st.insBet, sides: st.sides, sideRes: st.sideRes,
    advice: betAdvice(tc),
    allowed: canFor(st, balance),
  };
  if (st.phase === 'insurance') v.allowed = { insurance: true };
  v.coach = coachOn ? coachFor(st, balance) : null;     // rated mode: the server doesn't even send the answer
  v.coachOn = coachOn;
  return v;
}

// ---------- actions ----------
const actions = {
  deal(ctx, body) {
    let st = ctx.state;
    if (st && (st.phase === 'player' || st.phase === 'insurance' || st.phase === 'dealer')) fail('Finish your current hand first.');
    if (!st) st = newState();
    ctx.state = st;
    const bet = ctx.int(body.bet, { min: 2, max: MAX_BET, step: 2, label: 'Bet' });
    const sides = {};
    for (const k of Object.keys(SIDE)) {
      const v = body.sides && body.sides[k];
      if (v) sides[k] = ctx.int(v, { min: SIDE[k].min, max: SIDE[k].max, label: SIDE[k].name });
    }
    st.notice = '';
    if (st.shoe.length < RESHUFFLE_AT) { st.shoe = C.newShoe(DECKS); st.rc = 0; st.notice = 'The cut card came out — fresh shoe shuffled, count reset to 0.'; }
    ctx.debit(bet + Object.values(sides).reduce((a, b) => a + b, 0));

    st.hands = []; st.dealer = []; st.decisions = []; st.results = []; st.sideRes = []; st.insBet = 0; st.cur = 0; st.sides = sides;
    const p1 = drawCard(st), u = drawCard(st), p2 = drawCard(st), hole = drawCard(st, true);
    st.dealer = [u, hole]; st.holeHidden = true;
    st.hands = [{ cards: [p1, p2], bet, done: false, fromSplit: false }];
    const bj = info([p1, p2]).bj;
    st.hands[0].bj = bj;

    // immediate side bets
    const dBJ = info(st.dealer).bj;
    const pay = (id, r) => {
      const stake = sides[id]; if (!stake) return;
      if (r) { ctx.credit(stake * (r.x + 1)); st.sideRes.push({ id, bet: stake, x: r.x, label: r.label }); }
      else st.sideRes.push({ id, bet: stake, x: 0, label: 'no qualifying hand' });
    };
    pay('pp', sides.pp ? evalPP(p1, p2) : null);
    pay('t3', sides.t3 ? eval21p3(p1, p2, u) : null);
    pay('rm', sides.rm ? evalRM(p1, p2) : null);
    pay('ll', sides.ll ? evalLL(p1, p2, dBJ) : null);

    const upv = val(u);
    if (upv === 11) { st.phase = 'insurance'; return; }
    if (upv === 10 && dBJ) { st.holeHidden = false; reveal(st, hole); st.phase = 'dealer'; return settle(ctx, st); }
    if (bj) { st.holeHidden = false; reveal(st, hole); st.hands[0].done = true; return settle(ctx, st); }
    st.phase = 'player';
    advanceHand(ctx, st);
  },

  insurance(ctx, body) {
    const st = ctx.state;
    if (!st || st.phase !== 'insurance') fail('No insurance offer right now.');
    const take = !!body.take;
    const tc = trueCount(st);
    const h = st.hands[0];
    // declining is never a "mistake" for someone not counting: only taking it at a low count is wrong
    const correct = take ? tc >= 3 : true;
    st.decisions.push({
      label: 'Insurance' + (h.bj ? ' (even money)' : ''), playedName: take ? 'Take' : 'Decline', bestName: tc >= 3 ? 'Take' : 'Decline', ok: correct,
      devNote: !take && tc >= 3 ? `Count note: true count was +${tc.toFixed(1)} (≥ +3), where insurance is actually profitable — a counter would have taken it.` : undefined,
      text: tc >= 3 ? `True count was +${tc.toFixed(1)} (≥ +3), when insurance becomes profitable.` : `True count was ${tc.toFixed(1)} (< +3): insurance is a −EV side bet of ~7.7% without a rich-in-tens deck.`,
    });
    // graded only on what a player can know: declining is judged against the 'no count' default; taking only
    // makes sense with a count of +3 or more, so a take at a low count is a mistake and a correct take is a hard spot
    if (!take) { if (tc < 3) ctx.rate('bj:ins-decline', 1300, 1); }
    else ctx.rate('bj:ins-take', tc >= 3 ? 2000 : 1300, tc >= 3 ? 1 : 0);
    if (take) { st.insBet = h.bet / 2; ctx.debit(st.insBet); }
    const dBJ = info(st.dealer).bj;
    if (dBJ) {
      st.holeHidden = false; reveal(st, st.dealer[1]);
      if (st.insBet) ctx.credit(st.insBet * 3);
      return settle(ctx, st);
    }
    // no dealer blackjack: insurance (if any) is lost; play continues
    if (h.bj) { st.holeHidden = false; reveal(st, st.dealer[1]); h.done = true; return settle(ctx, st); }
    st.phase = 'player';
    advanceHand(ctx, st);
  },

  hit: (ctx) => act(ctx, 'H'),
  stand: (ctx) => act(ctx, 'S'),
  double: (ctx) => act(ctx, 'D'),
  split: (ctx) => act(ctx, 'P'),
  surrender: (ctx) => act(ctx, 'R'),
};

function act(ctx, code) {
  const st = ctx.state;
  if (!st || st.phase !== 'player') fail('No hand in play.');
  const h = st.hands[st.cur];
  const can = canFor(st, ctx.balance());
  const names = { H: 'hit', S: 'stand', D: 'double', P: 'split', R: 'surrender' };
  if (!can[names[code]]) fail(`You can't ${names[code]} right now.`);

  // grade before the move
  const up = val(st.dealer[0]);
  const bp = bestPlay(h.cards, up, can);
  const tc = trueCount(st);
  const dev = deviation(h.cards, up, tc, can);
  const label = handLabel(h.cards, up);
  const dec = { label, playedName: PLAY_NAME[code], bestName: PLAY_NAME[bp.code], ok: code === bp.code, kind: 'basic', text: '' };
  if (!dec.ok && dev && dev.play === code) { dec.ok = true; dec.kind = 'dev'; dec.text = `At a true count of ${tc >= 0 ? '+' : ''}${tc.toFixed(1)} the index says ${PLAY_NAME[code]}.`; }
  else if (!dec.ok) dec.text = whyNot(code, bp.code, h.cards, up);
  else if (dev && dev.play !== code) dec.devNote = `Count note on ${label}: true count ${tc >= 0 ? '+' : ''}${tc.toFixed(1)} meets the index for ${PLAY_NAME[dev.play]} — a card counter would have deviated here.`;
  st.decisions.push(dec);
  if (dec.kind === 'dev') ctx.rate('bj:dev:' + label, Math.max(1950, spotDifficulty(h.cards, up, code) + 500), 1);
  else if (!(dec.ok && dev && dev.play !== code && false)) ctx.rate('bj:' + label + ':' + bp.code, spotDifficulty(h.cards, up, bp.code), playQuality(code, bp.code));

  if (code === 'H') {
    h.cards.push(drawCard(st));
    if (info(h.cards).total >= 21) h.done = true;
  } else if (code === 'S') {
    h.done = true;
  } else if (code === 'D') {
    ctx.debit(h.bet); h.bet *= 2; h.doubled = true;
    h.cards.push(drawCard(st)); h.done = true;
  } else if (code === 'P') {
    ctx.debit(h.bet);
    const second = h.cards.pop();
    const aces = h.cards[0] % 13 === 12;
    h.fromSplit = true; h.aceSplit = aces; h.bj = false;
    const nh = { cards: [second], bet: h.bet, done: false, fromSplit: true, aceSplit: aces };
    st.hands.splice(st.cur + 1, 0, nh);
    h.cards.push(drawCard(st));
    if (aces || info(h.cards).total >= 21) h.done = true;
  } else if (code === 'R') {
    h.surrendered = true; h.done = true;
  }
  if (h.done) { st.cur++; }
  advanceHand(ctx, st);
}

const meta = {
  rules: [
    'Beat the dealer by getting closer to 21 without going over. Number cards are worth face value, J/Q/K are 10, and an Ace is 1 or 11.',
    'You and the dealer each get two cards; you see only one of the dealer\'s. Hit to take a card, Stand to stop, Double to double your bet and take exactly one card, Split a pair into two hands (an extra bet), Surrender to give up half your bet (only as your first action).',
    'Blackjack (Ace + 10-value on the first two cards) pays 3:2. Win pays 1:1, push returns your bet. Dealer stands on all 17s (including soft 17). Six decks, reshuffled when ~75% dealt. Double after split allowed, up to 4 hands, split Aces get one card each.',
    'When the dealer shows an Ace you may buy Insurance (half your bet, pays 2:1 if the dealer has blackjack). With a blackjack yourself this is "even money".',
    'Bets must be even numbers so blackjack pays exactly 3:2.',
  ],
  tips: [
    'Basic strategy (the Coach panel) cuts the house edge to about 0.5%. Never take insurance without a high count; always split Aces and 8s; never split 10s or 5s.',
    'Hi-Lo card counting: 2–6 = +1, 7–9 = 0, 10-A = −1. Add them up as cards appear (running count). Divide by decks remaining to get the true count. Bet more when the true count is +2 or higher, and use the index plays shown in the Coach.',
    'Side bets (Perfect Pairs, 21+3, Royal Match, Lucky Ladies, Buster) all have much higher house edges than the main game — treat them as entertainment.',
    'The count display can be switched off in the Coach panel — turn it off to practise counting in your head, and compare yourself against it.',
  ],
  sides: SIDE,
  maxBet: MAX_BET,
};

const { parallel } = require('../lib/sharedkit');
module.exports = {
  shared: parallel(5),
  id: 'blackjack', name: 'Blackjack', icon: '🃏', category: 'cards', skill: 'high',
  blurb: 'Six-deck shoe with live Hi-Lo count, basic-strategy coach, surrender, split, insurance and 5 side bets.',
  edge: '0.5% with perfect play', meta, view, actions,
  inProgress: st => !!st && (st.phase === 'player' || st.phase === 'insurance'),
  // exports for tests
  _t: { whyBest, PLAY_NAME, chartData, info, bestPlay, baseCode, deviation, evalPP, eval21p3, evalRM, evalLL, val, hilo },
};
