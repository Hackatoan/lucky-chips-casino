'use strict';
const C = require('../lib/cards');
const an = require('../lib/an');
const { fail } = require('../lib/engine');
const { parallel } = require('../lib/sharedkit');

const MAX_BET = 2000;

// ---- hand codes ----
const NONE = 0, PAIR_JB = 1, TWO_PAIR = 2, TRIPS = 3, STRAIGHT = 4, FLUSH = 5, FULL = 6, QUADS = 7, QUAD_A = 8, QUAD_24 = 9, QUAD_5K = 10, QUAD_A_K = 11, QUAD_24_K = 12, STR_FLUSH = 13, ROYAL = 14, FOUR_DEUCES = 15, WILD_ROYAL = 16, FIVE_OAK = 17;
const NAMES = {
  [NONE]: 'Nothing', [PAIR_JB]: 'Jacks or Better', [TWO_PAIR]: 'Two Pair', [TRIPS]: 'Three of a Kind', [STRAIGHT]: 'Straight', [FLUSH]: 'Flush', [FULL]: 'Full House', [QUADS]: 'Four of a Kind',
  [QUAD_A]: 'Four Aces', [QUAD_24]: 'Four 2s-4s', [QUAD_5K]: 'Four 5s-Ks', [QUAD_A_K]: 'Four Aces + 2-4 kicker', [QUAD_24_K]: 'Four 2s-4s + A-4 kicker', [STR_FLUSH]: 'Straight Flush', [ROYAL]: 'Royal Flush',
  [FOUR_DEUCES]: 'Four Deuces', [WILD_ROYAL]: 'Wild Royal', [FIVE_OAK]: 'Five of a Kind',
};

// ---- paytables: payout multiplier of the bet (profit + stake returned), indexed by hand code ----
const mk = o => { const a = new Array(18).fill(0); for (const [k, v] of Object.entries(o)) a[k] = v; return a; };
const jacks = (fh, fl) => mk({ [PAIR_JB]: 1, [TWO_PAIR]: 2, [TRIPS]: 3, [STRAIGHT]: 4, [FLUSH]: fl, [FULL]: fh, [QUAD_A]: 25, [QUAD_24]: 25, [QUAD_5K]: 25, [QUAD_A_K]: 25, [QUAD_24_K]: 25, [QUADS]: 25, [STR_FLUSH]: 50, [ROYAL]: 800 });
const VARIANTS = {
  'jacks-96': { name: 'Jacks or Better 9/6', rtp: 0.9954, family: 'jacks', pay: jacks(9, 6), table: 'Full house 9 · Flush 6 · Straight 4 · Trips 3 · Two pair 2 · Jacks+ 1' },
  'jacks-85': { name: 'Jacks or Better 8/5', rtp: 0.9730, family: 'jacks', pay: jacks(8, 5), table: 'Full house 8 · Flush 5 · Straight 4 · Trips 3 · Two pair 2 · Jacks+ 1' },
  'jacks-65': { name: 'Jacks or Better 6/5', rtp: 0.9459, family: 'jacks', pay: jacks(6, 5), table: 'Full house 6 · Flush 5 · Straight 4 · Trips 3 · Two pair 2 · Jacks+ 1' },
  'bonus-85': { name: 'Bonus Poker 8/5', rtp: 0.9917, family: 'jacks', table: 'Quad Aces 80 · Quad 2-4 40 · Quad 5-K 25 · Full house 8 · Flush 5',
    pay: mk({ [PAIR_JB]: 1, [TWO_PAIR]: 2, [TRIPS]: 3, [STRAIGHT]: 4, [FLUSH]: 5, [FULL]: 8, [QUAD_A]: 80, [QUAD_A_K]: 80, [QUAD_24]: 40, [QUAD_24_K]: 40, [QUAD_5K]: 25, [QUADS]: 25, [STR_FLUSH]: 50, [ROYAL]: 800 }) },
  'ddb-96': { name: 'Double Double Bonus 9/6', rtp: 0.9898, family: 'jacks', table: 'Aces+2-4 kicker 400 · Aces 160 · 2-4 + A-4 kicker 160 · 2-4 80 · 5-K 50 · Full house 9 · Flush 6 · Two pair 1',
    pay: mk({ [PAIR_JB]: 1, [TWO_PAIR]: 1, [TRIPS]: 3, [STRAIGHT]: 4, [FLUSH]: 6, [FULL]: 9, [QUAD_A_K]: 400, [QUAD_A]: 160, [QUAD_24_K]: 160, [QUAD_24]: 80, [QUAD_5K]: 50, [QUADS]: 50, [STR_FLUSH]: 50, [ROYAL]: 800 }) },
  'deuces-full': { name: 'Deuces Wild (full pay)', rtp: 1.0076, family: 'deuces', table: 'Nat. royal 800 · Four deuces 200 · Wild royal 25 · Five of a kind 15 · Str. flush 9 · Quads 5 · Full house 3 · Flush 2 · Straight 2 · Trips 2',
    pay: mk({ [ROYAL]: 800, [FOUR_DEUCES]: 200, [WILD_ROYAL]: 25, [FIVE_OAK]: 15, [STR_FLUSH]: 9, [QUADS]: 5, [FULL]: 3, [FLUSH]: 2, [STRAIGHT]: 2, [TRIPS]: 2 }) },
};

