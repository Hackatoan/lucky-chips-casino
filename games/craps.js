'use strict';
const R = require('../lib/rng');
const an = require('../lib/an');
const { fail } = require('../lib/engine');

const MAX_BET = 5000;
const NUMS = [4, 5, 6, 8, 9, 10];
const PLACE_PAY = { 4: [9, 5], 5: [7, 5], 6: [7, 6], 8: [7, 6], 9: [7, 5], 10: [9, 5] };      // place: 9:5, 7:5, 7:6
const TRUE_PAY = { 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] };      // odds / buy true odds
const LAY_PAY = { 4: [1, 2], 5: [2, 3], 6: [5, 6], 8: [5, 6], 9: [2, 3], 10: [1, 2] };
const HARD_PAY = { 4: 7, 6: 9, 8: 9, 10: 7 };
const OFF_ON_COMEOUT = new Set(['place', 'buy', 'lay', 'hard', 'big']);

// ---- bet catalogue ----
const BETS = {
  pass: { name: 'Pass Line', pays: '1:1', edge: 0.0141, group: 'line', min: 1, step: 1, desc: 'Win on 7/11 at the come-out, lose on 2/3/12. Otherwise that number becomes the point: win if it repeats before a 7.' },
  dontpass: { name: "Don't Pass", pays: '1:1 (12 pushes)', edge: 0.0136, group: 'line', min: 1, step: 1, desc: 'The opposite of the Pass Line. Wins on 2/3 at the come-out, loses on 7/11, pushes 12; after a point, wins if a 7 comes first.' },
  come: { name: 'Come', pays: '1:1', edge: 0.0141, group: 'line', min: 1, step: 1, desc: 'A Pass Line bet you place after a point is set — its own come-out is the next roll. (Point must be on.)' },
  dontcome: { name: "Don't Come", pays: '1:1 (12 pushes)', edge: 0.0136, group: 'line', min: 1, step: 1, desc: "A Don't Pass bet you place after the point is set. (Point must be on.)" },
  place: { name: 'Place', pays: '9:5 on 4/10 · 7:5 on 5/9 · 7:6 on 6/8', edge: 0.0152, group: 'num', min: 5, step: 5, desc: 'Bet that a number rolls before a 7. Bet 6/8 in multiples of $6 for an exact 7:6 payout — other amounts (e.g. $5) are paid rounded down, which costs you a little extra edge. Stays up after winning. Off on the come-out roll. Best at 6 and 8 (1.52%).' },
  buy: { name: 'Buy', pays: 'True odds minus 5% commission on win', edge: 0.0476, group: 'num', min: 20, step: 20, desc: 'Like Place but at true odds with a 5% commission on winnings. Only better than Place on 4 and 10.' },
  lay: { name: 'Lay', pays: 'True odds against, minus 5% commission', edge: 0.0244, group: 'num', min: 6, step: 6, desc: 'Bet a 7 comes before a number. Edge 2.44% on 4/10, 3.23% on 5/9, 4% on 6/8.' },
  hard: { name: 'Hardway', pays: '7:1 on 4/10 · 9:1 on 6/8', edge: 0.1111, group: 'num', min: 1, step: 1, desc: 'The number must roll as a pair (e.g. 3-3) before it rolls "easy" or a 7. Off on the come-out. Edge 9–11%.' },
  big: { name: 'Big 6 / Big 8', pays: '1:1', edge: 0.0909, group: 'num', min: 1, step: 1, desc: 'Bet 6 or 8 rolls before a 7 at only 1:1 — Place 6/8 pays 7:6 for the same risk. A classic sucker bet.' },
  field: { name: 'Field', pays: '1:1 · 2 pays 2:1 · 12 pays 3:1', edge: 0.0278, group: 'one', min: 1, step: 1, desc: 'One roll: wins on 2,3,4,9,10,11,12; loses on 5,6,7,8.' },
  any7: { name: 'Any Seven', pays: '4:1', edge: 0.1667, group: 'one', min: 1, step: 1, desc: 'One roll: a 7 wins. The worst bet on the table.' },
  anycraps: { name: 'Any Craps', pays: '7:1', edge: 0.1111, group: 'one', min: 1, step: 1, desc: 'One roll: 2, 3 or 12.' },
  two: { name: 'Aces (2)', pays: '30:1', edge: 0.1389, group: 'one', min: 1, step: 1, desc: 'One roll: snake eyes.' },
  twelve: { name: 'Boxcars (12)', pays: '30:1', edge: 0.1389, group: 'one', min: 1, step: 1, desc: 'One roll: double sixes.' },
  three: { name: 'Ace-Deuce (3)', pays: '15:1', edge: 0.1111, group: 'one', min: 1, step: 1, desc: 'One roll: a 3.' },
  eleven: { name: 'Yo (11)', pays: '15:1', edge: 0.1111, group: 'one', min: 1, step: 1, desc: 'One roll: an 11.' },
  ce: { name: 'C & E', pays: 'Craps 3:1 · Eleven 7:1', edge: 0.1111, group: 'one', min: 1, step: 1, desc: 'One roll: any craps or 11.' },
  horn: { name: 'Horn', pays: '2/12: 6.75:1 · 3/11: 3:1 (net)', edge: 0.125, group: 'one', min: 4, step: 4, desc: 'One roll: four bets in one on 2, 3, 11, 12 — you pick up 3/4 of your stake otherwise. Multiples of 4.' },
};
const MAX_ODDS = { '1': 1, '2': 2, '3': 3, '5': 5, '10': 10, '100': 100 };

