'use strict';
const C = require('../lib/cards');
const R = require('../lib/rng');
const an = require('../lib/an');
const { fail } = require('../lib/engine');
const { parallel } = require('../lib/sharedkit');
const vp = require('./videopoker')._t;

const MAX_UNIT = 1000;
const rk = c => c % 13;
const PAYS = { pair: 1, two: 2, trips: 3, straight: 5, flush: 8, full: 11, quads: 50, sf: 200, royal: 1000 };
const LABEL = { pair: 'Pair of 10s or better', two: 'Two pair', trips: 'Three of a kind', straight: 'Straight', flush: 'Flush', full: 'Full house', quads: 'Four of a kind', sf: 'Straight flush', royal: 'Royal flush' };

// ---- 5-card payout kind (null = no pay) ----
function kind5(h) {
  const code = vp.classifyJacks(h[0], h[1], h[2], h[3], h[4]);
  switch (code) {
    case 14: return 'royal'; case 13: return 'sf';
    case 7: case 8: case 9: case 10: case 11: case 12: return 'quads';
    case 6: return 'full'; case 5: return 'flush'; case 4: return 'straight'; case 3: return 'trips'; case 2: return 'two'; case 1: return 'pair';
  }
  // pair of tens is also paying here
  const cnt = {}; for (const c of h) cnt[rk(c)] = (cnt[rk(c)] || 0) + 1;
  return cnt[8] === 2 ? 'pair' : null;
}
const profitMult = k => (k ? PAYS[k] : -1);

// ---- exact two-stage EV (units of one bet) ----
function evFinal(h5, nb) { return nb * profitMult(kind5(h5)); }
function unseen(known) { const s = new Set(known); const o = []; for (let c = 0; c < 52; c++) if (!s.has(c)) o.push(c); return o; }
function rideEV4(h4, nb) {                 // expected value of the last decision's two branches
  const rest = unseen(h4);
  let ride = 0, pull = 0;
  for (const c of rest) { const k = profitMult(kind5(h4.concat(c))); ride += nb * k; pull += (nb - 1) * k; }
  ride /= rest.length; pull /= rest.length;
  return { ride, pull, best: Math.max(ride, pull) };
}
function ev3(h3) {
  const rest = unseen(h3);
  let ride = 0, pull = 0;
  for (const c of rest) {
    const h4 = h3.concat(c);
    ride += rideEV4(h4, 3).best;       // bet 1 stays, bets 1,2,$ still active
    pull += rideEV4(h4, 2).best;       // bet 1 pulled
  }
  return { ride: ride / rest.length, pull: pull / rest.length };
}

// ---- 3-card bonus ----
const BONUS = { mini: 50, sf: 40, trips: 30, straight: 6, flush: 3, pair: 1 };
function bonus3(h) {
  const r = h.map(rk).sort((a, b) => b - a);
  const flush = C.suit(h[0]) === C.suit(h[1]) && C.suit(h[1]) === C.suit(h[2]);
  const str = (r[0] - 1 === r[1] && r[1] - 1 === r[2]) || (r[0] === 12 && r[1] === 1 && r[2] === 0);
  if (flush && r[0] === 12 && r[1] === 11 && r[2] === 10) return 'mini';
  if (flush && str) return 'sf';
  if (r[0] === r[1] && r[1] === r[2]) return 'trips';
  if (str) return 'straight';
  if (flush) return 'flush';
  if (r[0] === r[1] || r[1] === r[2]) return 'pair';
  return null;
}
const BONUS_LABEL = { mini: 'Mini royal', sf: 'Straight flush', trips: 'Three of a kind', straight: 'Straight', flush: 'Flush', pair: 'Pair' };

function whyStart(h3, ride) {
  const r = h3.map(rk).sort((a, b) => b - a);
  const flush = h3.every(c => C.suit(c) === C.suit(h3[0]));
  const names = h3.map(c => C.short(c)).join(' ');
  const pair = r[0] === r[1] || r[1] === r[2];
  const pr = r[0] === r[1] ? r[0] : r[1];
  if (r[0] === r[1] && r[1] === r[2]) return 'Three of a kind is already a paying hand — let it ride.';
  if (pair && pr >= 8) return 'A pair of 10s or better already pays — a made hand, so let it ride.';
  if (flush && r[2] >= 8) return 'Three to a royal flush (or high straight-flush draw): the 1000:1 and 200:1 payouts make it worth keeping the bet out.';
  if (flush && r[0] - r[2] <= 4) return 'Three to a straight flush: a draw to 200:1 plus flush/straight consolation pays enough to ride.';
  if (pair) return 'A low pair needs a lot to improve (three more cards of that rank, or two pair) — usually not worth risking the bet.';
  return ride ? 'This start is borderline, but the numbers favour keeping the bet out.' : 'No pair, no strong draw: the chance of reaching a paying hand is low. Pull the bet and keep your losses small.';
}

