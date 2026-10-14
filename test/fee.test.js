const { newUser, play, balance, stmt } = require('./harness');
const u = newUser(10000);
stmt.setSettings.run(JSON.stringify({ fee: { mode: 'pct', value: 5 } }), u.id);
let b0 = balance(u);
const r = play(u, 'roulette', 'spin', { bets: [{ type: 'red', amount: 100 }] });
console.log('pct fee: balance delta', balance(u) - b0, 'net in review', r.analysis.net, 'fee', r.analysis.fees, r.analysis.sections.map(s => s.title).join('|'));
stmt.setSettings.run(JSON.stringify({ fee: { mode: 'flat', value: 7 } }), u.id);
b0 = balance(u);
const r2 = play(u, 'roulette', 'spin', { bets: [{ type: 'red', amount: 100 }] });
console.log('flat fee: delta', balance(u) - b0, 'net', r2.analysis.net, 'fee', r2.analysis.fees);
const u2 = newUser(100);
stmt.setSettings.run(JSON.stringify({ fee: { mode: 'pct', value: 10 } }), u2.id);
try { play(u2, 'roulette', 'spin', { bets: [{ type: 'red', amount: 100 }] }); console.log('FAIL'); } catch (e) { console.log('all-in rejected:', e.message, '| balance still', balance(u2)); }
