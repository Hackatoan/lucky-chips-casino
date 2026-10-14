'use strict';
const C = require('../lib/cards');
const an = require('../lib/an');
const { fail } = require('../lib/engine');
const { parallel } = require('../lib/sharedkit');

const DECKS = 6, MAX_BET = 2000;
const rk = c => c % 13;           // Ace high (12)
const draw = st => { if (!st.shoe || st.shoe.length < 20) { st.shoe = C.newShoe(DECKS); } return st.shoe.pop(); };

function view(st) {
  const v = { maxBet: MAX_BET, tieMax: 500 };
  if (!st) return { ...v, phase: 'idle' };
  v.phase = st.phase; v.bet = st.bet; v.tie = st.tie; v.player = C.str(st.p); v.dealer = C.str(st.d);
  if (st.war) v.war = { player: C.str(st.war.p), dealer: st.war.d !== undefined && st.war.d !== null ? C.str(st.war.d) : null };
  if (st.phase === 'warcall') v.coach = { best: 'war', text: 'Go to war. Going to war costs about 2.9% of your bet on average; surrendering costs 3.7% (half your bet is lost every tie). The extra raise only risks one more bet on a roughly 48% shot, and a tie-on-tie pays a bonus.' };
  return v;
}
const actions = {
  deal(ctx, body) {
    if (ctx.state && ctx.state.phase === 'warcall') fail('Decide: go to war or surrender.');
    const bet = ctx.int(body.bet, { min: 1, max: MAX_BET, label: 'Bet' });
    const tie = body.tie ? ctx.int(body.tie, { min: 1, max: 500, label: 'Tie bet' }) : 0;
    const st = (ctx.state && ctx.state.shoe) ? ctx.state : { shoe: null };
    ctx.debit(bet + tie);
    Object.assign(st, { bet, tie, p: draw(st), d: draw(st), war: null, phase: 'play' });
    ctx.state = st;
    const lines = [];
    if (rk(st.p) !== rk(st.d)) return finish(ctx, st, 'normal');
    if (tie) { ctx.credit(tie * 11); }
    st.phase = 'warcall';
  },
  war(ctx) {
    const st = ctx.state;
    if (!st || st.phase !== 'warcall') fail('No tie to settle.');
    ctx.debit(st.bet);
    draw(st); draw(st); draw(st);          // burn three
    st.war = { p: draw(st), d: draw(st) };
    ctx.rate('war:go', 1000, 1);
    return finish(ctx, st, 'war');
  },
  surrender(ctx) {
    const st = ctx.state;
    if (!st || st.phase !== 'warcall') fail('No tie to settle.');
    ctx.rate('war:go', 1000, 0.35);
    ctx.credit(Math.floor(st.bet / 2));
    return finish(ctx, st, 'surrender');
  },
};
function finish(ctx, st, how) {
  const lines = [];
  let ret = 0;
  const tieHit = rk(st.p) === rk(st.d);
  if (how === 'normal') {
    if (rk(st.p) > rk(st.d)) { ret += st.bet * 2; lines.push(an.good(`${C.short(st.p)} beats ${C.short(st.d)}: you win ${an.fmt(st.bet)}.`)); }
    else lines.push(an.bad(`${C.short(st.d)} beats ${C.short(st.p)}: you lose ${an.fmt(st.bet)}.`));
  } else if (how === 'war') {
    const w = st.war;
    lines.push(an.info(`Tie on ${C.short(st.p)}! You went to war (extra ${an.fmt(st.bet)}). Dealer burned 3 cards. War cards: you ${C.short(w.p)} vs dealer ${C.short(w.d)}.`));
    if (rk(w.p) > rk(w.d)) { ret += st.bet * 3; lines.push(an.good('You win the war: Ante pays 1:1 and the war bet is returned.')); }
    else if (rk(w.p) === rk(w.d)) { ret += st.bet * 4; lines.push(an.good('Tie on the war too — bonus! Ante and war bet both pay 1:1.')); }
    else lines.push(an.bad('Dealer wins the war: you lose the ante and the war bet.'));
  } else {
    lines.push(an.info(`Tie on ${C.short(st.p)}. You surrendered: half your ante (${an.fmt(Math.floor(st.bet / 2))}) comes back.`));
  }
  if (st.tie) {
    if (tieHit) lines.push(an.good(`Tie bet pays 10:1 (+${an.fmt(st.tie * 10)}).`));
    else lines.push(an.bad(`Tie bet lost (${an.fmt(st.tie)}).`));
  }
  ctx.credit(ret);
  st.phase = 'done';
  const tips = [
    an.info('Casino War has a ~2.9% edge if you go to war on ties, ~3.7% if you surrender. All the "strategy" is that one decision.'),
    an.tip('Tie happens ~7.4% of the time with six decks (since you can draw the same rank as the dealer). The Tie bet pays 10:1 for a ~18.6% house edge — avoid it.'),
    an.tip('Since the dealer wins every war tie-break only when strictly higher, you win ties on the war (with a bonus) — that is what makes war the better choice than surrender.'),
  ];
  const outcomeNet = (ret) - st.bet - (how === 'war' ? st.bet : 0) - st.tie + (how === 'surrender' ? Math.floor(st.bet / 2) : 0) + (st.tie && tieHit ? st.tie * 11 : 0);
  ctx.end(`War ${how}`);
  const headline = how === 'surrender' ? 'Surrendered' : how === 'war' ? (ret ? 'Won the war' : 'Lost the war') : (rk(st.p) > rk(st.d) ? 'You win' : 'Dealer wins');
  return an.review(headline, outcomeNet, [['Result', lines], ['Odds & strategy', tips]]);
}