// ---- fast evaluators (cards 0..51; rank = c % 13 with 0 = '2' ... 12 = 'A') ----
const cnt = new Int8Array(13);
const STRAIGHT_MASK = new Uint8Array(8192);            // 13-bit rank masks of 5 distinct ranks forming a straight
{
  for (let low = 0; low <= 8; low++) STRAIGHT_MASK[(0b11111) << low] = 1;      // 2-6 ... 10-A
  STRAIGHT_MASK[(1 << 12) | 0b1111] = 1;                                          // A-2-3-4-5 wheel
}
const ROYAL_MASK = 0b1111100000000;

function classifyJacks(a, b, c, d, e) {
  const ra = a % 13, rb = b % 13, rc = c % 13, rd = d % 13, re = e % 13;
  cnt[ra]++; cnt[rb]++; cnt[rc]++; cnt[rd]++; cnt[re]++;
  let pairs = 0, trips = 0, quads = 0, pairRank = -1, quadRank = -1, mask = 0, high = false;
  for (let i = 0; i < 5; i++) {
    const r = i === 0 ? ra : i === 1 ? rb : i === 2 ? rc : i === 3 ? rd : re;
    const k = cnt[r];
    if (k > 0) {
      mask |= 1 << r;
      if (k === 2) { pairs++; pairRank = r; if (r >= 9) high = true; } else if (k === 3) trips++; else if (k === 4) { quads++; quadRank = r; }
      cnt[r] = 0;
    }
  }
  const flush = ((a / 13) | 0) === ((b / 13) | 0) && ((b / 13) | 0) === ((c / 13) | 0) && ((c / 13) | 0) === ((d / 13) | 0) && ((d / 13) | 0) === ((e / 13) | 0);
  if (quads) {
    const kick = (ra === quadRank ? (rb === quadRank ? (rc === quadRank ? (rd === quadRank ? re : rd) : rc) : rb) : ra);
    if (quadRank === 12) return kick <= 2 ? QUAD_A_K : QUAD_A;
    if (quadRank <= 2) return kick <= 2 || kick === 12 ? QUAD_24_K : QUAD_24;
    return QUAD_5K;
  }
  if (trips) return pairs ? FULL : TRIPS;
  const straight = !pairs && STRAIGHT_MASK[mask] === 1;
  if (flush && straight) return mask === ROYAL_MASK ? ROYAL : STR_FLUSH;
  if (flush) return FLUSH;
  if (straight) return STRAIGHT;
  if (pairs === 2) return TWO_PAIR;
  if (pairs === 1 && high) return PAIR_JB;
  return NONE;
}
function classifyDeuces(a, b, c, d, e) {
  // cards are in an array-less call for speed; split deuces (rank 0) from the rest
  let w = 0, n = 0;
  const rs = [0, 0, 0, 0, 0], ss = [0, 0, 0, 0, 0];
  const arr = [a, b, c, d, e];
  for (let i = 0; i < 5; i++) { const r = arr[i] % 13; if (r === 0) w++; else { rs[n] = r; ss[n] = (arr[i] / 13) | 0; n++; } }
  if (w === 4) return FOUR_DEUCES;
  if (w === 5) return FIVE_OAK;
  let mask = 0, maxc = 0, c2 = 0;
  for (let i = 0; i < n; i++) cnt[rs[i]]++;
  for (let i = 0; i < n; i++) { const r = rs[i], k = cnt[r]; if (k > 0) { mask |= 1 << r; if (k > maxc) { c2 = maxc; maxc = k; } else if (k > c2) c2 = k; cnt[r] = 0; } }
  let suited = true;
  for (let i = 1; i < n; i++) if (ss[i] !== ss[0]) { suited = false; break; }
  const distinct = popcount(mask) === n;
  const inWindow = distinct && fitsStraight(mask, n, w);
  if (w === 0) {
    if (maxc === 4) return QUADS;
    if (maxc === 3) return c2 === 2 ? FULL : TRIPS;
    if (suited && inWindow) return mask === ROYAL_MASK ? ROYAL : STR_FLUSH;
    if (suited) return FLUSH;
    if (inWindow) return STRAIGHT;
    return NONE;                                   // pairs don't pay in Deuces Wild
  }
  if (maxc + w === 5) return FIVE_OAK;
  if (suited && inWindow && (mask & ~ROYAL_MASK) === 0) return WILD_ROYAL;
  if (suited && inWindow) return STR_FLUSH;
  if (maxc + w === 4) return QUADS;
  if (maxc + w === 3 && c2 === 2 && w === 1) return FULL;            // two pair + wild
  if (suited) return FLUSH;
  if (inWindow) return STRAIGHT;
  if (maxc + w >= 3) return TRIPS;
  return NONE;
}
function popcount(x) { let c = 0; while (x) { x &= x - 1; c++; } return c; }
// can n distinct non-deuce ranks (plus w wilds) form a straight? (A may be high or low)
function fitsStraight(mask, n, w) {
  for (let low = -1; low <= 8; low++) {
    let win = 0;
    for (let i = 0; i < 5; i++) { const r = low + i; win |= r < 0 ? (1 << 12) : (1 << r); }
    if ((mask & ~win) === 0) return true;
  }
  return false;
}

