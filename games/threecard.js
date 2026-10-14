'use strict';
const C = require('../lib/cards');
const R = require('../lib/rng');
const an = require('../lib/an');
const { fail } = require('../lib/engine');
const { parallel } = require('../lib/sharedkit');
const vp = require('./videopoker')._t;

const MAX_BET = 2000;
const rk = c => c % 13 + 2;          // 2..14
const CLASS_NAMES = ['High card', 'Pair', 'Flush', 'Straight', 'Three of a kind', 'Straight flush'];

// ---- 3-card hand scoring: class * 1e6 + tiebreak (higher is better) ----
function score3(cards) {
  const r = cards.map(rk).sort((a, b) => b - a);
  const flush = C.suit(cards[0]) === C.suit(cards[1]) && C.suit(cards[1]) === C.suit(cards[2]);
  let straightHigh = 0;
  if (r[0] - 1 === r[1] && r[1] - 1 === r[2]) straightHigh = r[0];
  else if (r[0] === 14 && r[1] === 3 && r[2] === 2) straightHigh = 3;        // A-2-3 is the lowest straight
  let cls, tb;
  if (straightHigh && flush) { cls = 5; tb = straightHigh; }
  else if (r[0] === r[1] && r[1] === r[2]) { cls = 4; tb = r[0]; }
  else if (straightHigh) { cls = 3; tb = straightHigh; }
  else if (flush) { cls = 2; tb = r[0] * 225 + r[1] * 15 + r[2]; }
  else if (r[0] === r[1] || r[1] === r[2]) { const pair = r[1]; const kick = r[0] === r[1] ? r[2] : r[0]; cls = 1; tb = pair * 15 + kick; }
  else { cls = 0; tb = r[0] * 225 + r[1] * 15 + r[2]; }
  return { cls, tb, v: cls * 1e6 + tb, name: CLASS_NAMES[cls], high: r[0] };
}
const dealerQualifies = s => s.cls >= 1 || s.high >= 12;          // Queen-high or better
// Q-6-4 rule: play when your hand ranks at or above Q-6-4
const Q64 = score3([10, 4 + 13, 2 + 26]).v;       // Q-6-4 of mixed suits (rank idx 10 = Q, 4 = six, 2 = four)

const PAIRPLUS = { 5: 40, 4: 30, 3: 6, 2: 3, 1: 1 };
const ANTEBONUS = { 5: 5, 4: 4, 3: 1 };

