'use strict';
// Runs one game action inside a DB transaction with a ctx that owns all chip movement.
const { stmt, tx } = require('./db');
const an = require('./an');
const cfg = require('./config');
const rating = require('./rating');
const { dayKey } = require('./clock');

class GameError extends Error { constructor(m) { super(m); this.status = 400; } }
const fail = m => { throw new GameError(m); };

function intIn(v, { min = 1, max = Infinity, step = 1, label = 'Amount' } = {}) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (!Number.isInteger(n)) fail(`${label} must be a whole number of chips.`);
  if (n < min) fail(`${label} must be at least ${min}.`);
  if (n > max) fail(`${label} can be at most ${max.toLocaleString('en-US')}.`);
  if (step > 1 && n % step !== 0) fail(`${label} must be a multiple of ${step}.`);
  return n;
}

function makeCtx(user, game, mod, opts = {}) {
  let settings = {}; try { settings = JSON.parse(user.settings || '{}'); } catch {}
  const demo = !!opts.demo;
  const row = stmt.gsGet.get(user.id, game);
  let saved = row && row.json ? JSON.parse(row.json) : null;
  const ctx = {
    userId: user.id, game, ended: false, summary: '', analysis: null,
    state: saved ? saved.s : null, out: null,
    net: saved ? saved.net || 0 : 0,      // net chips for the round in progress
    wager: saved ? saved.wager || 0 : 0,  // total chips put at risk this round
    demo, bal: demo ? user.demo_balance : user.balance,
    fee: opts.fee || cfg.effectiveFee(settings), rules: opts.rules || cfg.resolveRules(mod, settings),
    fees: saved ? saved.fees || 0 : 0, dFees: 0, lastFee: 0,
    coachOn: settings.coach !== false, rItems: [], rd: saved ? saved.rd || 0 : 0, rn: saved ? saved.rn || 0 : 0, rq: saved ? saved.rq || 0 : 0, ra: saved ? saved.ra || 0 : 0,
    dWager: 0, dReturn: 0, skillOk: 0, skillTotal: 0,
    balance() { return ctx.bal; },
    opt(key) { return ctx.rules[key]; },
    fail, int: intIn,
    debit(n) {
      if (n <= 0) return;
      const fee = cfg.feeFor(ctx.fee, n, ctx.wager === 0);
      if (n + fee > ctx.bal) {
        const room = Math.max(0, cfg.maxAffordable(ctx.fee, ctx.bal));
        fail(fee
          ? `Not enough chips — ${n.toLocaleString('en-US')} plus a ${fee}-chip hand fee needs ${(n + fee).toLocaleString('en-US')} but you have ${ctx.bal.toLocaleString('en-US')} (largest bet you can afford: ${room.toLocaleString('en-US')}).`
          : `Not enough chips — that needs ${n.toLocaleString('en-US')} but you have ${ctx.bal.toLocaleString('en-US')}.`);
      }
      ctx.bal -= n + fee; ctx.net -= n + fee; ctx.wager += n; ctx.dWager += n; ctx.fees += fee; ctx.dFees += fee; ctx.lastFee = fee;
    },
    // give back escrowed chips (bets + the fee that was charged on them); not a win, so stats are rolled back
    refund(n, fee = 0) {
      ctx.bal += n + fee; ctx.net += n + fee; ctx.wager -= n; ctx.dWager -= n; ctx.fees -= fee; ctx.dFees -= fee;
    },
    credit(n) { if (n > 0) { ctx.bal += n; ctx.net += n; ctx.dReturn += n; } },
    // mark the round finished; game supplies one-line summary for history
    end(summary) { ctx.ended = true; ctx.summary = summary || ''; },
    skill(ok, total) { ctx.skillOk += ok; ctx.skillTotal += total; },
    // grade one decision for the skill rating: spot id, difficulty (Elo scale ~800-2100), quality 0..1
    rate(spot, d, quality) { if (!demo) ctx.rItems.push({ spot, d, q: quality }); },    // practice rounds are never rated
  };
  return ctx;
}

const dkey = (game, demo) => (demo ? game + '#demo' : game);