const classifier = v => (v.family === 'deuces' ? classifyDeuces : classifyJacks);

// ---- exact EV for all 32 holds ----
function evAll(hand, deck, variant) {
  const cls = classifier(variant), pay = variant.pay;
  const evs = new Array(32);
  const L = deck.length;
  for (let mask = 0; mask < 32; mask++) {
    const held = [];
    for (let i = 0; i < 5; i++) if (mask & (1 << i)) held.push(hand[i]);
    const k = 5 - held.length;
    const h0 = held[0], h1 = held[1], h2 = held[2], h3 = held[3];
    let sum = 0, n = 0;
    if (k === 0) { evs[mask] = pay[cls(held[0], held[1], held[2], held[3], held[4])]; continue; }
    if (k === 1) { for (let i = 0; i < L; i++) sum += pay[cls(h0, h1, h2, h3, deck[i])]; n = L; }
    else if (k === 2) { for (let i = 0; i < L - 1; i++) for (let j = i + 1; j < L; j++) sum += pay[cls(h0, h1, h2, deck[i], deck[j])]; n = L * (L - 1) / 2; }
    else if (k === 3) { for (let i = 0; i < L - 2; i++) for (let j = i + 1; j < L - 1; j++) for (let l = j + 1; l < L; l++) sum += pay[cls(h0, h1, deck[i], deck[j], deck[l])]; n = L * (L - 1) * (L - 2) / 6; }
    else if (k === 4) { for (let i = 0; i < L - 3; i++) for (let j = i + 1; j < L - 2; j++) for (let l = j + 1; l < L - 1; l++) for (let m = l + 1; m < L; m++) sum += pay[cls(h0, deck[i], deck[j], deck[l], deck[m])]; n = L * (L - 1) * (L - 2) * (L - 3) / 24; }
    else { for (let i = 0; i < L - 4; i++) for (let j = i + 1; j < L - 3; j++) for (let l = j + 1; l < L - 2; l++) for (let m = l + 1; m < L - 1; m++) for (let o = m + 1; o < L; o++) sum += pay[cls(deck[i], deck[j], deck[l], deck[m], deck[o])]; n = L * (L - 1) * (L - 2) * (L - 3) * (L - 4) / 120; }
    evs[mask] = sum / n;
  }
  return evs;
}