// ---------- shared-dealer tables: one dealer card (and one war card) for everybody ----------
const sharedInit = () => ({ shoe: C.newShoe(DECKS), dealer: null, warCard: null });
const drawM = mem => { if (!mem.shoe.length) mem.shoe = C.newShoe(DECKS); return mem.shoe.pop(); };
function roundBet(body) {
  const bet = Number(body && body.bet), tie = Number((body && body.tie) || 0);
  if (!Number.isInteger(bet) || bet < 1 || bet > MAX_BET) fail(`Bet must be between 1 and ${MAX_BET}.`);
  if (tie && (!Number.isInteger(tie) || tie < 1 || tie > 500)) fail('Tie bet must be between 1 and 500.');
  return { bet, tie, total: bet + tie };
}
function roundStart(mem) { if (mem.shoe.length < 40) mem.shoe = C.newShoe(DECKS); mem.dealer = drawM(mem); mem.warCard = null; }
function roundDeal(ctx, b, mem) {
  ctx.debit(b.total);
  const st = { bet: b.bet, tie: b.tie, p: drawM(mem), d: mem.dealer, war: null, phase: 'play', shared: true };
  ctx.state = st;
  if (rk(st.p) !== rk(st.d)) { ctx.analysis = finish(ctx, st, 'normal'); ctx.out = { stage: 'done' }; return; }
  if (b.tie) ctx.credit(b.tie * 11);
  st.phase = 'warcall'; ctx.out = { stage: 'play' };
}
function roundAct(ctx, action, body, mem) {
  const st = ctx.state; if (!st || st.phase !== 'warcall') fail('No tie to settle.');
  if (action === 'war') { ctx.debit(st.bet); ctx.rate('war:go', 1000, 1); st.war = { p: drawM(mem) }; st.phase = 'wait'; ctx.out = { stage: 'wait', live: true }; }
  else if (action === 'surrender') { ctx.rate('war:go', 1000, 0.35); ctx.credit(Math.floor(st.bet / 2)); ctx.analysis = finish(ctx, st, 'surrender'); ctx.out = { stage: 'done' }; }
  else fail('Unknown action.');
}
function roundPlayDealer(mem, anyLive) { if (anyLive) { drawM(mem); drawM(mem); drawM(mem); mem.warCard = drawM(mem); } }   // burn three, then the dealer's war card
function roundFinish(ctx, mem) { const st = ctx.state; st.war.d = mem.warCard; ctx.analysis = finish(ctx, st, 'war'); ctx.out = { stage: 'done' }; st.shared = false; }
function roundTableView(mem) {
  return { dealer: { cards: mem.dealer !== null && mem.dealer !== undefined ? [C.str(mem.dealer)] : [], war: mem.warCard !== null && mem.warCard !== undefined ? C.str(mem.warCard) : null, total: 0 }, count: { left: mem.shoe.length, decks: DECKS, rc: 0, tc: 0 }, text: mem.dealer !== null && mem.dealer !== undefined ? `Dealer ${C.short(mem.dealer)}` : 'Round over' };
}
function roundRecover(ctx) {
  const st = ctx.state; if (!st || !st.shared || !['warcall', 'wait'].includes(st.phase)) return false;
  ctx.refund(st.bet * (st.war ? 2 : 1), 0); st.phase = 'idle'; st.shared = false; return true;
}

module.exports = {
  id: 'war', name: 'Casino War', icon: '⚔️', category: 'cards', skill: 'none',
  blurb: 'High card wins. Tie? Go to war or surrender. Optional Tie bet pays 10:1.',
  edge: '2.88% (go to war)',
  shared: { mode: 'rounds', max: 6, secs: 12, insSecs: 5, actSecs: 20, primary: ['deal'], autoActions: ['war'], init: sharedInit, bet: roundBet, start: roundStart, deal: roundDeal, act: roundAct, peek: () => false, proceed: () => {}, playDealer: roundPlayDealer, finish: roundFinish, tableView: roundTableView, recover: roundRecover,
    botBet: () => ({ bet: [10, 20, 50][Math.floor(Math.random() * 3)] }), botAction: () => 'war' },
  meta: {
    rules: [
      'You and the dealer each get one card from a six-deck shoe. Aces are high. The higher card wins the ante 1:1.',
      'On a tie you choose: SURRENDER (lose half your ante) or GO TO WAR — raise by an amount equal to the ante, the dealer burns three cards, then each side gets one more card. If you win or tie the war, you are paid (win: ante pays 1:1 and the raise is returned; tie: both pay 1:1).',
      'The optional Tie bet pays 10:1 if your first two cards tie.',
    ],
    tips: ['Always go to war — surrender costs more over time.', 'Skip the Tie bet (18.6% edge).'],
  },
  view, actions,
  inProgress: st => !!st && (st.phase === 'warcall' || st.phase === 'wait'),
};