function stakeFor(type, num) { return BETS[type]; }

// ---- resolve one roll against a bet list ----
function resolveRoll(st, d1, d2, rules) {
  const t = d1 + d2, hard = d1 === d2, point = st.point;
  const comeOut = point === 0;
  const res = [];
  const keep = [];
  let newPoint = point;
  const fieldPay = rules.field === 'double' ? 2 : 3;
  const push = (b, kind, ret, note) => res.push({ b, kind, ret, note });   // ret = chips returned to the player (incl. stake when stake is released)

  // 1) line / come bets
  for (const b of st.bets) {
    const odds = b.odds || 0;
    switch (b.type) {
      case 'pass': {
        if (comeOut) {
          if (t === 7 || t === 11) push(b, 'win', b.amount * 2, `Natural ${t} — Pass Line wins`);
          else if (t === 2 || t === 3 || t === 12) push(b, 'lose', 0, `Craps ${t} — Pass Line loses`);
          else { keep.push(b); }
        } else if (t === point) { const w = Math.floor(odds * TRUE_PAY[point][0] / TRUE_PAY[point][1]); push(b, 'win', b.amount * 2 + odds + w, `Point ${point} made — Pass Line${odds ? ' and odds' : ''} win`); }
        else if (t === 7) push(b, 'lose', 0, 'Seven-out — Pass Line loses');
        else keep.push(b);
        break;
      }
      case 'dontpass': {
        if (comeOut) {
          if (t === 2 || t === 3) push(b, 'win', b.amount * 2, `${t} — Don't Pass wins`);
          else if (t === 12) push(b, 'push', b.amount, '12 — Don\'t Pass pushes (bar 12)');
          else if (t === 7 || t === 11) push(b, 'lose', 0, `${t} — Don't Pass loses`);
          else keep.push(b);
        } else if (t === 7) { const w = Math.floor(odds * LAY_PAY[point][0] / LAY_PAY[point][1]); push(b, 'win', b.amount * 2 + odds + w, `Seven-out — Don't Pass${odds ? ' and lay odds' : ''} win`); }
        else if (t === point) push(b, 'lose', 0, `Point ${point} made — Don't Pass loses`);
        else keep.push(b);
        break;
      }
      case 'come': {
        if (!b.pt) {
          if (t === 7 || t === 11) push(b, 'win', b.amount * 2, `${t} — Come wins`);
          else if (t === 2 || t === 3 || t === 12) push(b, 'lose', 0, `${t} — Come loses`);
          else { b.pt = t; keep.push(b); res.push({ b, kind: 'move', ret: 0, note: `Come bet moves to the ${t}` }); }
        } else if (t === b.pt) { const w = comeOut ? 0 : Math.floor(odds * TRUE_PAY[b.pt][0] / TRUE_PAY[b.pt][1]); push(b, 'win', b.amount * 2 + odds + w, `${t} repeats — Come bet${odds && !comeOut ? ' and odds' : ''} win${comeOut && odds ? ' (odds were off: returned)' : ''}`); }
        else if (t === 7) push(b, 'lose', comeOut ? odds : 0, comeOut && odds ? 'Seven — Come loses, odds returned (off on come-out)' : 'Seven — Come bet loses');
        else keep.push(b);
        break;
      }
      case 'dontcome': {
        if (!b.pt) {
          if (t === 2 || t === 3) push(b, 'win', b.amount * 2, `${t} — Don't Come wins`);
          else if (t === 12) push(b, 'push', b.amount, "12 — Don't Come pushes");
          else if (t === 7 || t === 11) push(b, 'lose', 0, `${t} — Don't Come loses`);
          else { b.pt = t; keep.push(b); res.push({ b, kind: 'move', ret: 0, note: `Don't Come moves behind the ${t}` }); }
        } else if (t === 7) { const w = comeOut ? 0 : Math.floor(odds * LAY_PAY[b.pt][0] / LAY_PAY[b.pt][1]); push(b, 'win', b.amount * 2 + odds + w, "Seven — Don't Come wins"); }
        else if (t === b.pt) push(b, 'lose', comeOut ? odds : 0, `${t} repeats — Don't Come loses`);
        else keep.push(b);
        break;
      }
      case 'place': case 'buy': case 'lay': case 'hard': case 'big': {
        if (comeOut) { keep.push(b); break; }                              // off on the come-out
        const n = b.num;
        if (b.type === 'place') {
          if (t === n) { const w = Math.floor(b.amount * PLACE_PAY[n][0] / PLACE_PAY[n][1]); push(b, 'win', w, `Place ${n} wins ${w}`); keep.push(b); }
          else if (t === 7) push(b, 'lose', 0, `Seven — Place ${n} loses`);
          else keep.push(b);
        } else if (b.type === 'buy') {
          if (t === n) { const w = Math.floor(b.amount * TRUE_PAY[n][0] / TRUE_PAY[n][1]) - Math.floor(b.amount * 0.05); push(b, 'win', w, `Buy ${n} wins ${w} (after 5% commission)`); keep.push(b); }
          else if (t === 7) push(b, 'lose', 0, `Seven — Buy ${n} loses`);
          else keep.push(b);
        } else if (b.type === 'lay') {
          if (t === 7) { const w = Math.floor(b.amount * LAY_PAY[n][0] / LAY_PAY[n][1]); const w2 = w - Math.floor(w * 0.05); push(b, 'win', w2, `Seven — Lay ${n} wins ${w2}`); keep.push(b); }
          else if (t === n) push(b, 'lose', 0, `${n} rolls — Lay ${n} loses`);
          else keep.push(b);
        } else if (b.type === 'hard') {
          if (t === n && hard) { const w = b.amount * HARD_PAY[n]; push(b, 'win', w, `Hard ${n} wins ${w}`); keep.push(b); }
          else if (t === 7 || t === n) push(b, 'lose', 0, t === 7 ? `Seven — Hard ${n} loses` : `${n} the easy way — Hard ${n} loses`);
          else keep.push(b);
        } else if (b.type === 'big') {
          if (t === n) { push(b, 'win', b.amount, `Big ${n} wins ${b.amount}`); keep.push(b); }
          else if (t === 7) push(b, 'lose', 0, `Seven — Big ${n} loses`);
          else keep.push(b);
        }
        break;
      }
      // one-roll bets
      case 'field': {
        if ([3, 4, 9, 10, 11].includes(t)) push(b, 'win', b.amount * 2, `Field wins on ${t}`);
        else if (t === 2) push(b, 'win', b.amount * 3, 'Field pays 2:1 on 2');
        else if (t === 12) push(b, 'win', b.amount * (fieldPay + 1), `Field pays ${fieldPay}:1 on 12`);
        else push(b, 'lose', 0, `Field loses on ${t}`);
        break;
      }
      case 'any7': t === 7 ? push(b, 'win', b.amount * 5, 'Any Seven hits 4:1') : push(b, 'lose', 0, 'Any Seven misses'); break;
      case 'anycraps': [2, 3, 12].includes(t) ? push(b, 'win', b.amount * 8, 'Any Craps hits 7:1') : push(b, 'lose', 0, 'Any Craps misses'); break;
      case 'two': t === 2 ? push(b, 'win', b.amount * 31, 'Aces pay 30:1') : push(b, 'lose', 0, 'Aces miss'); break;
      case 'twelve': t === 12 ? push(b, 'win', b.amount * 31, 'Boxcars pay 30:1') : push(b, 'lose', 0, 'Boxcars miss'); break;
      case 'three': t === 3 ? push(b, 'win', b.amount * 16, 'Ace-Deuce pays 15:1') : push(b, 'lose', 0, 'Ace-Deuce misses'); break;
      case 'eleven': t === 11 ? push(b, 'win', b.amount * 16, 'Yo pays 15:1') : push(b, 'lose', 0, 'Yo misses'); break;
      case 'ce': if ([2, 3, 12].includes(t)) push(b, 'win', b.amount * 4, 'C&E: craps pays 3:1'); else if (t === 11) push(b, 'win', b.amount * 8, 'C&E: eleven pays 7:1'); else push(b, 'lose', 0, 'C&E misses'); break;
      case 'horn': { const q = b.amount / 4; if (t === 2 || t === 12) push(b, 'win', q * 31 - 0 + 0 === 0 ? 0 : q * 31, `Horn hits ${t}: ${q * 30} on that quarter`); else if (t === 3 || t === 11) push(b, 'win', q * 16, `Horn hits ${t}`); else push(b, 'lose', 0, 'Horn misses'); break; }
    }
  }
  // 2) update point
  if (comeOut) { if (NUMS.includes(t)) newPoint = t; }
  else if (t === point || t === 7) newPoint = 0;
  return { t, hard, res, keep, newPoint, comeOut };
}