// ---- naming a hold for the coach ----
const rk = c => c % 13, su = c => (c / 13) | 0;
const RN = '23456789TJQKA';
function holdName(hand, mask, variant) {
  const h = hand.filter((_, i) => mask & (1 << i));
  const n = h.length;
  if (n === 0) return 'Discard all five cards';
  const deuces = variant.family === 'deuces';
  const wild = deuces ? h.filter(c => rk(c) === 0).length : 0;
  const rest = deuces ? h.filter(c => rk(c) !== 0) : h;
  const ranks = rest.map(rk).sort((a, b) => a - b);
  const suited = rest.length > 0 && rest.every(c => su(c) === su(rest[0]));
  const cs = {}; for (const r of ranks) cs[r] = (cs[r] || 0) + 1;
  const counts = Object.values(cs).sort((a, b) => b - a);
  const hiCards = rest.filter(c => rk(c) >= 9).length;
  const cls = classifier(variant);
  if (n === 5) { const code = cls(h[0], h[1], h[2], h[3], h[4]); return code === NONE ? 'Nothing (keeping all five)' : 'Pat hand: ' + NAMES[code]; }
  const base = (() => {
    if (counts[0] === 4) return 'Four of a kind';
    if (counts[0] === 3 && counts[1] === 2) return 'Full house';
    if (counts[0] === 3) return 'Three of a kind';
    if (counts[0] === 2 && counts[1] === 2) return 'Two pair';
    if (counts[0] === 2) { const pr = +Object.keys(cs).find(r => cs[r] === 2); return pr >= 9 ? `High pair (${RN[pr] === 'T' ? '10' : RN[pr]}s)` : `Low pair (${RN[pr] === 'T' ? '10' : RN[pr]}s)`; }
    return null;
  })();
  if (deuces) {
    const d = wild ? `${wild} deuce${wild > 1 ? 's' : ''} + ` : '';
    if (suited && rest.length >= 2) {
      const royal = rest.every(c => rk(c) >= 8);
      return `${d}${royal ? 'to a royal flush' : 'suited cards (flush/straight-flush draw)'}${rest.length ? '' : ''}`.replace(/^ \+ /, '');
    }
    return wild ? `${wild} deuce${wild > 1 ? 's' : ''}${base ? ' + ' + base.toLowerCase() : rest.length ? ' + ' + rest.length + ' other card' + (rest.length > 1 ? 's' : '') : ''}` : (base || (n === 1 ? 'A single card' : n + ' cards'));
  }
  if (base) return base;
  const spread = ranks.length ? ranks[ranks.length - 1] - ranks[0] : 0;
  if (n === 4) {
    if (suited && ranks.every(r => r >= 8)) return '4 to a royal flush';
    if (suited && (spread <= 4 || (ranks.includes(12) && ranks.slice(0, 3).every(r => r <= 3)))) return '4 to a straight flush';
    if (suited) return '4 to a flush';
    if (spread === 3) return ranks[0] === 0 || ranks[3] === 12 ? '4 to a straight (one end only)' : '4 to an outside straight';
    if (spread === 4) return '4 to an inside straight';
    return '4 unconnected cards';
  }
  if (n === 3) {
    if (suited && ranks.every(r => r >= 8)) return '3 to a royal flush';
    if (suited && spread <= 4) return '3 to a straight flush';
    if (suited) return '3 suited cards';
    return hiCards === 3 ? '3 high cards' : `${n} cards`;
  }
  if (n === 2) {
    if (suited && hiCards === 2) return 'Two suited high cards';
    if (hiCards === 2) return 'Two unsuited high cards';
    if (suited) return 'Two suited cards';
    return hiCards === 1 ? 'A high card + a low card' : 'Two low cards';
  }
  return hiCards ? `A single high card (${h.map(c => RN[rk(c)]).join('')})` : 'A single low card';
}
const HOLD_WHY = [
  [/^Pat hand/, 'A made hand that already pays — drawing from it would risk what you have.'],
  [/royal flush/, 'The royal flush pays 800×, so even a slim chance of completing it is worth more than most made hands.'],
  [/^Four of a kind|^Full house/, 'A big made hand: keep it.'],
  [/^Three of a kind/, 'Trips can improve to a full house or four of a kind; discard the other two cards.'],
  [/^Two pair/, 'Two pair pays now and can fill to a full house (4 outs); keep it rather than breaking a pair.'],
  [/^High pair/, 'A pair of Jacks or better already pays 1:1 and can improve to trips, two pair, a full house or quads — it beats almost every draw.'],
  [/^Low pair/, 'A low pair doesn\'t pay by itself, but it still improves to trips/two pair/full house more often than a draw makes a paying hand.'],
  [/straight flush/, 'Four cards to a straight flush: pays on straights, flushes and straight flushes — many ways to win.'],
  [/4 to a flush/, '9 flush outs out of 47 cards (19%): a flush pays 6× and the high cards also help.'],
  [/outside straight/, '8 straight outs (17%): only pays 4×, so it\'s weaker than a high pair but stronger than one lonely high card.'],
  [/inside straight/, 'Only 4 outs to the straight (8.5%); keep it only if it also contains several high cards.'],
  [/suited cards|suited high/, 'Suited high cards keep royal, flush and high-pair chances alive.'],
  [/high card/i, 'One high card gives you 3 outs to a paying pair plus the chance of a straight/flush with the draw.'],
  [/^Discard all five/, 'None of your cards is worth keeping — a fresh five-card draw averages more than any one of these holds.'],
  [/deuce/i, 'In Deuces Wild, deuces are wild: keeping them is almost always right, and pairs don\'t pay.'],
];
const holdWhy = name => (HOLD_WHY.find(([re]) => re.test(name)) || [0, ''])[1];

