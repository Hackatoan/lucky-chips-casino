// Drives every game through real engine actions with plausible inputs; catches exceptions, bad views, and hidden-info leaks.
const { newUser, play, balance, stmt, games } = require('./harness');
const engine = require('../lib/engine');
const u = newUser(1e9);
const ids = Object.keys(games);
console.log(ids.length, 'games registered');
let failures = 0;
const must = (cond, msg) => { if (!cond) { failures++; console.log('  FAIL', msg); } };
const FORBIDDEN = /"(shoe|deck|seed|minePos|evs|gCards|comm)"\s*:/;            // keys that would leak hidden cards / mines / future outcomes
function check(id, label, r) {
  const j = JSON.stringify(r.view);
  if (FORBIDDEN.test(j)) must(false, `${id}:${label} view leaks a forbidden key: ${j.match(FORBIDDEN)[0]}`);
  if (r.analysis) { must(typeof r.analysis.net === 'number', `${id}:${label} analysis.net`); must(Array.isArray(r.analysis.sections), `${id}:${label} sections`); }
}
async function run(id, steps) {
  const before = balance(u);
  try {
    for (const [label, action, body] of steps) { const r = play(u, id, action, typeof body === 'function' ? body() : body); check(id, label, r); }
    console.log(' ok ', id.padEnd(14), 'Δbalance', balance(u) - before);
  } catch (e) { failures++; console.log(' ERR', id.padEnd(14), e.message); console.log(e.stack.split('\n').slice(1, 3).join('\n')); }
}
const done = r => r.view.phase === 'done' || r.view.phase === 'idle';
(async () => {
  await run('roulette', [['spin', 'spin', { bets: [{ type: 'red', amount: 10 }, { type: 'split', nums: [8, 11], amount: 5 }, { type: 'call', name: 'voisins', amount: 1 }] }]]);
  await run('baccarat', [['deal', 'deal', { bets: { player: 10, banker: 20, tie: 5, pp: 5, dragonP: 5, lucky6: 5, dragon7: 5 } }]]);
  // craps: keep re-placing a pass-line bet whenever the layout clears, then roll a dozen times
  for (let i = 0; i < 12; i++) {
    const v = engine.peek(stmt.userById.get(u.id), 'craps', games.craps).view;
    if (!v.bets.length) play(u, 'craps', 'place', { bets: [{ type: 'pass', amount: 10 }, { type: 'field', amount: 5 }, { type: 'any7', amount: 1 }] });
    else if (v.point) { try { play(u, 'craps', 'place', { bets: [{ type: 'place', num: 6, amount: 12 }, { type: 'hard', num: 8, amount: 1 }, { type: 'come', amount: 5 }] }); } catch (e) {} const p = v.bets.find(b => b.type === 'pass'); if (p && !p.odds) { try { play(u, 'craps', 'odds', { id: p.id, amount: 10 }); } catch (e) { console.log('  odds:', e.message); } } }
    check('craps', 'roll' + i, play(u, 'craps', 'roll', {}));
  }
  console.log(' ok  craps (12 rolls with line, come, place, hardway, odds)');
  await run('sicbo', [['roll', 'roll', { bets: [{ type: 'small', amount: 10 }, { type: 'single', n: 3, amount: 5 }, { type: 'total', n: 10, amount: 5 }, { type: 'combo', a: 1, b: 2, amount: 5 }, { type: 'triple', n: 4, amount: 1 }] }]]);
  await run('chuckaluck', [['roll', 'roll', { bets: [{ type: 'single', n: 2, amount: 10 }] }]]);
  await run('crownanchor', [['roll', 'roll', { bets: [{ type: 'single', n: 1, amount: 10 }, { type: 'single', n: 5, amount: 10 }] }]]);
  await run('sevenup', [['roll', 'roll', { bets: { under: 10, seven: 5 } }]]);
  await run('wheel', [['spin', 'spin', { bets: { 1: 10, 20: 5, JOKER: 2 } }]]);
  await run('dice', [['roll', 'roll', { bet: 10, dir: 'under', target: 50 }], ['roll', 'roll', { bet: 10, dir: 'over', target: 95 }]]);
  await run('keno', [['play', 'play', { bet: 5, picks: [1, 5, 9, 20, 33, 41, 55, 60, 72, 80] }]]);
  await run('plinko', [['drop', 'drop', { bet: 10, rows: 12, risk: 'high', balls: 3 }]]);
  await run('war', [['deal', 'deal', { bet: 10, tie: 2 }], ['resolve', 'war', {}]].slice(0, 1));
  // war may or may not tie: play the follow-up only if it needs it
  { const v = engine.peek(stmt.userById.get(u.id), 'war', games.war).view; if (v.phase === 'warcall') { const r = play(u, 'war', 'war', {}); check('war', 'war', r); console.log(' ok  war follow-up'); } }
  // multi-step games
  await run('hilo', [['start', 'start', { bet: 10 }]]);
  { const v = engine.peek(stmt.userById.get(u.id), 'hilo', games.hilo).view; if (v.phase === 'play') { for (const d of ['higher', 'lower']) { const ok = v.options[d].p > 0; if (ok) { try { play(u, 'hilo', 'guess', { dir: d }); break; } catch (e) {} } } const w = engine.peek(stmt.userById.get(u.id), 'hilo', games.hilo).view; if (w.phase === 'play') try { play(u, 'hilo', 'cashout', {}); } catch (e) { must(/guess/.test(e.message), 'hilo cashout: ' + e.message); } } }
  await run('mines', [['start', 'start', { bet: 10, mines: 5 }], ['pick', 'pick', { index: 0 }]]);
  { const v = engine.peek(stmt.userById.get(u.id), 'mines', games.mines).view; if (v.phase === 'play') { must(!('board' in v) && !('minePos' in v), 'mines hides mine positions mid-round'); try { play(u, 'mines', 'cashout', {}); } catch (e) {} } }
  await run('reddog', [['deal', 'deal', { bet: 10 }]]);
  { const v = engine.peek(stmt.userById.get(u.id), 'reddog', games.reddog).view; if (v.phase === 'raise') play(u, 'reddog', 'play', {}); }
  await run('letitride', [['deal', 'deal', { bet: 10, bonus: 5 }], ['d1', 'ride', {}], ['d2', 'pull', {}]]);
  await run('threecard', [['deal', 'deal', { ante: 10, sides: { pairplus: 5, six: 5 } }]]);
  { const v = engine.peek(stmt.userById.get(u.id), 'threecard', games.threecard).view; if (v.phase === 'decide') play(u, 'threecard', 'play', {}); }
  await run('videopoker', [['deal', 'deal', { bet: 10 }], ['draw', 'draw', { holds: [true, true, false, false, false] }]]);
  { const v = engine.peek(stmt.userById.get(u.id), 'videopoker', games.videopoker).view; if (v.phase === 'collect') { play(u, 'videopoker', 'double', {}); play(u, 'videopoker', 'pick', { index: 1 }); const w = engine.peek(stmt.userById.get(u.id), 'videopoker', games.videopoker).view; if (w.phase === 'gamble-done') { const nx = play(u, 'videopoker', 'next', {}); if (nx.view.phase === 'collect') play(u, 'videopoker', 'collect', {}); } else if (w.phase === 'collect') play(u, 'videopoker', 'collect', {}); } }
  await run('blackjack', [['deal', 'deal', { bet: 10, sides: { pp: 1, t3: 1, rm: 1, ll: 1, bb: 1 } }]]);
  for (let g = 0; g < 8; g++) { const v = engine.peek(stmt.userById.get(u.id), 'blackjack', games.blackjack).view; if (v.phase === 'insurance') play(u, 'blackjack', 'insurance', { take: g % 2 === 0 }); else if (v.phase === 'player') play(u, 'blackjack', 'stand', {}); else break; }
  for (const k of ['classic', 'fruit', 'pharaoh', 'dragon', 'gems', 'bubble', 'jackpot']) await run('slots_' + k, [['spin', 'spin', { unit: 10 }], ['spin', 'spin', { unit: 1 }]]);
  // every game must produce a view when idle, with sane JSON
  for (const id of ids) { const v = engine.peek(stmt.userById.get(u.id), id, games[id]).view; must(v && typeof v === 'object', id + ' idle view'); }
  // catalog sanity
  for (const id of ids) { const g = games[id]; must(g.name && g.icon && g.blurb && g.meta && Array.isArray(g.meta.rules) && g.meta.rules.length, id + ' metadata'); must(g.shared && ['simul', 'parallel'].includes(g.shared.mode), id + ' has a shared-table mode'); if (g.shared.mode === 'simul') must(typeof g.shared.roll === 'function' && typeof g.shared.place === 'function' && typeof g.shared.settle === 'function', id + ' simul hooks'); }
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL GAMES PASSED SMOKE TEST');
  process.exit(failures ? 1 : 0);
})();