// ---- betting ----
function oddsLimit(b, mult) { return b.amount * mult; }
function validOdds(b, amount, mult, pt) {
  if (!pt) fail('Odds go behind a bet that already has a point.');
  if (amount > oddsLimit(b, mult)) fail(`Max odds on this bet is ${mult}× your flat bet (${oddsLimit(b, mult)} chips).`);
  const lay = b.type === 'dontpass' || b.type === 'dontcome';
  const tbl = lay ? LAY_PAY[pt] : TRUE_PAY[pt];
  const unit = lay ? tbl[1] : tbl[1];
  if (amount % unit !== 0) fail(`${lay ? 'Lay' : ''} odds on the ${pt} must be a multiple of ${unit} so the payout is a whole number.`);
}

function normalizeBets(ctx, st, raw) {
  if (!Array.isArray(raw) || !raw.length) fail('Choose a bet first.');
  if (raw.length > 20) fail('At most 20 bets at once.');
  const out = [];
  for (const r of raw) {
    const d = BETS[r && r.type];
    if (!d) fail('Unknown bet.');
    const amount = ctx.int(r.amount, { min: d.min, max: MAX_BET, step: d.step, label: d.name });
    const num = r.num === undefined ? 0 : Number(r.num);
    if (d.group === 'num') {
      const okNums = r.type === 'hard' ? [4, 6, 8, 10] : r.type === 'big' ? [6, 8] : NUMS;
      if (!okNums.includes(num)) fail(`${d.name}: pick ${r.type === 'hard' ? '4, 6, 8 or 10' : r.type === 'big' ? '6 or 8' : 'a point number'}.`);
      if (r.type === 'place' && (num === 5 || num === 9) && amount % 5 !== 0) fail('Place bets on 5 and 9 should be multiples of 5 (pays 7:5).');
      if (r.type === 'place' && (num === 4 || num === 10) && amount % 5 !== 0) fail('Place bets on 4 and 10 should be multiples of 5 (pays 9:5).');
      if (r.type === 'lay') { const unit = LAY_PAY[num][1]; if (amount % unit) fail(`Lay on the ${num} must be a multiple of ${unit}.`); }
    }
    if (r.type === 'pass' || r.type === 'dontpass') { if (st.point) fail('Pass and Don\'t Pass can only be bet before the point is set (come-out roll). Use Come / Don\'t Come now.'); }
    if (r.type === 'come' || r.type === 'dontcome') { if (!st.point) fail('Come and Don\'t Come need a point to be on. Bet the Pass Line first.'); }
    out.push({ type: r.type, num: d.group === 'num' ? num : 0, amount, odds: 0, pt: 0 });
  }
  return out;
}

