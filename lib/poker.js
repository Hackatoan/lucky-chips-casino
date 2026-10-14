'use strict';
// Texas Hold'em engine: hand evaluation, the betting state machine (blinds, no-limit raises, all-ins, side pots) and a bot brain.
// Pure logic — no I/O. The table layer (tables.js) owns chips, timers, privacy and persistence.
const C = require('./cards');
const R = require('./rng');

const rk = c => c % 13;                 // 0='2' … 12='A'
const su = c => (c / 13) | 0;
const CAT = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
const RN = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const RNP = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

// ---------------------------------------------------------------- evaluation
// 5 cards -> integer, bigger is better. cat*13^5 + up to five tie-break ranks.
function score5(cs) {
  const ranks = cs.map(rk).sort((a, b) => b - a);
  const flush = cs.every(c => su(c) === su(cs[0]));
  const cnt = {}; for (const r of ranks) cnt[r] = (cnt[r] || 0) + 1;
  const groups = Object.entries(cnt).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const uniq = [...new Set(ranks)];
  let sh = -1;
  if (uniq.length === 5) { if (uniq[0] - uniq[4] === 4) sh = uniq[0]; else if (uniq[0] === 12 && uniq[1] === 3) sh = 3; }   // A-2-3-4-5 plays low
  const kick = (skip) => ranks.filter(r => !skip.includes(r));
  let cat, tie;
  if (sh >= 0 && flush) { cat = 8; tie = [sh]; }
  else if (groups[0][0] === 4) { cat = 7; tie = [groups[0][1], groups[1][1]]; }
  else if (groups[0][0] === 3 && groups[1] && groups[1][0] === 2) { cat = 6; tie = [groups[0][1], groups[1][1]]; }
  else if (flush) { cat = 5; tie = ranks; }
  else if (sh >= 0) { cat = 4; tie = [sh]; }
  else if (groups[0][0] === 3) { cat = 3; tie = [groups[0][1], ...kick([groups[0][1]])]; }
  else if (groups[0][0] === 2 && groups[1] && groups[1][0] === 2) { cat = 2; tie = [groups[0][1], groups[1][1], ...kick([groups[0][1], groups[1][1]])]; }
  else if (groups[0][0] === 2) { cat = 1; tie = [groups[0][1], ...kick([groups[0][1]])]; }
  else { cat = 0; tie = ranks; }
  let sc = cat; for (let i = 0; i < 5; i++) sc = sc * 13 + (tie[i] || 0);
  return sc;
}
const COMBOS7 = []; for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) COMBOS7.push([a, b]);   // the two cards left OUT of a 7-card hand
function best(cards) {                                   // best five of 5–7 cards
  const n = cards.length; if (n < 5) return { score: -1, cards: [] };
  if (n === 5) return { score: score5(cards), cards: cards.slice() };
  let bs = -1, bc = null;
  const idx = [...Array(n).keys()];
  const pick = (start, left, chosen) => {
    if (left === 0) { const hand = chosen.map(i => cards[i]); const s = score5(hand); if (s > bs) { bs = s; bc = hand; } return; }
    for (let i = start; i <= n - left; i++) { chosen.push(i); pick(i + 1, left - 1, chosen); chosen.pop(); }
  };
  pick(0, 5, []);
  return { score: bs, cards: bc };
}
const catOf = score => Math.floor(score / 13 ** 5);
function describe(score) {
  const cat = catOf(score), t = []; let s = score; for (let i = 0; i < 5; i++) { t.unshift(s % 13); s = Math.floor(s / 13); }
  switch (cat) {
    case 8: return t[0] === 12 ? 'Royal flush' : `Straight flush, ${RN[t[0]]} high`;
    case 7: return `Four of a kind, ${RNP[t[0]]}`;
    case 6: return `Full house, ${RNP[t[0]]} full of ${RNP[t[1]]}`;
    case 5: return `Flush, ${RN[t[0]]} high`;
    case 4: return `Straight, ${RN[t[0]]} high`;
    case 3: return `Three of a kind, ${RNP[t[0]]}`;
    case 2: return `Two pair, ${RNP[t[0]]} and ${RNP[t[1]]}`;
    case 1: return `Pair of ${RNP[t[0]]}`;
    default: return `${RN[t[0]]} high`;
  }
}

