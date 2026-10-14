'use strict';
// Config-driven slot engine. Machine types:
//   classic – 3 reels, one centre payline          lines – N reels x 3 rows, paylines, wilds, scatter free spins
//   ways    – 243 ways, wilds, free spins           cluster – 6x5 "pays anywhere" with cascades + free spins
// Reels are weighted strips. A tuner (test/slots.tune.js) pads the strips with blanks until the machine's return hits its target.
const R = require('./rng');
const an = require('./an');
const { fail } = require('./engine');
const { parallel } = require('./sharedkit');
const { db, stmt } = require('./db');

db.exec('CREATE TABLE IF NOT EXISTS jackpots(id TEXT PRIMARY KEY, amount INTEGER NOT NULL, last_winner TEXT, last_amount INTEGER, last_ts INTEGER)');

// ---------- strips ----------
function hashOrder(i, salt) { let x = (i + 1) * 2654435761 + salt * 40503; x ^= x >>> 15; x = Math.imul(x, 2246822519); x ^= x >>> 13; return (x >>> 0) / 4294967296; }
function buildStrips(cfg) {
  const strips = [];
  for (let r = 0; r < cfg.reels; r++) {
    const w = cfg.weights[Math.min(r, cfg.weights.length - 1)];
    const list = [];
    for (const [sym, n] of Object.entries(w)) for (let i = 0; i < n; i++) list.push(sym);
    for (let i = 0; i < (cfg.blanks || 0); i++) list.push('_');
    // deterministic scatter so identical symbols aren't clumped
    const keyed = list.map((s, i) => [hashOrder(i, r * 97 + s.charCodeAt(0)), s]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    strips.push(keyed);
  }
  return strips;
}

// ---------- spinning ----------
function spinGrid(cfg, strips) {
  const rows = cfg.rows;
  const grid = [];                                    // grid[reel][row]
  for (let r = 0; r < cfg.reels; r++) {
    const s = strips[r], stop = R.int(s.length);
    const col = [];
    for (let k = 0; k < rows; k++) col.push(s[(stop + k) % s.length]);
    grid.push(col);
  }
  return grid;
}

// ---------- evaluation (returns win in "unit" multiples) ----------
function evalLines(cfg, grid, mult = 1) {
  const wins = []; let total = 0;
  const W = cfg.wild;
  const lines = cfg.lines;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let first = null, run = 0;
    for (let r = 0; r < cfg.reels; r++) {
      const s = grid[r][line[r]];
      if (s === '_') break;
      if (first === null) { if (s === cfg.scatter) break; first = s === W ? W : s; run = 1; continue; }
      if (s === cfg.scatter) break;
      if (first === W) { if (s !== W) first = s; run++; }
      else if (s === first || s === W) run++;
      else break;
    }
    if (first === null) continue;
    const sym = first === W ? W : first;
    const pay = (cfg.pays[sym] || {})[run];
    // pure-wild lines pay as wilds; mixed lines pay the symbol they became
    if (pay) { const amt = pay * mult; wins.push({ line: li, sym, run, pay: amt }); total += amt; }
  }
  return { wins, total };
}
function evalClassic(cfg, grid) {
  const center = grid.map(c => c[Math.floor(cfg.rows / 2)]);
  const [a, b, c] = center;
  const P = cfg.pays;
  if (a === b && b === c && P[a] && P[a][3]) return { wins: [{ sym: a, run: 3, pay: P[a][3] }], total: P[a][3], center };
  // fruit rules: cherries from the left
  if (cfg.cherry) {
    const ch = cfg.cherry;
    if (a === ch && b === ch) return { wins: [{ sym: ch, run: 2, pay: P[ch][2] }], total: P[ch][2], center };
    if (a === ch) return { wins: [{ sym: ch, run: 1, pay: P[ch][1] }], total: P[ch][1], center };
  }
  return { wins: [], total: 0, center };
}
function evalWays(cfg, grid, mult = 1) {
  const wins = []; let total = 0;
  const W = cfg.wild;
  const syms = new Set(); for (const col of grid) for (const s of col) if (s !== '_' && s !== W && s !== cfg.scatter) syms.add(s);
  for (const sym of syms) {
    let ways = 1, run = 0;
    for (let r = 0; r < cfg.reels; r++) {
      const n = grid[r].filter(s => s === sym || s === W).length;
      if (!n) break;
      ways *= n; run++;
    }
    const pay = (cfg.pays[sym] || {})[run];
    if (pay && run >= 3) { const amt = pay * ways * mult; wins.push({ sym, run, ways, pay: amt }); total += amt; }
  }
  return { wins, total };
}
function countScatter(cfg, grid) { let n = 0; for (const col of grid) for (const s of col) if (s === cfg.scatter) n++; return n; }

