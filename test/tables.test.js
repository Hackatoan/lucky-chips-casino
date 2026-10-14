const { newUser, play, balance, stmt, games } = require('./harness');
const engine = require('../lib/engine');
const tables = require('../lib/tables');
const a = newUser(1000), b = newUser(1000), c = newUser(1000);
for (const u of [a, b, c]) { u.display = 'P' + u.id; stmt.setDisplay.run('P' + u.id, 0, u.id); }
const get = u => stmt.userById.get(u.id);
(async () => {
  const t = tables.quickJoin(get(a), 'roulette');
  const t2 = tables.quickJoin(get(b), 'roulette');
  console.log('same public table:', t.code === t2.code, 'players', t.players.size);
  tables.join(t, get(c));
  tables.place(t, get(a), { bets: [{ type: 'red', amount: 100 }] });
  console.log('a escrowed ->', balance(a));
  try { engine.run(get(a), 'roulette', games.roulette, 'spin', { bets: [{ type: 'red', amount: 5 }] }); console.log('FAIL solo allowed'); } catch (e) { console.log('solo blocked:', e.message.slice(0, 40)); }
  tables.unplace(t, get(a)); console.log('a refunded ->', balance(a));
  tables.place(t, get(a), { bets: [{ type: 'black', amount: 100 }] });
  tables.place(t, get(b), { bets: [{ type: 'straight', nums: [7], amount: 10 }] });
  tables.ready(t, get(c));
  await new Promise(r => setTimeout(r, 1000));
  console.log('phase', t.phase, 'outcome', t.outcome, 'a', balance(a), 'b', balance(b));
  const sum = balance(a) + balance(b) + balance(c); console.log('chips conserved-ish (house wins/loses):', sum);
  tables.chat(t, get(a), 'gl everyone!'); 
  try { tables.chat(t, get(b), 'f u c k'); } catch (e) { console.log('chat blocked:', e.message); }
  console.log(t.chat.slice(-3).map(m => m.text));
  console.log('recovered escrow:', tables.recoverEscrow());
  process.exit(0);
})();