// ---- state & flow ----
function view(st, { coachOn = true, rules } = {}) {
  const variant = VARIANTS[(rules && rules.variant) || (st && st.variant) || 'jacks-96'] || VARIANTS['jacks-96'];
  const v = { variant: variant.name, table: variant.table, rtp: variant.rtp, paytable: payTable(variant), maxBet: MAX_BET, deuces: variant.family === 'deuces' };
  if (!st) return { ...v, phase: 'idle' };
  v.phase = st.phase; v.bet = st.bet; v.hand = C.strs(st.hand); v.holds = st.holds || null;
  if (st.phase === 'collect' || st.phase === 'gamble') { v.pot = st.pot; v.result = st.result; v.ups = st.ups; }
  if (st.phase === 'gamble') { v.dealer = C.str(st.gDealer); v.backs = st.gBacks; }
  if (st.phase === 'gamble-done') { v.dealer = C.str(st.gDealer); v.picked = st.gPick; v.cards = st.gCards.map(C.str); v.outcome = st.gOutcome; v.pot = st.gOutcome === 'lose' ? 0 : st.pot; v.result = st.result; v.ups = st.ups; }
  if (coachOn && st.phase === 'draw' && st.evs) {
    const order = st.evs.map((ev, mask) => ({ mask, ev })).sort((a, b) => b.ev - a.ev);
    const seen = new Set(), top = [];
    for (const x of order) {                                   // one entry per distinct idea (not one per kicker variant)
      const name = holdName(st.hand, x.mask, VARIANTS[st.variant]);
      if (seen.has(name)) continue; seen.add(name);
      top.push({ mask: x.mask, ev: x.ev, name, why: holdWhy(name) });
      if (top.length === 5) break;
    }
    v.coach = { best: order[0].mask, bestEV: order[0].ev, top };
  }
  return v;
}
function payTable(variant) {
  const p = variant.pay;
  const rows = [];
  const add = (name, mult) => { if (mult) rows.push([name, mult]); };
  if (variant.family === 'deuces') {
    for (const c of [ROYAL, FOUR_DEUCES, WILD_ROYAL, FIVE_OAK, STR_FLUSH, QUADS, FULL, FLUSH, STRAIGHT, TRIPS]) add(NAMES[c], p[c]);
    return rows;
  }
  add('Royal Flush', p[ROYAL]); add('Straight Flush', p[STR_FLUSH]);
  const q = [[QUAD_A_K, 'Four Aces + 2-4 kicker'], [QUAD_A, 'Four Aces'], [QUAD_24_K, 'Four 2s-4s + A-4 kicker'], [QUAD_24, 'Four 2s-4s'], [QUAD_5K, 'Four 5s-Ks']];
  if (q.every(([c]) => p[c] === p[QUAD_5K])) add('Four of a Kind', p[QUAD_5K]);
  else {
    const aceKick = p[QUAD_A_K] !== p[QUAD_A], lowKick = p[QUAD_24_K] !== p[QUAD_24];
    if (aceKick) { add('Four Aces + 2-4 kicker', p[QUAD_A_K]); add('Four Aces', p[QUAD_A]); } else add('Four Aces', p[QUAD_A]);
    if (lowKick) { add('Four 2s-4s + A-4 kicker', p[QUAD_24_K]); add('Four 2s-4s', p[QUAD_24]); } else add('Four 2s-4s', p[QUAD_24]);
    add('Four 5s-Ks', p[QUAD_5K]);
  }
  for (const c of [FULL, FLUSH, STRAIGHT, TRIPS, TWO_PAIR, PAIR_JB]) add(NAMES[c], p[c]);
  return rows;
}