// cluster pays: >= 8 of a symbol anywhere; winners vanish, symbols fall, new ones drop in (cascade)
function playCluster(cfg, strips, free, mult0) {
  const spins = [];
  let grid = spinGrid(cfg, strips), total = 0, mult = mult0;
  let steps = 0;
  for (;;) {
    const counts = {};
    for (const col of grid) for (const s of col) if (s !== '_') counts[s] = (counts[s] || 0) + 1;
    const wins = [];
    for (const [sym, n] of Object.entries(counts)) {
      if (sym === cfg.scatter) continue;
      const tiers = cfg.pays[sym]; if (!tiers) continue;
      let pay = 0; for (const [need, v] of Object.entries(tiers)) if (n >= Number(need)) pay = v;
      if (pay) wins.push({ sym, count: n, pay: pay * mult });
    }
    const stepTotal = wins.reduce((a, w) => a + w.pay, 0);
    spins.push({ grid: grid.map(c => c.slice()), wins, mult, total: stepTotal });
    if (!wins.length || ++steps > 12) break;
    total += stepTotal;
    if (free) mult += 1;                                        // free-spin cascades grow the multiplier
    const gone = new Set(wins.map(w => w.sym));
    grid = grid.map((col, r) => {
      const keep = col.filter(s => !gone.has(s));
      const fresh = [];
      for (let k = keep.length; k < cfg.rows; k++) fresh.push(strips[r][R.int(strips[r].length)]);
      return fresh.concat(keep);
    });
  }
  return { spins, total, mult };
}

// one full paid spin including free spins; returns { rounds:[...], total (in units), fsTriggered }
function playRound(cfg, strips) {
  const rounds = [];
  let total = 0, fsLeft = 0, fsAwarded = 0, fsTotal = 0;
  const step = (free, mult) => {
    if (cfg.mode === 'cluster') {
      const c = playCluster(cfg, strips, free, mult);
      const sc = c.spins[0].grid.flat().filter(s => s === cfg.scatter).length;
      return { grid: c.spins[0].grid, cascade: c.spins, total: c.total, scatters: sc };
    }
    let grid = spinGrid(cfg, strips);
    if (cfg.expandWild && free !== null) {                                    // expanding wilds on reels 2-4
      grid = grid.map((col, r) => (r > 0 && r < cfg.reels - 1 && col.includes(cfg.wild) ? col.map(() => cfg.wild) : col));
    }
    let ev;
    if (cfg.mode === 'classic') ev = evalClassic(cfg, grid);
    else if (cfg.mode === 'ways') ev = evalWays(cfg, grid, mult);
    else ev = evalLines(cfg, grid, mult);
    return { grid, wins: ev.wins, total: ev.total, scatters: countScatter(cfg, grid), center: ev.center };
  };
  const base = step(false, 1);
  rounds.push({ ...base, free: false });
  total += base.total;
  const awarded = scatters => cfg.fs && scatters >= cfg.fs.trigger ? cfg.fs.spins + (scatters - cfg.fs.trigger) * (cfg.fs.extra || 2) : 0;
  const scatterPay = (cfg.scatterPays || {})[base.scatters] || 0;
  if (scatterPay) { total += scatterPay; rounds[0].scatterPay = scatterPay; }
  fsLeft = awarded(base.scatters); fsAwarded = fsLeft;
  while (fsLeft > 0) {
    fsLeft--;
    const s = step(true, cfg.fs.mult || 1);
    rounds.push({ ...s, free: true });
    total += s.total; fsTotal += s.total;
    const more = cfg.fs.retrigger ? awarded(s.scatters) : 0;
    if (more && fsAwarded < 40) { fsLeft += Math.min(more, 8); fsAwarded += Math.min(more, 8); }
  }
  return { rounds, total, fsAwarded, fsTotal };
}

