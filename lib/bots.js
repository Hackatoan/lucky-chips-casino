'use strict';
// Bot arena: one always-on table per game where house bots play forever. Bots use DEMO chips (no stats, ledger or ratings)
// and follow each game's own coach recommendation, so viewers see correct strategy. Everything pauses when nobody is watching.
const { stmt } = require('./db');
const engine = require('./engine');
const tablesLib = require('./tables');
const R = require('./rng');
const games = require('../games');

const NAMES = ['🤖 Ace', '🤖 Luna', '🤖 Rex', '🤖 Zoe', '🤖 Milo', '🤖 Nova'];
const IDLE_PAUSE_MS = 20000;
const now = () => Date.now();
const pick = a => a[R.int(a.length)];
const arena = new Map();          // game -> table

function botRow(i) {
  const username = 'bot_' + i;
  let row = stmt.botByName.get(username);
  if (!row) { stmt.insertBot.run(username, NAMES[i], now()); row = stmt.botByName.get(username); }
  if (row.demo_balance < 20000) { stmt.setDemo.run(1000000, row.id); row = stmt.userById.get(row.id); }
  return row;
}

// ---------- policies ----------
const D = ['deal', 'done', 'idle'];
const fresh = v => v.phase === 'idle' || v.phase === 'done' || v.phase === undefined;
const PARALLEL = {
  blackjack: v => {
    if (fresh(v)) return ['deal', { bet: pick([10, 20, 20, 50]), sides: {} }, 3500];
    if (v.phase === 'insurance') return ['insurance', { take: false }, 1500];
    if (v.phase === 'player') return [({ H: 'hit', S: 'stand', D: 'double', P: 'split', R: 'surrender' })[v.coach && v.coach.best] || 'stand', {}, 1800];
    return null;
  },
  videopoker: v => {
    if (fresh(v)) return ['deal', { bet: pick([5, 10, 25]) }, 3500];
    if (v.phase === 'draw') { const m = v.coach ? v.coach.best : 0; return ['draw', { holds: [0, 1, 2, 3, 4].map(i => !!(m >> i & 1)) }, 2200]; }
    if (v.phase === 'collect') return [R.int(100) < 15 && v.ups < 2 ? 'double' : 'collect', {}, 1800];
    if (v.phase === 'gamble') return ['pick', { index: R.int(4) }, 1500];
    if (v.phase === 'gamble-done') return ['next', {}, 1500];
    return null;
  },
  threecard: v => fresh(v) ? ['deal', { ante: pick([10, 20]), sides: R.int(3) === 0 ? { pairplus: 5 } : {} }, 3500] : v.phase === 'decide' ? [v.coach && v.coach.best === 'fold' ? 'fold' : 'play', {}, 2200] : null,
  letitride: v => fresh(v) ? ['deal', { bet: pick([5, 10]) }, 3500] : (v.phase === 'd1' || v.phase === 'd2') ? [v.coach && v.coach.best === 'pull' ? 'pull' : 'ride', {}, 2200] : null,
  war: v => fresh(v) ? ['deal', { bet: pick([10, 20]) }, 3000] : v.phase === 'warcall' ? ['war', {}, 2000] : null,
  reddog: v => fresh(v) ? ['deal', { bet: pick([10, 20]) }, 3000] : v.phase === 'raise' ? [v.coach && v.coach.best === 'raise' ? 'raise' : 'play', {}, 2200] : null,
  dice: v => ['roll', { bet: pick([5, 10, 20]), dir: pick(['under', 'over']), target: pick([20, 35, 50, 65, 80]) }, 2800],
  hilo: v => {
    if (fresh(v)) return ['start', { bet: pick([5, 10, 20]) }, 3200];
    if (v.phase === 'play') {
      if (v.streak >= 2 + R.int(2)) return ['cashout', {}, 2000];
      const o = v.options; return ['guess', { dir: o.higher.p >= o.lower.p ? 'higher' : 'lower' }, 1800];
    }
    return null;
  },
  keno: v => ['play', { bet: pick([2, 5, 10]), picks: Array.from(new Set(Array.from({ length: 7 }, () => 1 + R.int(80)))) }, 3500],
  plinko: v => ['drop', { bet: pick([5, 10]), rows: pick([8, 12, 16]), risk: pick(['low', 'medium', 'high']), balls: 1 + R.int(2) }, 3500],
  mines: v => {
    if (fresh(v)) return ['start', { bet: pick([5, 10]), mines: pick([3, 5]) }, 3200];
    if (v.phase === 'play') {
      if (v.safe >= 3 + R.int(2)) return ['cashout', {}, 1800];
      const free = Array.from({ length: 25 }, (_, i) => i).filter(i => !v.picks.includes(i));
      return ['pick', { index: pick(free) }, 1500];
    }
    return null;
  },
};
for (const k of ['classic', 'fruit', 'pharaoh', 'dragon', 'gems', 'bubble', 'jackpot']) PARALLEL['slots_' + k] = () => ['spin', { unit: pick([1, 2, 5]) }, 3800];