function addBets(ctx, st, bets, table) {
  let total = 0;
  for (const b of bets) {
    // grading for "smart betting" (public information: the published house edge)
    const d = BETS[b.type];
    const q = Math.max(0, Math.min(1, 1 - (d.edge - 0.0136) / 0.13));
    ctx.rate('craps:bet:' + b.type, b.type === 'pass' || b.type === 'dontpass' ? 900 : 1150, q);
    st.bets.push({ id: ++st.seq, ...b });
    total += b.amount;
  }
  ctx.debit(total);
  return total;
}

function newState() { return { point: 0, bets: [], seq: 0, rolls: [], last: null }; }
function maxOdds(ctx) { return MAX_ODDS[String(ctx.opt('odds'))] || 3; }

const actions = {
  place(ctx, body) {
    const st = ctx.state || newState(); ctx.state = st;
    const bets = normalizeBets(ctx, st, body.bets);
    addBets(ctx, st, bets);
  },
  odds(ctx, body) {
    const st = ctx.state; if (!st) fail('No bets yet.');
    const b = st.bets.find(x => x.id === Number(body.id));
    if (!b || !['pass', 'dontpass', 'come', 'dontcome'].includes(b.type)) fail('Pick a Pass, Don\'t Pass, Come or Don\'t Come bet.');
    const pt = (b.type === 'pass' || b.type === 'dontpass') ? st.point : b.pt;
    const add = ctx.int(body.amount, { min: 1, max: MAX_BET, label: 'Odds' });
    const mult = maxOdds(ctx);
    validOdds(b, (b.odds || 0) + add, mult, pt);
    ctx.debit(add); b.odds = (b.odds || 0) + add;
    ctx.rate('craps:odds', 1400, 1);
  },
  remove(ctx, body) {
    const st = ctx.state; if (!st) fail('No bets.');
    const ids = (body.ids || []).map(Number);
    let back = 0, fee = 0;
    st.bets = st.bets.filter(b => {
      if (!ids.includes(b.id)) return true;
      if (['pass', 'dontpass'].includes(b.type) && st.point) return true;     // can't pull a line bet once the point is on
      if (['come', 'dontcome'].includes(b.type) && b.pt) return true;
      back += b.amount + (['place', 'buy', 'lay', 'hard', 'big', 'field'].includes(b.type) ? 0 : (b.odds || 0));
      return false;
    });
    if (!back) fail('Those bets can\'t be taken down (line bets stay up once the point is set).');
    ctx.refund(back, 0);
  },
  roll(ctx) {
    const st = ctx.state; if (!st || !st.bets.length) fail('Place a bet before rolling.');
    return doRoll(ctx, R.die(), R.die());
  },
};