// ---------- tuning helper (Monte Carlo) ----------
function simulate(cfg, n) {
  const strips = buildStrips(cfg);
  let sum = 0, sq = 0, hit = 0, fs = 0;
  for (let i = 0; i < n; i++) { const r = playRound(cfg, strips); const t = r.total / cfg.units; sum += t; sq += t * t; if (r.total > 0) hit++; if (r.fsAwarded) fs++; }
  const mean = sum / n;
  return { rtp: mean, se: Math.sqrt((sq / n - mean * mean) / n), hit: hit / n, fs: fs / n, vol: Math.sqrt(sq / n - mean * mean) };
}

// ---------- game factory ----------
function jackpotRow(id, seed) {
  let row = db.prepare('SELECT * FROM jackpots WHERE id=?').get(id);
  if (!row) { db.prepare('INSERT INTO jackpots(id,amount) VALUES(?,?)').run(id, seed); row = { id, amount: seed }; }
  return row;
}

const scalePays = (pays, f) => Object.fromEntries(Object.entries(pays).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([n, x]) => [n, Math.round(x * f * 100) / 100]))]));

function makeGame(cfg, tuned) {
  const c = { ...cfg, blanks: tuned ? tuned.blanks : cfg.blanks || 0 };
  if (tuned && tuned.payScale && tuned.payScale !== 1) c.pays = scalePays(cfg.pays, tuned.payScale);
  const strips = buildStrips(c);
  const rtp = tuned ? tuned.rtp : c.targetRtp;
  const MAX_UNIT = 200;
  const symInfo = Object.fromEntries(c.symbols.map(s => [s.id, s]));

  const lastRound = st => st && st.last ? st.last : null;
  function view(st) {
    const jp = c.jackpot ? jackpotRow(c.id, c.jackpot.seed) : null;
    return {
      cfg: { id: c.id, reels: c.reels, rows: c.rows, mode: c.mode, units: c.units, lines: c.lines ? c.lines.length : 0, linePatterns: c.lines || null, symbols: c.symbols, wild: c.wild, scatter: c.scatter, theme: c.theme, pays: c.pays, fs: c.fs, jackpot: !!c.jackpot, cherry: c.cherry },
      rtp, maxUnit: MAX_UNIT, last: lastRound(st), jackpot: jp ? jp.amount : null, jackpotLast: jp && jp.last_winner ? { who: jp.last_winner, amount: jp.last_amount, ts: jp.last_ts } : null,
      stats: st && st.stats ? st.stats : { spins: 0, wins: 0 },
    };
  }
  const actions = {
    spin(ctx, body) {
      const unit = ctx.int(body.unit, { min: 1, max: MAX_UNIT, label: 'Bet per unit' });
      const bet = unit * c.units;
      ctx.debit(bet);
      const out = playRound(c, strips);
      let win = Math.floor(out.total * unit);
      const lines = [];
      let jackpotWon = 0;
      if (c.jackpot) {
        const row = jackpotRow(c.id, c.jackpot.seed);
        const contribution = Math.max(1, Math.floor(bet * c.jackpot.rate));
        let pool = row.amount + contribution;
        const center = out.rounds[0].center;
        if (center && center.every(s => s === c.jackpot.symbol) && bet >= c.jackpot.minBet) {
          jackpotWon = pool; pool = c.jackpot.seed;
          db.prepare('UPDATE jackpots SET amount=?, last_winner=?, last_amount=?, last_ts=? WHERE id=?').run(pool, String(ctx.userId), jackpotWon, Date.now(), c.id);
        } else db.prepare('UPDATE jackpots SET amount=? WHERE id=?').run(pool, c.id);
        win += jackpotWon;
      }
      ctx.credit(win);
      const st = ctx.state || { stats: { spins: 0, wins: 0 } }; ctx.state = st;
      st.stats.spins++; if (win > 0) st.stats.wins++;
      const first = out.rounds[0];
      st.last = { rounds: out.rounds.map(r => ({ grid: r.grid, wins: r.wins, total: r.total * unit, free: r.free, cascade: r.cascade ? r.cascade.map(x => ({ grid: x.grid, wins: x.wins, mult: x.mult, total: x.total * unit })) : undefined, scatterPay: r.scatterPay })), unit, bet, win, fs: out.fsAwarded, jackpot: jackpotWon };
      // review
      const items = [];
      for (const r of out.rounds) {
        const tag = r.free ? '🎁 Free spin' : 'Spin';
        const w = (r.cascade ? r.cascade.flatMap(x => x.wins) : r.wins) || [];
        if (w.length) for (const x of w) items.push(an.good(`${tag}: ${x.count ? x.count + '× ' : x.run + '× '}${symInfo[x.sym] ? symInfo[x.sym].name : x.sym}${x.ways ? ` (${x.ways} ways)` : ''} → ${an.fmt(x.pay * unit)}`));
        else if (!r.free) items.push(an.bad('No winning combination.'));
      }
      if (out.fsAwarded) items.push(an.good(`🎁 ${out.fsAwarded} free spins triggered${c.fs.mult > 1 ? ` with a ${c.fs.mult}× multiplier` : ''}${out.fsTotal ? ` — they paid ${an.fmt(out.fsTotal * unit)}` : ''}!`));
      if (jackpotWon) items.push(an.good(`🏆 JACKPOT! You won the progressive pool: ${an.fmt(jackpotWon)} chips!`));
      const info = [
        an.info(`${c.name}: long-run return ${(rtp * 100).toFixed(1)}% (house edge ${((1 - rtp) * 100).toFixed(1)}%). Each spin is independent; the reels have no memory, "hot" or "due" machines don't exist.`),
        an.tip(c.volTip),
        an.tip('A slot has no decisions — the only thing you control is the bet size. Smaller bets make a bankroll last longer for the same entertainment.'),
      ];
      if (c.jackpot) info.push(an.info(`${(c.jackpot.rate * 100).toFixed(0)}% of every bet feeds the shared progressive jackpot. It is paid out when you hit ${symInfo[c.jackpot.symbol].name} ×3 on the payline with a bet of ${c.jackpot.minBet}+ chips. That slice is why the base return is lower.`));
      ctx.end(`${c.name} ${win ? '+' + (win - bet) : '−' + bet}`);
      return an.review(jackpotWon ? 'JACKPOT!' : win > bet * 10 ? 'Big win!' : win > bet ? 'Winner' : win ? 'Small win' : 'No win', win - bet, [['Result', items], ['About this machine', info]]);
    },
  };
  return {
    id: c.id, name: c.name, icon: c.icon, category: 'machine', skill: 'none', blurb: c.blurb, edge: `${((1 - rtp) * 100).toFixed(1)}% (${(rtp * 100).toFixed(1)}% return)`, shared: parallel(8),
    meta: { rules: c.rules, tips: c.tips, options: [] },
    view, actions, _cfg: c, _t: { strips: () => strips, playRound: () => playRound(c, strips) },
  };
}
module.exports = { makeGame, buildStrips, playRound, simulate, scalePays };