function view(st, { coachOn = true } = {}) {
  const v = { maxUnit: MAX_UNIT, pays: PAYS, label: LABEL, bonus: BONUS };
  if (!st) return { ...v, phase: 'idle' };
  v.phase = st.phase; v.unit = st.unit; v.bonusBet = st.bonusBet; v.cards = C.strs(st.cards);
  v.community = st.comm.map((c, i) => (i < st.shown ? C.str(c) : null));
  v.out = st.out;      // which of bet1/bet2 are still riding
  v.pulled = st.pulled;
  if (st.phase === 'done') v.result = st.result;
  if (coachOn && (st.phase === 'd1' || st.phase === 'd2')) v.coach = st.coach;
  return v;
}

const actions = {
  deal(ctx, body) {
    if (ctx.state && (ctx.state.phase === 'd1' || ctx.state.phase === 'd2')) fail('Finish the current hand first.');
    const unit = ctx.int(body.bet, { min: 1, max: MAX_UNIT, label: 'Bet' });
    const bonusBet = body.bonus ? ctx.int(body.bonus, { min: 1, max: 500, label: '3-Card Bonus' }) : 0;
    ctx.debit(unit * 3 + bonusBet);
    const deck = C.newDeck(); R.shuffle(deck);
    const st = { phase: 'd1', unit, bonusBet, cards: deck.splice(0, 3), comm: deck.splice(0, 2), shown: 0, pulled: [false, false], out: [true, true], log: [] };
    const e = ev3(st.cards);
    st.coach = { best: e.ride >= e.pull ? 'ride' : 'pull', evRide: e.ride, evPull: e.pull, why: whyStart(st.cards, e.ride >= e.pull), step: 1 };
    st.ev1 = e;
    ctx.state = st;
  },
  ride(ctx) { return step(ctx, true); },
  pull(ctx) { return step(ctx, false); },
};

function step(ctx, ride) {
  const st = ctx.state;
  if (!st || (st.phase !== 'd1' && st.phase !== 'd2')) fail('No decision to make right now.');
  const stage = st.phase === 'd1' ? 1 : 2;
  const bestRide = st.coach.best === 'ride';
  const evChosen = ride ? (stage === 1 ? st.ev1.ride : st.ev2.ride) : (stage === 1 ? st.ev1.pull : st.ev2.pull);
  const evBest = stage === 1 ? Math.max(st.ev1.ride, st.ev1.pull) : Math.max(st.ev2.ride, st.ev2.pull);
  const gap = Math.abs((stage === 1 ? st.ev1.ride - st.ev1.pull : st.ev2.ride - st.ev2.pull));
  const loss = evBest - evChosen;
  ctx.rate('lir:d' + stage, 800 + 1100 * Math.max(0, Math.min(1, 1 - gap / 0.6)), Math.max(0, 1 - loss / 0.35));
  ctx.skill(loss < 0.0005 ? 1 : 0, 1);
  st.log.push({ stage, ride, best: bestRide, evRide: stage === 1 ? st.ev1.ride : st.ev2.ride, evPull: stage === 1 ? st.ev1.pull : st.ev2.pull, loss });
  if (!ride) { st.pulled[stage - 1] = true; st.out[stage - 1] = false; ctx.credit(st.unit); }   // pulled bet comes back
  st.shown = stage;
  if (stage === 1) {
    st.phase = 'd2';
    const h4 = st.cards.concat(st.comm[0]);
    const nb = st.pulled[0] ? 2 : 3;
    const e = rideEV4(h4, nb);
    // 'pull' at stage 2 removes bet 2 only
    st.ev2 = { ride: e.ride, pull: e.pull };
    st.coach = { best: e.ride >= e.pull ? 'ride' : 'pull', evRide: e.ride, evPull: e.pull, why: why2(h4, e.ride >= e.pull), step: 2 };
    return;
  }
  return settle(ctx, st);
}
function why2(h4, ride) {
  const k = (() => { const rest = unseen(h4); let paying = 0; for (const c of rest) if (kind5(h4.concat(c))) paying++; return paying; })();
  return `With four cards showing, ${k} of the remaining 48 cards make a paying hand (${(k / 48 * 100).toFixed(0)}%). ${ride ? 'The payouts on the hands you can reach justify keeping the second bet out.' : 'That is not enough to justify risking the second bet — pull it back.'}`;
}