const actions = {
  deal(ctx, body) {
    if (ctx.state && (ctx.state.phase === 'draw' || ctx.state.phase === 'collect' || ctx.state.phase === 'gamble')) fail('Finish the current hand first.');
    const bet = ctx.int(body.bet, { min: 1, max: MAX_BET, label: 'Bet' });
    const vkey = ctx.opt('variant');
    const variant = VARIANTS[vkey];
    ctx.debit(bet);
    const deck = C.newDeck(); require('../lib/rng').shuffle(deck);
    const hand = deck.splice(0, 5);
    const t0 = Date.now();
    const evs = evAll(hand, deck, variant);
    ctx.state = { phase: 'draw', variant: vkey, bet, hand, deck, evs, ups: 0 };
    ctx.state.ms = Date.now() - t0;
  },
  draw(ctx, body) {
    const st = ctx.state;
    if (!st || st.phase !== 'draw') fail('Deal a hand first.');
    const holds = Array.isArray(body.holds) ? body.holds.slice(0, 5).map(Boolean) : [];
    while (holds.length < 5) holds.push(false);
    const variant = VARIANTS[st.variant];
    let mask = 0; holds.forEach((h, i) => { if (h) mask |= 1 << i; });
    const ranked = st.evs.map((ev, m) => ({ m, ev })).sort((a, b) => b.ev - a.ev);
    const best = ranked[0], mine = st.evs[mask];
    const evLoss = best.ev - mine;
    // grade: quality falls off with EV lost; difficulty from the gap between the top two holds (small gap = hard call)
    const gap = ranked[0].ev - ranked[1].ev;
    const diff = 800 + 1100 * Math.max(0, Math.min(1, 1 - gap / 0.5));
    ctx.rate('vp:' + st.variant, diff, Math.max(0, 1 - evLoss / 0.30));
    ctx.skill(evLoss < 0.0005 ? 1 : 0, 1);
    const old = st.hand.slice();
    st.holds = holds;
    for (let i = 0; i < 5; i++) if (!holds[i]) st.hand[i] = st.deck.pop();
    const code = classifier(variant)(st.hand[0], st.hand[1], st.hand[2], st.hand[3], st.hand[4]);
    const mult = variant.pay[code];
    st.result = { code, name: NAMES[code], mult };
    st.pot = st.bet * mult;
    st.lastReview = { old: C.shorts(old), mask, best: best.m, bestEV: best.ev, mine, evLoss, topHold: holdName(old, best.m, variant), myHold: holdName(old, mask, variant), second: ranked[1] };
    st.evs = null; st.deck = null;
    if (st.pot > 0) { st.phase = 'collect'; st.ups = 0; return; }
    return finish(ctx, st, 0);
  },
  collect(ctx) {
    const st = ctx.state;
    if (!st || (st.phase !== 'collect')) fail('Nothing to collect.');
    return finish(ctx, st, st.pot);
  },
  double(ctx) {
    const st = ctx.state;
    if (!st || st.phase !== 'collect') fail('You can only double-up a winning hand.');
    if (st.ups >= 5) fail('Maximum of 5 double-ups reached — collect your win.');
    const deck = C.newDeck(); require('../lib/rng').shuffle(deck);
    st.gDealer = deck.pop(); st.gCards = deck.splice(0, 4); st.gBacks = 4; st.phase = 'gamble';
  },
  pick(ctx, body) {
    const st = ctx.state;
    if (!st || st.phase !== 'gamble') fail('Start a double-up first.');
    const i = ctx.int(body.index, { min: 0, max: 3, label: 'Card' });
    const mine = st.gCards[i] % 13, theirs = st.gDealer % 13;
    st.gPick = i;
    st.ups++;
    st.phase = 'gamble-done';
    if (mine > theirs) { st.pot *= 2; st.gOutcome = 'win'; }
    else if (mine === theirs) st.gOutcome = 'push';
    else st.gOutcome = 'lose';
  },
  next(ctx) {                      // after a double-up reveal
    const st = ctx.state;
    if (!st || st.phase !== 'gamble-done') fail('Nothing to continue.');
    if (st.gOutcome === 'lose') { return finish(ctx, st, 0, true); }
    st.phase = 'collect';
  },
};