// ---------------------------------------------------------------- hand state machine
// seats: [{ id, name, stack }] in table order (only players dealt in). button: index into seats.
function newHand({ seats, button, sb, bb, deck }) {
  const players = seats.map((s, i) => ({ i, id: s.id, name: s.name, stack: s.stack, bet: 0, total: 0, folded: false, allIn: false, acted: false, locked: false, hole: [] }));
  const h = { players, button, sb, bb, deck: deck || R.shuffle(C.newDeck()), board: [], street: 'pre', toAct: -1, curBet: 0, minRaise: bb, log: [], done: false, result: null, lastAggressor: -1 };
  const n = players.length;
  const next = i => (i + 1) % n;
  for (let r = 0; r < 2; r++) for (let k = 1; k <= n; k++) players[(button + k) % n].hole.push(h.deck.pop());
  const sbIdx = n === 2 ? button : next(button), bbIdx = next(sbIdx);
  h.sbIdx = sbIdx; h.bbIdx = bbIdx;
  const post = (p, amt) => { const a = Math.min(amt, p.stack); p.stack -= a; p.bet += a; p.total += a; if (p.stack === 0) p.allIn = true; return a; };
  post(players[sbIdx], sb); post(players[bbIdx], bb);
  h.curBet = Math.max(players[sbIdx].bet, players[bbIdx].bet);
  h.log.push({ t: 'blinds', sb: players[sbIdx].bet, bb: players[bbIdx].bet });
  h.toAct = nextActor(h, bbIdx);
  if (h.toAct < 0) runOut(h);          // everybody is all-in from the blinds
  return h;
}
const live = h => h.players.filter(p => !p.folded);
const canAct = p => !p.folded && !p.allIn;
function nextActor(h, from) {
  const n = h.players.length;
  for (let k = 1; k <= n; k++) { const p = h.players[(from + k) % n]; if (canAct(p) && !(p.acted && p.bet === h.curBet)) return p.i; }
  return -1;
}
function toCall(h, p) { return Math.max(0, h.curBet - p.bet); }
function legal(h, idx) {
  const p = h.players[idx];
  if (h.done || h.toAct !== idx || !p) return null;
  const call = Math.min(toCall(h, p), p.stack);
  const o = { fold: true, check: toCall(h, p) === 0, call: call > 0 ? call : 0, toCall: toCall(h, p) };
  const maxTo = p.bet + p.stack;
  const minTo = Math.min(maxTo, h.curBet + h.minRaise);
  const others = h.players.some(q => q.i !== idx && canAct(q));      // raising is pointless when nobody can respond
  if (!p.locked && maxTo > h.curBet && others) o.raise = { min: minTo, max: maxTo };
  return o;
}
function act(h, idx, action, to) {
  const p = h.players[idx], lg = legal(h, idx);
  if (!lg) throw new Error('Not your turn.');
  const put = amt => { const a = Math.min(amt, p.stack); p.stack -= a; p.bet += a; p.total += a; if (p.stack === 0) p.allIn = true; return a; };
  if (action === 'fold') { p.folded = true; h.log.push({ t: 'fold', i: idx }); }
  else if (action === 'check') { if (!lg.check) throw new Error('You can\'t check — there is a bet to call.'); p.acted = true; h.log.push({ t: 'check', i: idx }); }
  else if (action === 'call') { if (lg.toCall === 0) throw new Error('Nothing to call — check instead.'); const a = put(lg.toCall); p.acted = true; h.log.push({ t: 'call', i: idx, amt: a }); }
  else if (action === 'raise' || action === 'bet') {
    if (!lg.raise) throw new Error('You can\'t raise here.');
    to = Math.floor(Number(to));
    if (!Number.isFinite(to)) throw new Error('Enter a raise amount.');
    const allInTo = p.bet + p.stack;
    if (to > allInTo) throw new Error(`You only have ${p.stack} behind.`);
    if (to < lg.raise.min && to !== allInTo) throw new Error(`The minimum raise is to ${lg.raise.min}.`);
    const size = to - h.curBet, wasBet = h.curBet === 0;
    put(to - p.bet);
    const full = size >= h.minRaise;
    if (full) { h.minRaise = size; for (const q of h.players) if (q.i !== idx) { q.locked = false; if (canAct(q)) q.acted = false; } }
    else for (const q of h.players) if (q.i !== idx && canAct(q) && q.acted) { q.acted = false; q.locked = true; }   // short all-in: callers may only call/fold
    h.curBet = Math.max(h.curBet, p.bet); p.acted = true; h.lastAggressor = idx;
    h.log.push({ t: wasBet ? 'bet' : 'raise', i: idx, to: p.bet, allIn: p.allIn });
  } else throw new Error('Unknown action.');
  advance(h);
  return h;
}
function advance(h) {
  const alive = live(h);
  if (alive.length === 1) return finish(h, false);
  const actors = alive.filter(canAct);
  const need = actors.filter(p => !(p.acted && p.bet === h.curBet));
  const noBettingLeft = actors.length === 1 && actors[0].bet >= h.curBet;       // the others are all-in and this player has nothing to call
  if (need.length && !noBettingLeft) { h.toAct = nextActor(h, h.toAct); if (h.toAct >= 0) return; }
  nextStreet(h);
}
// a player leaves mid-hand: they fold wherever the action is
function forceFold(h, idx) {
  const p = h.players[idx]; if (!p || p.folded || h.done) return;
  p.folded = true; h.log.push({ t: 'fold', i: idx, forced: true });
  const alive = live(h);
  if (alive.length === 1) return finish(h, false);
  if (h.toAct === idx) return advance(h);
  const actors = alive.filter(canAct);
  if (!actors.some(q => !(q.acted && q.bet === h.curBet)) || (actors.length === 1 && actors[0].bet >= h.curBet)) nextStreet(h);
}
function nextStreet(h) {
  for (const p of h.players) { p.bet = 0; p.acted = false; p.locked = false; }
  h.curBet = 0; h.minRaise = h.bb; h.lastAggressor = -1;
  const alive = live(h), actors = alive.filter(canAct);
  if (h.street === 'river') return finish(h, true);
  h.street = { pre: 'flop', flop: 'turn', turn: 'river' }[h.street];
  const burn = h.deck.pop(); void burn;
  const k = h.street === 'flop' ? 3 : 1;
  for (let i = 0; i < k; i++) h.board.push(h.deck.pop());
  h.log.push({ t: 'street', street: h.street, board: h.board.slice() });
  if (actors.length <= 1) return runOut(h);          // nobody left who can bet: deal the rest
  h.toAct = nextActor(h, h.button);
  if (h.toAct < 0) runOut(h);
}
function runOut(h) { while (!h.done) { if (h.street === 'river') return finish(h, true); nextStreet(h); } }