function settle(ctx, st) {
  const five = st.cards.concat(st.comm);
  const k = kind5(five);
  const live = 1 + (st.out[0] ? 1 : 0) + (st.out[1] ? 1 : 0);        // bets still on the table: bet 1, bet 2, and the $ bet
  const lines = [];
  let ret = 0;
  const riding = (st.out[0] ? 1 : 0) + (st.out[1] ? 1 : 0) + 1;
  if (k) { ret += riding * st.unit * (PAYS[k] + 1); lines.push(an.good(`${LABEL[k]} pays ${PAYS[k]}:1 on ${riding} bet${riding > 1 ? 's' : ''} (+${an.fmt(riding * st.unit * PAYS[k])}).`)); }
  else lines.push(an.bad(`No paying hand (${C.shorts(five)}): the ${riding} bet${riding > 1 ? 's' : ''} still riding ${riding > 1 ? 'are' : 'is'} lost (−${an.fmt(riding * st.unit)}).`));
  if (st.pulled[0] || st.pulled[1]) lines.push(an.info(`Pulled bets returned: ${st.pulled.filter(Boolean).length} × ${an.fmt(st.unit)}.`));
  if (st.bonusBet) {
    const bk = bonus3(st.cards);
    if (bk) { ret += st.bonusBet * (BONUS[bk] + 1); lines.push(an.good(`3-Card Bonus: ${BONUS_LABEL[bk]} pays ${BONUS[bk]}:1 (+${an.fmt(st.bonusBet * BONUS[bk])}).`)); }
    else lines.push(an.bad(`3-Card Bonus: no qualifying hand — lost ${an.fmt(st.bonusBet)}.`));
  }
  ctx.credit(ret);
  st.result = { kind: k, name: k ? LABEL[k] : 'No pay', riding };
  st.phase = 'done';
  const net = ret + (st.pulled[0] ? st.unit : 0) + (st.pulled[1] ? st.unit : 0) - st.unit * 3 - st.bonusBet;
  const dec = st.log.map(l => (l.loss < 0.0005
    ? an.good(`Decision ${l.stage}: ${l.ride ? 'let it ride' : 'pulled back'} ✔ (EV ${(Math.max(l.evRide, l.evPull)).toFixed(2)} bets).`)
    : an.bad(`Decision ${l.stage}: you ${l.ride ? 'let it ride' : 'pulled'} but ${l.best ? 'riding' : 'pulling'} was worth ${(Math.max(l.evRide, l.evPull)).toFixed(2)} vs ${(l.ride ? l.evRide : l.evPull).toFixed(2)} bets — an average mistake of ${l.loss.toFixed(2)} bets.`)));
  const tips = [
    an.info('Let It Ride costs about 2.9% of the money you actually put out with perfect play (1.2% of the three starting bets, since you pull most of the time). Remember: the third "$" bet can never be pulled.'),
    an.tip('Simple strategy for bet 1: ride with a pair of 10s+, three of a kind, three to a royal flush, three suited cards in a row with a high card, or three suited cards with 10-J-Q-style spacing. Pull everything else.'),
    an.tip('For bet 2: ride with any paying hand, four to a flush, four to an outside straight with at least one high card, or four to a straight flush; pull the rest.'),
  ];
  if (st.bonusBet) tips.push(an.warn('The 3-Card Bonus carries about a 7% house edge — a side bet for fun, not for value.'));
  ctx.end(`Let It Ride ${st.result.name}`);
  return an.review(st.result.name, net, [['Result', lines], ['Your decisions', dec], ['Strategy', tips]]);
}

module.exports = {
  id: 'letitride', name: 'Let It Ride', icon: '🏇', category: 'cards', skill: 'high',
  blurb: 'Three bets, two chances to pull them back. The coach computes exact EV for every ride-or-pull decision.',
  edge: '~2.9% of money wagered', shared: parallel(6),
  meta: {
    rules: [
      'Place three equal bets (marked 1, 2 and $). You get three cards; two community cards wait face-down. Look at your cards and decide: take back Bet 1 or let it ride.',
      'The first community card is revealed. Again decide: take back Bet 2 or let it ride. The $ bet always stays. Then the last card is shown.',
      'Your five-card poker hand (your 3 + 2 community) is paid on every bet that is still riding. Minimum paying hand: a pair of 10s. Pays: pair 1:1 · two pair 2:1 · trips 3:1 · straight 5:1 · flush 8:1 · full house 11:1 · quads 50:1 · straight flush 200:1 · royal 1000:1.',
      'Optional 3-Card Bonus (pays on your first three cards): mini royal 50:1 · straight flush 40:1 · trips 30:1 · straight 6:1 · flush 3:1 · pair 1:1.',
    ],
    tips: [
      'Every decision here has an exact right answer. The Coach shows the expected value of riding vs pulling.',
      'Pull back whenever your chance of a paying hand is low — pulling returns the bet in full, so it\'s the cheap option.',
      'The 3-Card Bonus is a separate bet with a high house edge.',
    ],
  },
  view, actions,
  inProgress: st => !!st && (st.phase === 'd1' || st.phase === 'd2'),
  _t: { kind5, ev3, rideEV4, bonus3, PAYS, BONUS },
};