function finish(ctx, st, payout, lostGamble) {
  if (payout > 0) ctx.credit(payout);
  const r = st.lastReview, variant = VARIANTS[st.variant];
  const net = payout - st.bet;
  const items = [];
  items.push(an.info(`Dealt: ${r.old}`));
  items.push(an.info(`You held: ${r.myHold}. Final hand: ${C.shorts(st.hand)} — ${st.result.name}${st.result.mult ? ` (pays ${st.result.mult}×)` : ''}.`));
  const decision = [];
  if (r.evLoss < 0.0005) decision.push(an.good(`Perfect hold: ${r.myHold} was the highest-EV play (expected return ${(r.mine * 100).toFixed(1)}% of your bet).`));
  else {
    decision.push(an.bad(`Better hold: ${r.topHold} (EV ${(r.bestEV * 100).toFixed(1)}%) instead of ${r.myHold} (EV ${(r.mine * 100).toFixed(1)}%). That choice cost you about ${(r.evLoss * st.bet).toFixed(2)} chips on average (${(r.evLoss * 100).toFixed(1)}% of the bet).`));
    const why = holdWhy(r.topHold); if (why) decision.push(an.tip(why));
  }
  if (r.second && r.evLoss < 0.0005) decision.push(an.info(`The runner-up hold was worth ${(r.second.ev * 100).toFixed(1)}%, so this was ${(r.bestEV - r.second.ev) < 0.02 ? 'a close call' : 'a clear decision'}.`));
  const tips = [
    an.info(`${variant.name}: theoretical return ${(variant.rtp * 100).toFixed(2)}% with perfect play (${((1 - variant.rtp) * 100).toFixed(2)}% edge). ${variant.table}.`),
    an.tip('Always check the paytable before you sit down: the same game with a 8/5 or 6/5 full-house/flush pays 2–5% less — a big difference over hundreds of hands.'),
  ];
  if (st.ups) tips.push(an.info(`You doubled up ${st.ups} time${st.ups > 1 ? 's' : ''}. Double-up is a fair coin flip (ties push) — zero edge, pure variance. It never changes your expected result, only your risk.`));
  if (variant.family === 'deuces') tips.push(an.tip('In Deuces Wild never break four deuces, and keep any deuce — they are worth far more than any natural card.'));
  else tips.push(an.tip('Rules of thumb: keep any paying made hand; then 4 to a royal; then high pairs; draw to straights/flushes only when you have no high pair.'));
  ctx.end(`Video poker ${st.result.name}${lostGamble ? ' (lost double-up)' : ''}`);
  st.phase = 'done';
  return an.review(lostGamble ? 'Lost the double-up' : st.result.name, net, [['Hand', items], ['Your hold', decision], ['Odds & tips', tips]]);
}