// pots: layers by contribution; every layer goes to the best eligible hand(s)
function finish(h, showdown) {
  h.done = true; h.toAct = -1; h.street = showdown ? 'showdown' : h.street;
  const alive = live(h), pay = new Map(h.players.map(p => [p.id, 0])), pots = [];
  const contrib = [...new Set(h.players.map(p => p.total).filter(t => t > 0))].sort((a, b) => a - b);
  let prev = 0;
  const scores = new Map();
  if (showdown) for (const p of alive) scores.set(p.i, best([...p.hole, ...h.board]));
  for (const lvl of contrib) {
    const slice = lvl - prev; prev = lvl;
    const inLayer = h.players.filter(p => p.total >= lvl);
    const amount = slice * inLayer.length;
    const elig = alive.filter(p => p.total >= lvl);
    if (!elig.length) { const up = inLayer[0]; pay.set(up.id, pay.get(up.id) + amount); continue; }
    let winners;
    if (!showdown || elig.length === 1) winners = elig;
    else { const top = Math.max(...elig.map(p => scores.get(p.i).score)); winners = elig.filter(p => scores.get(p.i).score === top); }
    const each = Math.floor(amount / winners.length); let rem = amount - each * winners.length;
    // odd chips go to the winner closest to the left of the button
    const order = winners.slice().sort((a, b) => ((a.i - h.button + h.players.length) % h.players.length) - ((b.i - h.button + h.players.length) % h.players.length));
    for (const w of order) { pay.set(w.id, pay.get(w.id) + each + (rem > 0 ? 1 : 0)); if (rem > 0) rem--; }
    pots.push({ amount, winners: winners.map(w => w.id), eligible: elig.map(e => e.id) });
  }
  h.result = {
    showdown: !!showdown && alive.length > 1,
    pay: Object.fromEntries(pay),
    pots,
    hands: showdown && alive.length > 1 ? Object.fromEntries(alive.map(p => [p.id, { hole: p.hole.slice(), name: describe(scores.get(p.i).score), best: scores.get(p.i).cards, score: scores.get(p.i).score }])) : {},
  };
  for (const p of h.players) p.stack += pay.get(p.id);
  return h;
}
const potSize = h => h.players.reduce((a, p) => a + p.total, 0);