function doRoll(ctx, d1, d2, tableInfo) {
  const st = ctx.state;
  const r = resolveRoll(st, d1, d2, { field: ctx.opt('field') });
  const t = r.t;
  st.rolls.push(t); if (st.rolls.length > 40) st.rolls.shift();
  let returned = 0, net = 0;
  const lines = [];
  for (const x of r.res) {
    if (x.kind === 'move') { lines.push(an.info(`${BETS[x.b.type].name}: ${x.note}.`)); continue; }
    returned += x.ret;
    const stake = ['place', 'buy', 'lay', 'hard', 'big'].includes(x.b.type) && x.kind === 'win' ? 0 : x.b.amount + (x.b.odds && ['pass', 'dontpass', 'come', 'dontcome'].includes(x.b.type) ? x.b.odds : 0);
    const gain = x.ret - stake;
    lines.push((x.kind === 'win' ? an.good : x.kind === 'lose' ? an.bad : an.info)(`${BETS[x.b.type].name}${x.b.num ? ' ' + x.b.num : ''} ${an.fmt(x.b.amount)}${x.b.odds ? ' + ' + an.fmt(x.b.odds) + ' odds' : ''}: ${x.note} (${an.signed(x.kind === 'win' ? gain : x.kind === 'push' ? 0 : -stake)})`));
  }
  // number bets that lose on a seven-out etc. were removed from keep; remaining stay on the layout
  st.bets = r.keep;
  const wasPoint = st.point;
  st.point = r.newPoint;
  ctx.credit(returned);
  st.last = { d1, d2, t };

  // commentary
  const tips = [];
  if (r.comeOut) tips.push(an.info(r.newPoint ? `Come-out roll ${t}: the point is now ${r.newPoint}. The shooter must roll ${r.newPoint} again before a 7.` : `Come-out roll ${t}: ${t === 7 || t === 11 ? 'a natural' : 'craps'} — the round ends and a new come-out follows.`));
  else if (t === wasPoint) tips.push(an.info(`The shooter hit the point (${wasPoint}) — Pass Line players win, a new come-out roll follows.`));
  else if (t === 7) tips.push(an.info('Seven-out: the shooter lost. Don\'t Pass players win; the dice move on.'));
  else tips.push(an.info(`${t} rolled — nothing decided; the point is still ${wasPoint}.`));
  const pOdds = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  tips.push(an.tip(`Probability of rolling ${t} is ${pOdds[t]}/36 (${(pOdds[t] / 36 * 100).toFixed(1)}%). A 7 is the most common roll — 6 ways of 36 — which is why every number bet fears it.`));
  if (st.bets.some(b => b.type === 'pass' || b.type === 'dontpass') && !st.bets.some(b => b.odds)) tips.push(an.tip('Take or lay ODDS behind your line bet once a point is set: odds pay at true odds, so they have a 0% house edge and cut your total edge to ~0.6% (3×) or ~0.2% (10×).'));
  const hasProp = st.bets.concat(r.res.map(x => x.b)).some(b => BETS[b.type].group === 'one' && b.type !== 'field');
  if (hasProp) tips.push(an.warn('Proposition bets (Any Seven, Craps, Horn, C&E, Aces/Boxcars, Yo) carry 11–17% house edges. Pass Line + odds is the cheapest bet in any casino.'));
  if (st.bets.some(b => b.type === 'big')) tips.push(an.warn('Big 6/8 pays 1:1; Place 6/8 pays 7:6 for the same risk. Always Place instead of Big.'));
  const wagered = lines.length;
  if (r.res.length === 0 && st.bets.length === 0) tips.push(an.info('No bets resolved this roll.'));

  net = returned - r.res.reduce((s, x) => s + (x.kind === 'move' ? 0 : (['place', 'buy', 'lay', 'hard', 'big'].includes(x.b.type) && x.kind === 'win' ? 0 : x.b.amount + ((x.b.odds && ['pass', 'dontpass', 'come', 'dontcome'].includes(x.b.type)) ? x.b.odds : 0))), 0);
  // The round is "over" for history when the layout is empty or the come-out resets
  const done = !st.bets.length || (r.comeOut === false && st.point === 0 && !st.bets.some(b => b.type !== 'field'));
  if (!st.bets.length) ctx.end(`Craps roll ${t}`);
  else { ctx.ended = true; ctx.summary = `Craps roll ${t}`; }     // every roll is its own history row
  ctx.out = { staked: st.bets.reduce((s, b) => s + b.amount + (b.odds || 0), 0), active: st.bets.length > 0 };
  const headline = `${d1} + ${d2} = ${t}${r.hard && [4, 6, 8, 10].includes(t) ? ' (hard)' : ''}`;
  return an.review(headline, net, [['This roll', lines.length ? lines : [an.info('No bets were affected by this roll.')]], ['What it means', tips]]);
}