module.exports = {
  id: 'videopoker', name: 'Video Poker', icon: '🂡', category: 'cards', skill: 'high',
  blurb: 'Jacks or Better, Bonus Poker, Double Double Bonus and Deuces Wild — the coach shows the exact EV of every hold.',
  edge: '0.5% (9/6 full pay) – 5.4%', shared: parallel(6),
  meta: {
    rules: [
      'Choose your bet and press Deal: you get five cards. Tap the cards you want to HOLD, then press Draw — the rest are replaced from the same deck. The final hand is paid by the paytable.',
      'Jacks or Better pays any pair of Jacks or higher. Bonus Poker and Double Double Bonus add extra pay for specific four-of-a-kinds. In Deuces Wild all 2s are wild and pairs don\'t pay.',
      'After a win you can "Double up": a fair guess against a dealer card (pick one of four face-down cards — higher wins, ties push), up to 5 times.',
      'The paytable setting matters: pick the table under Rules to change the house edge.',
    ],
    tips: [
      'The Coach computes the exact expected value of all 32 possible holds for your hand and ranks them — study why a "boring" hold is often the best.',
      'Never keep a kicker with a pair; never break a made flush or straight to chase a royal; always hold four to a royal.',
      'Bet max-coins on real machines for the 4000× royal. Here the royal pays 800× at every bet size, so you can bet any amount.',
      'With the 9/6 Jacks or Better table you give up only 0.46% with perfect strategy — the best video-poker odds in the casino.',
    ],
    options: [
      { key: 'variant', label: 'Game & paytable', type: 'select', default: 'jacks-96', choices: Object.entries(VARIANTS).map(([v, d]) => ({ v, label: `${d.name} — ${(d.rtp * 100).toFixed(2)}% return`, edge: +((1 - d.rtp) * 100).toFixed(2) })) },
    ],
  },
  view, actions,
  inProgress: st => !!st && ['draw', 'collect', 'gamble', 'gamble-done'].includes(st.phase),
  _t: { classifyJacks, classifyDeuces, evAll, VARIANTS, holdName, NAMES },
};