// ---------------------------------------------------------------- equity + bot brain + coach
function equity(hole, board, nOpp, sims = 160) {
  const known = new Set([...hole, ...board]);
  const rest = []; for (let c = 0; c < 52; c++) if (!known.has(c)) rest.push(c);
  let win = 0;
  for (let s = 0; s < sims; s++) {
    // partial Fisher-Yates over the unknown cards
    const need = (5 - board.length) + 2 * nOpp;
    for (let i = 0; i < need; i++) { const j = i + R.int(rest.length - i); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    const full = board.concat(rest.slice(0, 5 - board.length));
    const mine = best([...hole, ...full]).score;
    let beat = 0, tie = 0;
    for (let o = 0; o < nOpp; o++) {
      const k = 5 - board.length + 2 * o, os = best([rest[k], rest[k + 1], ...full]).score;
      if (os > mine) { beat = 1; break; } if (os === mine) tie++;
    }
    if (!beat) win += tie ? 1 / (tie + 1) : 1;
  }
  return win / sims;
}
// shape of the hand right now (for coach text)
function shape(hole, board) {
  const all = [...hole, ...board], out = [];
  const bySuit = {}; for (const c of all) bySuit[su(c)] = (bySuit[su(c)] || 0) + 1;
  const fl = Object.entries(bySuit).find(([, n]) => n === 4);
  if (board.length >= 3 && board.length < 5 && fl && hole.some(c => su(c) === +fl[0])) out.push('flush draw (9 outs)');
  const rs = [...new Set(all.map(rk))].sort((a, b) => a - b); if (rs.includes(12)) rs.unshift(-1);
  let run = 1, bestRun = 1; for (let i = 1; i < rs.length; i++) { run = rs[i] === rs[i - 1] + 1 ? run + 1 : 1; bestRun = Math.max(bestRun, run); }
  if (board.length >= 3 && board.length < 5 && bestRun === 4 && catOf(best(all).score) < 4) out.push('straight draw (8 outs)');
  return out;
}
function advise(h, idx) {
  const p = h.players[idx], lg = legal(h, idx); if (!lg) return null;
  const opp = live(h).length - 1;
  const eq = equity(p.hole, h.board, Math.max(1, opp), 300);
  const pot = potSize(h), call = lg.call, odds = call ? call / (pot + call) : 0;
  const fair = 1 / (opp + 1);
  const cur = h.board.length >= 3 ? describe(best([...p.hole, ...h.board]).score) : (rk(p.hole[0]) === rk(p.hole[1]) ? `Pocket ${RNP[rk(p.hole[0])]}` : `${RN[Math.max(rk(p.hole[0]), rk(p.hole[1]))]} high`);
  let rec, why;
  if (call === 0) {
    if (eq > Math.max(0.55, fair * 1.5) && lg.raise) { rec = 'raise'; why = `You win about ${Math.round(eq * 100)}% against ${opp} random hand${opp > 1 ? 's' : ''} — well ahead of the ${Math.round(fair * 100)}% a fair share would be. Bet for value (about half to two-thirds of the pot).`; }
    else { rec = 'check'; why = `Checking is free. You win about ${Math.round(eq * 100)}% here — not enough to bet for value, so take the free card.`; }
  } else if (eq > Math.max(0.65, fair * 1.9) && lg.raise) { rec = 'raise'; why = `Strong: about ${Math.round(eq * 100)}% to win. Raise to build the pot — calling leaves money on the table.`; }
  else if (eq >= odds + 0.03) { rec = 'call'; why = `Calling ${call} into a pot of ${pot} means you need ${Math.round(odds * 100)}% equity to break even. You have about ${Math.round(eq * 100)}%, so calling is profitable over time.`; }
  else { rec = 'fold'; why = `Calling ${call} needs ${Math.round(odds * 100)}% equity (pot odds ${call}:${pot}) but you only have about ${Math.round(eq * 100)}%. Folding is correct unless you expect to improve and win big when you do.`; }
  return { rec, eq, odds, pot, call, hand: cur, shape: shape(p.hole, h.board), why, opp };
}
const PERSONAS = [
  { name: 'tight', play: 1.12, aggr: 0.9, bluff: 0.03 },
  { name: 'solid', play: 1.0, aggr: 1.0, bluff: 0.06 },
  { name: 'loose', play: 0.86, aggr: 1.0, bluff: 0.08 },
  { name: 'maniac', play: 0.8, aggr: 1.35, bluff: 0.14 },
];
function botMove(h, idx, persona) {
  const p = h.players[idx], lg = legal(h, idx), pr = persona || PERSONAS[1];
  const opp = Math.max(1, live(h).length - 1), eq = equity(p.hole, h.board, opp, 90);
  const fair = 1 / (opp + 1), strength = eq / fair;                // 1.0 = an average hand for this table size
  const pot = potSize(h), call = lg.call, odds = call ? call / (pot + call) : 0;
  const size = frac => { const to = Math.round(h.curBet + Math.max(h.minRaise, frac * (pot + call))); return Math.max(lg.raise ? lg.raise.min : 0, Math.min(lg.raise ? lg.raise.max : 0, to)); };
  const rnd = Math.random();
  const wantRaise = lg.raise && ((strength > 1.65 * pr.play && rnd < 0.75 * pr.aggr) || (strength > 1.25 * pr.play && rnd < 0.28 * pr.aggr) || rnd < pr.bluff * (h.board.length ? 1 : 0.4));
  if (call === 0) {
    if (wantRaise) return { action: 'raise', to: size(strength > 1.65 ? 0.7 : 0.5) };
    return { action: 'check' };
  }
  if (wantRaise && strength > 1.25 * pr.play) return { action: 'raise', to: size(0.75) };
  if (eq > odds * pr.play + 0.02 || (call <= h.bb && strength > 0.8 * pr.play)) return { action: 'call' };
  return { action: 'fold' };
}

module.exports = { forceFold, score5, best, describe, catOf, CAT, newHand, legal, act, potSize, equity, advise, botMove, PERSONAS, shape, live, toCall };