function view(st, { rules } = {}) {
  const s = st || newState();
  const mult = rules ? MAX_ODDS[String(rules.odds)] || 3 : 3;
  return {
    point: s.point, rolls: s.rolls, last: s.last, maxOdds: mult, maxBet: MAX_BET, field: rules ? rules.field : 'triple',
    bets: s.bets.map(b => ({ id: b.id, type: b.type, name: BETS[b.type].name, num: b.num, amount: b.amount, odds: b.odds || 0, pt: b.pt, working: !OFF_ON_COMEOUT.has(b.type) || s.point !== 0, removable: !(['pass', 'dontpass'].includes(b.type) && s.point) && !(['come', 'dontcome'].includes(b.type) && b.pt) })),
  };
}

const shared = {
  mode: 'simul', repeat: true, max: 8, secs: 20, primary: ['roll'], resultMs: 5500,
  init: () => ({ point: 0, rolls: [] }),
  place(ctx, body, table) {
    const st = ctx.state || newState(); ctx.state = st;
    st.point = table.mem.point;                      // everyone shares the table's puck
    if (body.odds) return actions.odds(ctx, body.odds);
    if (body.remove) { actions.remove(ctx, { ids: body.remove }); }
    else { const bets = normalizeBets(ctx, st, body.bets); addBets(ctx, st, bets, table); }
    ctx.out = { staked: st.bets.reduce((s, b) => s + b.amount + (b.odds || 0), 0), active: st.bets.length > 0 };
  },
  roll(mem) {
    const d1 = R.die(), d2 = R.die(), t = d1 + d2, before = mem.point;
    if (before === 0) { if (NUMS.includes(t)) mem.point = t; }
    else if (t === before || t === 7) mem.point = 0;
    mem.rolls.push(t); if (mem.rolls.length > 30) mem.rolls.shift();
    return { d1, d2, t, before, after: mem.point };
  },
  settle(ctx, o) {
    const st = ctx.state; st.point = o.before;
    return doRoll(ctx, o.d1, o.d2);
  },
  describe: o => `${o.d1}+${o.d2}=${o.t}`,
  outcomeView: o => ({ d1: o.d1, d2: o.d2, t: o.t, before: o.before, after: o.after, text: `${o.d1}+${o.d2} = ${o.t}`, n: String(o.t), c: o.t === 7 ? 'red' : 'green' }),
  publicMem: mem => ({ point: mem.point, rolls: mem.rolls }),
};

