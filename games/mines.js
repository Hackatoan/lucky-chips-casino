'use strict';
const R = require('../lib/rng');
const an = require('../lib/an');
const { fail } = require('../lib/engine');
const { parallel } = require('../lib/sharedkit');
const MAX = 2000, N = 25;
const comb = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
// probability of k safe picks in a row with m mines: C(N-m,k)/C(N,k)
const surv = (m, k) => comb(N - m, k) / comb(N, k);
const multAt = (m, k, edge) => (1 - edge / 100) / surv(m, k);

function view(st, { rules } = {}) {
  const edge = rules ? rules.edge : 1;
  const v = { size: 5, maxBet: MAX, edge };
  if (!st) return { ...v, phase: 'idle' };
  v.phase = st.phase; v.bet = st.bet; v.mines = st.mines; v.picks = st.picks; v.safe = st.picks.length;
  v.mult = st.picks.length ? multAt(st.mines, st.picks.length, st.edge) : 1;
  v.next = st.picks.length < N - st.mines ? multAt(st.mines, st.picks.length + 1, st.edge) : null;
  v.pot = Math.floor(st.bet * v.mult);
  if (st.phase === 'done') v.board = st.board;            // mine positions revealed only when the round is over
  if (st.phase === 'play') {
    const left = N - st.picks.length, p = (left - st.mines) / left;
    v.coach = { text: `Next tile is safe with probability ${(p * 100).toFixed(1)}% (${left - st.mines} safe of ${left} left) and would lift your cash-out from ${v.mult.toFixed(2)}× to ${v.next ? v.next.toFixed(2) : '—'}×. Expected value of one more pick = ${((p * (v.next || 0) / v.mult) * 100).toFixed(1)}% of your current pot — always a little below 100%. Cash out whenever the thrill isn't worth the edge.`, p };
  }
  return v;
}
const actions = {
  start(ctx, body) {
    if (ctx.state && ctx.state.phase === 'play') fail('Finish or cash out the current round first.');
    const bet = ctx.int(body.bet, { min: 1, max: MAX, label: 'Bet' });
    const mines = ctx.int(body.mines, { min: 1, max: 24, label: 'Mines' });
    ctx.debit(bet);
    const order = Array.from({ length: N }, (_, i) => i); R.shuffle(order);
    ctx.state = { phase: 'play', bet, mines, minePos: order.slice(0, mines), picks: [], edge: ctx.opt('edge') };
  },
  pick(ctx, body) {
    const st = ctx.state;
    if (!st || st.phase !== 'play') fail('Start a round first.');
    const i = ctx.int(body.index, { min: 0, max: N - 1, label: 'Tile' });
    if (st.picks.includes(i)) fail('Already revealed.');
    if (st.minePos.includes(i)) {
      st.phase = 'done'; st.board = Array.from({ length: N }, (_, k) => (st.minePos.includes(k) ? 'mine' : st.picks.includes(k) ? 'gem' : 'hidden')); st.board[i] = 'boom';
      ctx.end(`Mines boom after ${st.picks.length}`);
      return an.review('Boom!', -st.bet, [['Result', [an.bad(`Tile ${i + 1} was a mine after ${st.picks.length} safe pick${st.picks.length === 1 ? '' : 's'}. The bet is lost.`)]], ['The maths', [an.info(`With ${st.mines} mines, the chance of surviving ${st.picks.length + 1} picks in a row was ${(surv(st.mines, st.picks.length + 1) * 100).toFixed(1)}%.`), an.tip('There is no safe "pattern": mine positions are random and independent of where you click. The only decision is when to cash out.')]]]);
    }
    st.picks.push(i);
    ctx.rate('mines:safe', 800, 1);
    if (st.picks.length === N - st.mines) return cash(ctx, st);
  },
  cashout(ctx) {
    const st = ctx.state;
    if (!st || st.phase !== 'play') fail('Nothing to cash out.');
    if (!st.picks.length) fail('Reveal at least one tile first.');
    return cash(ctx, st);
  },
};
function cash(ctx, st) {
  const m = multAt(st.mines, st.picks.length, st.edge), win = Math.floor(st.bet * m);
  ctx.credit(win);
  st.phase = 'done'; st.board = Array.from({ length: N }, (_, k) => (st.minePos.includes(k) ? 'mine' : st.picks.includes(k) ? 'gem' : 'hidden'));
  ctx.end(`Mines cashed ${m.toFixed(2)}x`);
  return an.review(`Cashed out ×${m.toFixed(2)}`, win - st.bet, [['Result', [an.good(`${st.picks.length} gems found with ${st.mines} mines → ×${m.toFixed(2)} = ${an.fmt(win)}.`)]], ['The maths', [an.info(`Chance of surviving ${st.picks.length} picks: ${(surv(st.mines, st.picks.length) * 100).toFixed(1)}%. Fair multiplier ${(1 / surv(st.mines, st.picks.length)).toFixed(2)}×, paid ×${m.toFixed(2)} after the ${st.edge}% edge.`), an.tip('More mines = bigger multipliers per pick but a higher chance of busting on each pick. Expected loss per bet is the edge in every configuration.')]]]);
}
module.exports = {
  id: 'mines', name: 'Mines', icon: '💎', category: 'arcade', skill: 'none',
  blurb: 'Uncover gems on a 5×5 grid and cash out before you hit a mine. You pick how many mines.',
  edge: 'You choose (default 1%)', shared: parallel(8),
  meta: {
    rules: ['Choose a bet and how many mines (1–24) are hidden on the 5×5 grid. Reveal tiles: each gem raises your multiplier, a mine ends the round. Cash out any time to keep the pot.', 'The mine positions are fixed the moment you start and are never sent to your browser until the round is over.'],
    tips: ['Compare 1 mine (tiny steps, long streaks) with 20 mines (huge jumps, first tile is a coin-flip).', 'Every pick is a fair-odds gamble minus the edge — more picks = more expected loss.'],
    options: [{ key: 'edge', label: 'House edge', type: 'range', min: 0, max: 10, step: 0.5, default: 1, unit: '%', help: 'Multipliers are (100% − edge) ÷ survival probability.' }],
  },
  view, actions, inProgress: st => !!st && st.phase === 'play', _t: { surv, multAt },
};
