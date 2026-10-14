'use strict';
const C = require('../lib/cards');
const an = require('../lib/an');
const { fail } = require('../lib/engine');
const { parallel } = require('../lib/sharedkit');

const DECKS = 8, MAX_BET = 2000;
const rk = c => c % 13;
const SPREAD_PAY = { 1: 5, 2: 4, 3: 2 };            // spread 4+ pays 1:1
const payFor = s => SPREAD_PAY[s] || 1;

function view(st) {
  const v = { maxBet: MAX_BET };
  if (!st) return { ...v, phase: 'idle' };
  v.phase = st.phase; v.bet = st.bet; v.a = C.str(st.a); v.b = C.str(st.b); v.spread = st.spread; v.raised = st.raised;
  if (st.third !== undefined && st.third !== null) v.third = C.str(st.third);
  if (st.phase === 'raise') v.coach = st.coach;
  return v;
}
// exact probability the third card falls strictly between (8-deck shoe, two cards removed)
function evSpread(st) {
  const lo = Math.min(rk(st.a), rk(st.b)), hi = Math.max(rk(st.a), rk(st.b));
  const spread = hi - lo - 1;
  const left = DECKS * 52 - 2;
  const inside = spread > 0 ? spread * DECKS * 4 : 0;
  const p = inside / left, m = payFor(spread);
  const evPerBet = p * m - (1 - p);
  return { spread, p, m, evPerBet };
}
const actions = {
  deal(ctx, body) {
    if (ctx.state && ctx.state.phase === 'raise') fail('Raise or continue the current hand first.');
    const bet = ctx.int(body.bet, { min: 1, max: MAX_BET, label: 'Bet' });
    ctx.debit(bet);
    const st = { shoe: null, ...(ctx.state || {}) };
    if (!st.shoe || st.shoe.length < 30) st.shoe = C.newShoe(DECKS);
    st.a = st.shoe.pop(); st.b = st.shoe.pop(); st.bet = bet; st.raised = false; st.third = null;
    ctx.state = st;
    const d = Math.abs(rk(st.a) - rk(st.b));
    st.spread = d - 1;
    if (d === 0) { st.phase = 'pair'; return deal3(ctx, st); }        // pair: third card ties for 11:1 or push
    if (d === 1) { st.phase = 'consec'; ctx.credit(bet); st.third = null; ctx.end('Red Dog consecutive push'); st.phase = 'done'; return an.review('Consecutive — push', 0, [['Result', [an.info(`${C.short(st.a)} and ${C.short(st.b)} are consecutive, so there's no spread: the hand pushes and your bet is returned.`)], ['Tip', [an.tip('Pushes cost nothing — about 6% of deals are consecutive or pairs.')]]]]); }
    const e = evSpread(st);
    st.coach = {
      best: e.evPerBet > 0 ? 'raise' : 'play',
      text: `Spread ${e.spread} pays ${e.m}:1. The third card lands strictly inside ${(e.p * 100).toFixed(1)}% of the time, so one bet is worth ${(e.evPerBet * 100).toFixed(1)}% of itself. ${e.evPerBet > 0 ? 'That is positive — RAISE (double the bet) and win more of it.' : 'That is negative — don\'t raise; raising just doubles a losing bet.'} (Spread 7 and up are the only raise-worthy spreads at 1:1.)`,
      p: e.p, m: e.m, ev: e.evPerBet,
    };
    st.phase = 'raise';
  },
  raise(ctx) {
    const st = ctx.state;
    if (!st || st.phase !== 'raise') fail('Nothing to raise.');
    const e = evSpread(st);
    ctx.rate('reddog:raise', 1200, e.evPerBet > 0 ? 1 : 0.2);
    ctx.debit(st.bet); st.raised = true;
    return deal3(ctx, st);
  },
  play(ctx) {
    const st = ctx.state;
    if (!st || st.phase !== 'raise') fail('Nothing to decide.');
    const e = evSpread(st);
    ctx.rate('reddog:raise', 1200, e.evPerBet <= 0 ? 1 : 0.35);
    return deal3(ctx, st);
  },
};
function deal3(ctx, st) {
  st.third = st.shoe.pop();
  const lo = Math.min(rk(st.a), rk(st.b)), hi = Math.max(rk(st.a), rk(st.b)), t = rk(st.third);
  const unit = st.bet * (st.raised ? 2 : 1);
  const lines = [], tips = [];
  let ret = 0;
  if (st.phase === 'pair') {
    if (t === lo) { ret += st.bet * 12; lines.push(an.good(`Pair of ${C.short(st.a)} and the third card is the third of a kind — pays 11:1!`)); }
    else { ret += st.bet; lines.push(an.info('Pair: the third card didn\'t match, so the hand pushes.')); }
  } else {
    const inside = t > lo && t < hi;
    lines.push(an.info(`Spread cards ${C.short(st.a)} / ${C.short(st.b)} (${st.spread}); third card ${C.short(st.third)}.`));
    if (inside) { const m = payFor(st.spread); ret += unit + unit * m; lines.push(an.good(`Inside the spread — pays ${m}:1 on ${an.fmt(unit)}.`)); }
    else lines.push(an.bad(`${C.short(st.third)} is outside the spread — you lose ${an.fmt(unit)}.`));
  }
  ctx.credit(ret);
  st.phase = 'done';
  const net = ret - unit;
  tips.push(an.info('Red Dog edge is ~2.8–3.1% with correct raising (raise on spreads of 7+, never below). Spread pays: 1→5:1, 2→4:1, 3→2:1, 4 or more→1:1.'));
  tips.push(an.tip('The raise decision is the only skill: raise when the chance the third card lands inside (spread × 32 / 414) times the payout beats the chance it doesn\'t.'));
  ctx.end('Red Dog ' + (net > 0 ? 'win' : net < 0 ? 'loss' : 'push'));
  return an.review(net > 0 ? 'Inside the spread' : net < 0 ? 'Outside' : 'Push', net, [['Result', lines], ['Odds & strategy', tips]]);
}
module.exports = {
  id: 'reddog', name: 'Red Dog', icon: '🐕', category: 'cards', skill: 'medium',
  blurb: 'Will the third card fall between the first two? Raise when the spread is wide — the coach shows the odds.',
  edge: '~3% with correct raises', shared: parallel(6),
  meta: {
    rules: [
      'Two cards are dealt face up. The "spread" is the number of ranks between them (a 3 and a 9 have a spread of 5). Aces are high.',
      'Consecutive cards (no spread) push. A pair gets a third card: if it matches, you win 11:1; otherwise push.',
      'Otherwise, you may RAISE (double your bet) before the third card is dealt. If the third card falls strictly between the first two you win: spread 1 pays 5:1, 2 pays 4:1, 3 pays 2:1, 4 or more pays 1:1. Otherwise you lose.',
    ],
    tips: ['Raise only on wide spreads (7 or more) — that is where the odds tip your way.', 'Narrow spreads pay well but rarely hit; wide spreads hit often but only pay 1:1.'],
  },
  view, actions,
  inProgress: st => !!st && st.phase === 'raise',
};