function run(user, game, mod, action, body, opts = {}) {
  const demo = !!opts.demo;
  return tx(() => {
    const ctx = makeCtx(user, dkey(game, demo), mod, opts);
    let fn = opts.fn;
    if (!fn) {
      fn = mod.actions[action];
      if (!fn || !Object.prototype.hasOwnProperty.call(mod.actions, action)) fail('Unknown action.');
      if (ctx.state && ctx.state.pending) fail('You have bets waiting on a shared table — wait for that round to finish (or leave the table) first.');
    }
    const analysis = fn(ctx, body || {}) || null;
    if (analysis) ctx.analysis = analysis;

    if (opts.after) opts.after(ctx);              // runs inside the transaction (e.g. banker-table bank updates)
    if (!demo && (ctx.dWager || ctx.dReturn || ctx.dFees || ctx.ended)) {
      stmt.houseAdd.run(game, opts.source || 'casino', dayKey(), ctx.dWager, ctx.dReturn, ctx.dFees, ctx.ended ? 1 : 0);
    }
    let rr = null;
    if (ctx.rItems.length) {
      rr = rating.apply(user.id, game, ctx.rItems, ctx.coachOn);
      if (rr) { ctx.rd += rr.delta; ctx.rn += rr.rated; ctx.ra += rr.assisted; ctx.rq += ctx.rItems.reduce((a, b) => a + b.q, 0); ctx.rBefore = ctx.rBefore === undefined ? rr.before : ctx.rBefore; ctx.rAfter = rr.after; ctx.rProv = rr.provisional; }
    }
    if (demo) stmt.setDemo.run(ctx.bal, user.id);          // practice wallet only — no stats, ledger, history or rating
    else {
      stmt.statEnsure.run(user.id, game);
      if (ctx.dWager) stmt.statWager.run(ctx.dWager, user.id, game);
      if (ctx.dReturn) stmt.statReturn.run(ctx.dReturn, user.id, game);
      if (ctx.dFees) stmt.statFees.run(ctx.dFees, user.id, game);
      if (ctx.skillTotal) stmt.statSkill.run(ctx.skillOk, ctx.skillTotal, user.id, game);
      stmt.setBalance.run(ctx.bal, ctx.bal, user.id);
    }

    let lastJson = null;
    if (ctx.ended) {
      if (!demo) {
        stmt.statRound.run(ctx.net, user.id, game);
        stmt.histIns.run(user.id, game, ctx.net, ctx.summary.slice(0, 200), Date.now());
        stmt.histPrune.run(user.id, user.id);
      }
      if (ctx.analysis) {
        ctx.analysis.net = ctx.net; ctx.analysis.tone = ctx.net > 0 ? 'win' : ctx.net < 0 ? 'lose' : 'push';
        if (ctx.fees > 0) {
          const f = ctx.fee;
          ctx.analysis.fees = ctx.fees;
          ctx.analysis.sections.push({ title: 'House fee', items: [
            an.warn(`Hand fee paid this round: ${ctx.fees.toLocaleString('en-US')} chips (${f.mode === 'pct' ? f.value + '% of every wager' : f.value + ' chips per hand'}). The result above already includes it.`),
            an.tip(f.mode === 'pct'
              ? `A ${f.value}% fee on each wager adds about ${f.value} percentage points to the house edge on top of the game's own edge — the same trick poker rooms and some "no-commission" tables use. Change it any time under Table settings.`
              : `A flat ${f.value}-chip fee per hand hurts small bets most: on a ${Math.max(1, Math.round(ctx.wager || ctx.fees))}-chip wager it is about a ${(f.value / Math.max(1, ctx.wager || f.value) * 100).toFixed(1)}% edge on top of the game's own. Bigger bets dilute it.`),
          ] });
        }
      }
      if (ctx.analysis && demo) ctx.analysis.sections.push({ title: 'Demo round', items: [{ k: 'info', t: 'This was a practice round with demo chips. It doesn\'t touch your real balance, stats, leaderboards or skill rating — play as long as you like.' }] });
      if (ctx.analysis && !demo && (ctx.rn || ctx.ra)) {
        const tot = ctx.rn + ctx.ra;
        const items = [];
        if (ctx.rn) {
          const r = Math.round(ctx.rAfter), d = ctx.rd, t = rating.tier(ctx.rAfter);
          items.push({ k: d >= 0 ? 'good' : 'bad', t: `Skill rating ${r} ${t.icon} ${t.name}${ctx.rProv ? ' (provisional)' : ''}: ${d >= 0 ? '▲ +' : '▼ '}${d.toFixed(1)} this round from ${ctx.rn} graded decision${ctx.rn > 1 ? 's' : ''}.` });
        }
        if (ctx.ra) items.push({ k: 'info', t: `${ctx.ra} decision${ctx.ra > 1 ? 's were' : ' was'} made with the coach showing the answer, so ${ctx.ra > 1 ? 'they' : 'it'} didn't affect your rating. Switch the coach off (Settings) to play rated.` });
        items.push({ k: 'tip', t: 'Ratings work like chess Elo: easy spots barely move you, hard spots swing a lot. Only information visible to you at the time is graded.' });
        ctx.analysis.sections.push({ title: 'Skill rating', items });
        ctx.analysis.rating = { after: ctx.rAfter, delta: ctx.rd };
      }
      ctx.net = 0; ctx.wager = 0; ctx.fees = 0; ctx.rd = 0; ctx.rn = 0; ctx.ra = 0; ctx.rq = 0; ctx.rBefore = undefined;
    }
    if (ctx.analysis) lastJson = JSON.stringify(ctx.analysis);
    const prev = stmt.gsGet.get(user.id, dkey(game, demo));
    stmt.gsSet.run(user.id, dkey(game, demo),
      JSON.stringify({ s: ctx.state, net: ctx.net, wager: ctx.wager, fees: ctx.fees, rd: ctx.rd, rn: ctx.rn, rq: ctx.rq, ra: ctx.ra }),
      lastJson !== null ? lastJson : (prev ? prev.last : null));
    if (demo) user.demo_balance = ctx.bal; else user.balance = ctx.bal;
    return { ctx, out: ctx.out, analysis: ctx.analysis, view: mod.view(ctx.state, { balance: ctx.bal, rules: ctx.rules, fee: ctx.fee, coachOn: ctx.coachOn, demo }) };
  });
}

function peek(user, game, mod, opts = {}) {
  const demo = !!opts.demo;
  const row = stmt.gsGet.get(user.id, dkey(game, demo));
  const saved = row && row.json ? JSON.parse(row.json) : null;
  let settings = {}; try { settings = JSON.parse(user.settings || '{}'); } catch {}
  return {
    view: mod.view(saved ? saved.s : null, { balance: demo ? user.demo_balance : user.balance, rules: opts.rules || cfg.resolveRules(mod, settings), fee: opts.fee || cfg.effectiveFee(settings), coachOn: settings.coach !== false, demo }),
    last: row && row.last ? JSON.parse(row.last) : null,
  };
}

module.exports = { run, peek, GameError, fail, intIn };