module.exports = {
  id: 'craps', name: 'Craps', icon: '🎲', category: 'dice', skill: 'medium',
  blurb: 'Pass/Don\'t Pass, Come, odds, Place/Buy/Lay, hardways, Field and every prop bet — with a coach that points you to the cheap bets.',
  edge: '0.2–1.4% (line + odds)', shared,
  meta: {
    rules: [
      'A shooter rolls two dice. The first roll of a round is the "come-out": 7 or 11 wins the Pass Line, 2, 3 or 12 loses. Any other number becomes the POINT. The shooter then rolls until they either repeat the point (Pass wins) or roll a 7 ("seven-out", Don\'t Pass wins).',
      'Line bets: Pass / Don\'t Pass (before the point) and Come / Don\'t Come (after it). Take ODDS behind them for a true-odds payout with zero house edge — the best bet in the casino.',
      'Number bets: Place (bet a number hits before a 7), Buy (true odds, 5% commission), Lay (bet against a number), Hardways (a pair), Big 6/8. These are off on the come-out roll.',
      'One-roll bets: Field, Any Seven, Any Craps, Aces, Boxcars, Ace-Deuce, Yo, C&E, Horn.',
      'Single player: place your bets, then press Roll. Shared table: place bets, then hit "Go" — the table rolls once everybody is ready or the timer ends.',
    ],
    tips: [
      'Cheapest strategy: Pass (1.41%) or Don\'t Pass (1.36%), then take the maximum odds. With 3× odds your overall edge is about 0.6%.',
      'Place 6 and 8 (1.52%) are the best number bets; Buy only beats Place on 4 and 10; Lay is the cheapest way to bet against a number.',
      'Avoid Big 6/8, Hardways and every proposition bet — house edges from 9% to nearly 17%.',
      'Field has a 2.78% edge here (12 pays 3:1) — fine for a quick bet but costlier than a line bet.',
    ],
    bets: BETS,
    options: [
      { key: 'odds', label: 'Maximum odds', type: 'select', default: '3', choices: [
        { v: '1', label: '1× odds (Pass edge stays ~0.8%)', edge: 0.8 },
        { v: '2', label: '2× odds (~0.6% with Pass)', edge: 0.6 },
        { v: '3', label: '3× odds (~0.47% with Pass)', edge: 0.47 },
        { v: '5', label: '5× odds (~0.33% with Pass)', edge: 0.33 },
        { v: '10', label: '10× odds (~0.18% with Pass)', edge: 0.18 },
        { v: '100', label: '100× odds (~0.02% with Pass)', edge: 0.02 }] },
      { key: 'field', label: 'Field payout on 12', type: 'select', default: 'triple', choices: [
        { v: 'triple', label: 'Double on 2, triple on 12 (2.78% edge)', edge: 2.78 },
        { v: 'double', label: 'Double on 2 and 12 (5.56% edge)', edge: 5.56 }] },
    ],
  },
  view, actions,
  inProgress: st => !!st && st.bets && st.bets.length > 0,
  _t: { resolveRoll, newState, BETS },
};