// ---- 6-card bonus: best 5 of (3 player + 3 dealer) ----
const STRENGTH = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 7, 9: 7, 10: 7, 11: 7, 12: 7, 13: 8, 14: 9 };
const SIX_PAY = { 9: 1000, 8: 200, 7: 50, 6: 25, 5: 15, 4: 10, 3: 5 };
function sixCard(six) {
  let best = 0;
  for (let skip = 0; skip < 6; skip++) {
    const h = six.filter((_, i) => i !== skip);
    const code = vp.classifyJacks(h[0], h[1], h[2], h[3], h[4]);
    best = Math.max(best, STRENGTH[code]);
  }
  return { tier: best, pay: SIX_PAY[best] || 0, name: ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush'][best] };
}

const BETS = {
  pairplus: { name: 'Pair Plus', pays: 'Pair 1:1 · Flush 3:1 · Straight 6:1 · Trips 30:1 · Str. flush 40:1', edge: 0.0728, min: 1, max: 500, desc: 'Pays on your own hand (pair or better) no matter what the dealer has. Settled when you decide.' },
  six: { name: '6-Card Bonus', pays: 'Trips 5 · Straight 10 · Flush 15 · Full house 25 · Quads 50 · Str. flush 200 · Royal 1000', edge: 0.1502, min: 1, max: 500, desc: 'Best 5-card hand from your 3 cards + the dealer\'s 3. Stays alive even if you fold.' },
};

function view(st, { coachOn = true } = {}) {
  const v = { maxBet: MAX_BET, bets: BETS };
  if (!st) return { ...v, phase: 'idle' };
  v.phase = st.phase; v.ante = st.ante; v.sides = st.sides;
  v.player = C.strs(st.player);
  v.pname = score3(st.player).name;
  if (st.phase === 'done') { v.dealer = C.strs(st.dealer); v.dname = score3(st.dealer).name; v.result = st.res; }
  else v.dealer = [null, null, null].map(() => null);
  if (st.phase === 'decide' && coachOn) v.coach = coach(st);
  if (st.phase === 'wait') v.waiting = st.play ? 'played' : 'folded';
  return v;
}
function coach(st) {
  const s = score3(st.player);
  const play = s.v >= Q64;
  const r = st.player.map(rk).sort((a, b) => b - a);
  return {
    best: play ? 'play' : 'fold',
    text: play
      ? `Your ${s.name === 'High card' ? `${rankName(r[0])}-${rankName(r[1])}-${rankName(r[2])} high` : s.name.toLowerCase()} is Queen-6-4 or better — PLAY. The dealer qualifies only ~66% of the time, and you lose your ante only a bit more often than you win a Play bet back, so the extra bet is +EV at this strength.`
      : `Your ${rankName(r[0])}-${rankName(r[1])}-${rankName(r[2])} is below Queen-6-4 — FOLD. Playing weak hands loses more on average than the single ante you give up. (The "Q-6-4 rule" is the best simple strategy: it costs only ~0.02% versus perfect play.)`,
    q64: 'Play with Q-6-4 or higher (including any pair, flush, straight, trips).',
  };
}
const rankName = r => ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J' }[r] || String(r));

const actions = {
  deal(ctx, body) {
    if (ctx.state && ctx.state.phase === 'decide') fail('Play or fold the current hand first.');
    const ante = ctx.int(body.ante, { min: 1, max: MAX_BET, label: 'Ante' });
    const sides = {};
    for (const k of Object.keys(BETS)) if (body.sides && body.sides[k]) sides[k] = ctx.int(body.sides[k], { min: BETS[k].min, max: BETS[k].max, label: BETS[k].name });
    ctx.debit(ante + Object.values(sides).reduce((a, b) => a + b, 0));
    const deck = C.newDeck(); R.shuffle(deck);
    ctx.state = { phase: 'decide', ante, sides, player: deck.splice(0, 3), dealer: deck.splice(0, 3) };
  },
  play(ctx) { return resolve(ctx, true); },
  fold(ctx) { return resolve(ctx, false); },
};

function resolve(ctx, play, prepaid) {
  const st = ctx.state;
  if (!st || (st.phase !== 'decide' && !prepaid)) fail('Nothing to decide.');
  const ps = score3(st.player), ds = score3(st.dealer);
  const strong = ps.v >= Q64;
  if (play && !prepaid) ctx.debit(st.ante);
  // grade the decision: obvious calls are easy, hands next to the Q-6-4 line are hard
  const margin = Math.abs(ps.cls === 0 ? (ps.high - 12) + (st.player.map(rk).sort((a, b) => b - a)[1] - 6) / 10 : 3);
  ctx.rate('tcp:q64', margin < 1.2 ? 1500 : margin < 2.2 ? 1150 : 850, play === strong ? 1 : 0.15);
  ctx.skill(play === strong ? 1 : 0, 1);
  const lines = [], notes = [];
  let ret = 0;
  const anteBonus = ANTEBONUS[ps.cls] || 0;
  if (!play) {
    lines.push(an.bad(`Ante ${an.fmt(st.ante)} — folded and lost.`));
  } else {
    const q = dealerQualifies(ds);
    if (!q) { ret += st.ante * 2 + st.ante; lines.push(an.good(`Dealer doesn't qualify (needs Queen-high): Ante pays 1:1, Play bet returned.`)); }
    else if (ps.v > ds.v) { ret += st.ante * 4; lines.push(an.good(`You beat the dealer's ${ds.name}: Ante and Play both pay 1:1.`)); }
    else if (ps.v === ds.v) { ret += st.ante * 2; lines.push(an.info('Tie with the dealer: Ante and Play push.')); }
    else lines.push(an.bad(`Dealer's ${ds.name} beats you: Ante and Play lose.`));
    if (anteBonus) { ret += st.ante * anteBonus; lines.push(an.good(`Ante bonus: ${ps.name} pays ${anteBonus}:1 on the Ante (+${an.fmt(st.ante * anteBonus)}) — paid even if the dealer wins.`)); }
  }
  const wager = st.ante * (play ? 2 : 1);
  if (st.sides.pairplus) {
    const m = PAIRPLUS[ps.cls] || 0;
    if (m) { ret += st.sides.pairplus * (m + 1); lines.push(an.good(`Pair Plus: ${ps.name} pays ${m}:1 (+${an.fmt(st.sides.pairplus * m)}).`)); }
    else lines.push(an.bad(`Pair Plus: no pair — lost ${an.fmt(st.sides.pairplus)}.`));
  }
  if (st.sides.six) {
    const six = sixCard(st.player.concat(st.dealer));
    if (six.pay) { ret += st.sides.six * (six.pay + 1); lines.push(an.good(`6-Card Bonus: ${six.name} pays ${six.pay}:1 (+${an.fmt(st.sides.six * six.pay)}).`)); }
    else lines.push(an.bad(`6-Card Bonus: best 5 of 6 is ${six.name} — lost ${an.fmt(st.sides.six)}.`));
  }
  ctx.credit(ret);
  st.res = { player: ps.name, dealer: ds.name, play };
  st.phase = 'done';
  const sideTot = Object.values(st.sides).reduce((a, b) => a + b, 0);
  const net = ret - st.ante - (play ? st.ante : 0) - sideTot;
  const decision = [];
  if (play === strong) decision.push(an.good(`${play ? 'Playing' : 'Folding'} was right: your hand (${hs(st.player)}) is ${strong ? 'at or above' : 'below'} the Queen-6-4 line.`));
  else decision.push(an.bad(`${play ? 'Playing' : 'Folding'} went against the Q-6-4 rule: your hand (${hs(st.player)}) is ${strong ? 'at or above' : 'below'} Queen-6-4, so ${strong ? 'you should have PLAYED' : 'you should have FOLDED'}.`));
  decision.push(an.info(`Dealer: ${C.shorts(st.dealer)} (${ds.name}${dealerQualifies(ds) ? '' : ', does not qualify'}).`));
  decision.push(an.tip('Strategy: play any hand of Queen-6-4 or better, fold the rest. Ante/Play carries a 3.37% edge; the edge is the same whether you win or lose this particular hand.'));
  if (sideTot) decision.push(an.warn(`Side bets (Pair Plus 7.3%, 6-Card Bonus 15.0%) cost more than the main game (3.4%). Pair Plus at least stays live when you fold.`));
  ctx.end(`3 Card Poker ${ps.name} vs ${ds.name}${play ? '' : ' (folded)'}`);
  return an.review(play ? (ps.v > ds.v || !dealerQualifies(ds) ? 'You win' : ps.v === ds.v ? 'Push' : 'Dealer wins') : 'Folded', net, [['Result', lines], ['Hands & decision', decision]]);
}
const hs = cards => cards.map(rk).sort((a, b) => b - a).map(rankName).join('-') + (score3(cards).cls ? ' ' + score3(cards).name.toLowerCase() : ' high');


// ---------- shared-dealer tables: one dealer hand for everybody, revealed once all seats have decided ----------
const sharedInit = () => ({ deck: [], dealer: [], shown: false });
function roundBet(body) {
  const ante = Number(body && body.ante);
  if (!Number.isInteger(ante) || ante < 1 || ante > MAX_BET) fail(`Ante must be between 1 and ${MAX_BET}.`);
  const sides = {}; let total = ante;
  for (const k of Object.keys(BETS)) { const v = body.sides && body.sides[k]; if (!v) continue; const n = Number(v); if (!Number.isInteger(n) || n < BETS[k].min || n > BETS[k].max) fail(`${BETS[k].name} must be between ${BETS[k].min} and ${BETS[k].max}.`); sides[k] = n; total += n; }
  return { ante, sides, total };
}
function roundStart(mem) { mem.deck = R.shuffle(C.newDeck()); mem.dealer = mem.deck.splice(0, 3); mem.shown = false; }
function roundDeal(ctx, b, mem) {
  ctx.debit(b.total);
  ctx.state = { phase: 'decide', ante: b.ante, sides: b.sides, player: mem.deck.splice(0, 3), dealer: mem.dealer.slice(), shared: true };
  ctx.out = { stage: 'play' };
}
function roundAct(ctx, action, body, mem) {
  const st = ctx.state; if (!st || st.phase !== 'decide') fail('Nothing to decide.');
  if (action !== 'play' && action !== 'fold') fail('Unknown action.');
  st.play = action === 'play'; if (st.play) ctx.debit(st.ante);
  st.phase = 'wait'; ctx.out = { stage: 'wait', live: st.play };
}
function roundFinish(ctx, mem) { const st = ctx.state; ctx.analysis = resolve(ctx, st.play, true); ctx.out = { stage: 'done' }; st.shared = false; }
function roundTableView(mem, showHole) {
  const d = mem.dealer || [], ds = d.length && showHole ? score3(d) : null;
  return { dealer: { cards: d.length ? (showHole ? C.strs(d) : [null, null, null]) : [], name: ds ? ds.name : null, qualifies: ds ? dealerQualifies(ds) : null, total: 0 }, count: null, text: ds ? `Dealer ${ds.name}${dealerQualifies(ds) ? '' : ' (no qualify)'}` : 'Round over' };
}
function roundRecover(ctx) {
  const st = ctx.state; if (!st || !st.shared || !['decide', 'wait'].includes(st.phase)) return false;
  ctx.refund(st.ante + (st.play ? st.ante : 0) + Object.values(st.sides).reduce((a, b) => a + b, 0), 0); st.phase = 'idle'; st.shared = false; return true;
}
// other seats see only face-down cards until the dealer reveals (bot tables are for learning: viewers see everything)
function publicView(v, bot) {
  if (bot || v.phase === 'done' || !v.player) return v;
  const o = { ...v, player: v.player.map(() => null) }; delete o.pname; return o;
}

module.exports = {
  id: 'threecard', name: 'Three Card Poker', icon: '🂭', category: 'cards', skill: 'medium',
  blurb: 'Ante/Play against the dealer with Pair Plus and the 6-Card Bonus. One decision: play or fold.',
  edge: '3.37% (Ante/Play)',
  shared: { mode: 'rounds', max: 6, secs: 14, insSecs: 5, actSecs: 20, primary: ['deal'], autoActions: ['fold'], init: sharedInit, bet: roundBet, start: roundStart, deal: roundDeal, act: roundAct, peek: () => false, proceed: () => {}, playDealer: mem => { mem.shown = true; }, finish: roundFinish, tableView: roundTableView, recover: roundRecover, publicView,
    botBet: () => ({ ante: [10, 20, 50][Math.floor(Math.random() * 3)], sides: {} }), botAction: v => (v.coach && v.coach.best) || 'fold' },
  meta: {
    rules: [
      'Place an Ante (and optional Pair Plus / 6-Card Bonus). You and the dealer each get 3 cards. Look at yours, then PLAY (bet equal to your ante) or FOLD (lose the ante).',
      'The dealer needs Queen-high or better to "qualify". If the dealer doesn\'t qualify, your Ante pays 1:1 and the Play bet is returned. If the dealer qualifies, the higher hand wins both bets 1:1.',
      'Hand ranks (high to low): straight flush, three of a kind, straight, flush, pair, high card. (A straight beats a flush here because it is rarer with three cards.)',
      'Ante Bonus (paid when you play, whether or not you beat the dealer): straight 1:1 · three of a kind 4:1 · straight flush 5:1.',
      'Pair Plus pays on your hand alone: pair 1:1, flush 3:1, straight 6:1, trips 30:1, straight flush 40:1. The 6-Card Bonus uses the best five of your three cards and the dealer\'s three.',
    ],
    tips: ['Play Q-6-4 or better, fold anything worse — that simple rule is within 0.02% of perfect strategy.', 'Pair Plus is a fun bet but carries a 7.3% edge; the 6-Card Bonus is higher still.'],
    bets: BETS,
  },
  view, actions,
  inProgress: st => !!st && (st.phase === 'decide' || st.phase === 'wait'),
  _t: { score3, dealerQualifies, Q64, sixCard, PAIRPLUS, ANTEBONUS },
};