const SIMUL = {
  roulette: () => ({ bets: [pick([{ type: 'red', amount: 10 }, { type: 'black', amount: 10 }, { type: 'odd', amount: 10 }, { type: 'even', amount: 10 }, { type: 'dozen', k: 1 + R.int(3), amount: 10 }]),
    ...(R.int(2) ? [{ type: 'straight', nums: [R.int(37)], amount: 2 }] : [])] }),
  baccarat: () => ({ bets: { [pick(['banker', 'banker', 'player'])]: 20, ...(R.int(4) === 0 ? { tie: 2 } : {}) } }),
  sicbo: () => ({ bets: [pick([{ type: 'small' }, { type: 'big' }, { type: 'single', n: 1 + R.int(6) }, { type: 'total', n: 7 + R.int(5) }]) ].map(b => ({ ...b, amount: 10 })) }),
  chuckaluck: () => ({ bets: [{ type: 'single', n: 1 + R.int(6), amount: 10 }] }),
  crownanchor: () => ({ bets: [{ type: 'single', n: 1 + R.int(6), amount: 10 }, { type: 'single', n: 1 + R.int(6), amount: 5 }].filter((b, i, a) => a.findIndex(x => x.n === b.n) === i) }),
  sevenup: () => ({ bets: { [pick(['under', 'over', 'seven'])]: 10 } }),
  wheel: () => ({ bets: { [pick(['1', '2', '5', '1'])]: 10 } }),
};
const crapsPlan = p => {                       // returns bets to add this round (or null to just roll)
  const st = engine.peek(stmt.userById.get(p.uid), 'craps', games.craps, { demo: true }).view;
  if (!st.bets.length) return st.point ? { bets: [{ type: 'place', num: pick([6, 8]), amount: 12 }, { type: 'come', amount: 10 }] } : { bets: [{ type: 'pass', amount: 10 }, ...(R.int(3) === 0 ? [{ type: 'field', amount: 5 }] : [])] };
  const pass = st.bets.find(b => b.type === 'pass' && !b.odds && st.point);
  if (pass) return { odds: { id: pass.id, amount: Math.min(pass.amount * 3, 30) } };
  return null;
};

// ---------- table management ----------
function ensure(game) {
  let t = arena.get(game);
  if (t && tablesLib.tables.get(t.code)) return t;
  const mod = games[game];
  t = tablesLib.create({ game, user: null, isPublic: true, bot: true, secs: 14 });
  t.botAwake = false; t.lastViewer = 0; t.botN = mod.shared.mode === 'simul' ? 4 : 3;
  arena.set(game, t);
  return t;
}
function seatBots(t) {
  if (t.botsSeated) return;
  for (let i = 0; i < t.botN; i++) {
    const row = botRow((i + arena.size + t.code.charCodeAt(0)) % NAMES.length);
    try { tablesLib.join(t, { ...row, is_bot: 1 }); } catch {}
  }
  const bots = [...t.players.values()].filter(p => p.bot);
  bots.forEach((p, i) => { p.nextAt = now() + 800 + i * 900; });
  t.botsSeated = true;
}
function wake(t) {
  t.lastViewer = now();
  if (!t.botAwake) { t.botAwake = true; seatBots(t); }
}
tablesLib.hooks.wake = wake;

function viewerCount(t) { let n = 0; for (const v of t.viewers.values()) if (v.online > 0 || now() - v.lastSeen < 8000) n++; return n; }

function listArena() {
  return tablesLib.sharedGames().map(g => {
    const t = ensure(g.id);
    return { game: g.id, name: g.name, icon: g.icon, category: g.category, code: t.code, mode: g.shared.mode, watching: viewerCount(t), live: !!t.botAwake, round: t.round };
  });
}

// ---------- driver ----------
function stepParallel(t, p) {
  const bot = stmt.userById.get(p.uid);
  const opts = { demo: true, rules: t.rules, fee: { mode: 'pct', value: 0 } };
  const v = engine.peek(bot, t.game, t.mod, opts).view;
  const plan = (PARALLEL[t.game] || (() => null))(v);
  if (!plan) { p.nextAt = now() + 2000; return; }
  const [action, body, wait] = plan;
  try {
    const out = engine.run(bot, t.game, t.mod, action, body, opts);
    tablesLib.notifyPlay({ ...bot, is_bot: 1 }, t.game, { view: out.view, analysis: out.analysis });
    p.nextAt = now() + wait + R.int(1500) + (out.analysis ? 2500 : 0);
  } catch (e) { p.nextAt = now() + 4000; }
}
function stepSimul(t, p) {
  if (t.phase !== 'betting') return;
  const bot = { ...stmt.userById.get(p.uid), is_bot: 1 };
  try {
    if (!p.staked && !p.active) {
      if (t.game === 'craps') { const plan = crapsPlan(p); if (plan) tablesLib.place(t, bot, plan); else if (!p.ready) tablesLib.ready(t, bot); }
      else { tablesLib.place(t, bot, SIMUL[t.game]()); }
    }
    if (t.sh.repeat) { if (!p.ready) tablesLib.ready(t, bot); }
    else if (!p.ready) tablesLib.ready(t, bot);
  } catch (e) { p.nextAt = now() + 5000; return; }
}
function tick() {
  const ts = now();
  for (const t of arena.values()) {
    if (!tablesLib.tables.get(t.code)) { arena.delete(t.game); continue; }
    if (viewerCount(t) > 0) t.lastViewer = ts;
    if (t.botAwake && ts - t.lastViewer > IDLE_PAUSE_MS) { t.botAwake = false; continue; }     // nobody watching: stop spending CPU
    if (!t.botAwake) continue;
    for (const p of [...t.players.values()]) {
      if (!p.bot || ts < (p.nextAt || 0)) continue;
      if (t.sh.mode === 'parallel') stepParallel(t, p);
      else { p.nextAt = ts + 700 + R.int(1800); stepSimul(t, p); }
    }
  }
}
setInterval(tick, 1000).unref();

module.exports = { listArena, ensure, wake, arena };
