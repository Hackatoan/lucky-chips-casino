const { newUser, stmt } = require('./harness');
const tables = require('../lib/tables'), bots = require('../lib/bots');
(async () => {
  const u = newUser(1000); stmt.setDisplay.run('Watcher', 0, u.id);
  const row = () => stmt.userById.get(u.id);
  const arena = bots.listArena();
  console.log('arena tables:', arena.length, '| all paused initially:', arena.every(a => !a.live));
  const bj = tables.get(arena.find(a => a.game === 'blackjack').code), rl = tables.get(arena.find(a => a.game === 'roulette').code);
  for (const t of [bj, rl]) { try { tables.join(t, row()); console.log('FAIL joined bot table'); } catch (e) { console.log('join blocked:', e.message.slice(0, 50)); } try { tables.tableQueueJoin(t, row()); console.log('FAIL queued'); } catch (e) { console.log('queue blocked:', e.message.slice(0, 40)); } }
  tables.watch(bj, row()); tables.watch(rl, row());
  await new Promise(r => setTimeout(r, 14000));
  console.log('blackjack bots seated:', [...bj.players.values()].map(p => p.name).join(', '), '| feed entries:', bj.feed.length, '| latest:', bj.feed.slice(-1)[0] && bj.feed.slice(-1)[0].headline);
  console.log('roulette round', rl.round, 'history', rl.history.length, 'bots staked', [...rl.players.values()].map(p => p.staked).join(','));
  console.log('real stats untouched:', stmt.statsAll.all(row().id).length === 0, '| house ledger rows:', require('../lib/db').db.prepare('SELECT COUNT(*) n FROM house').get().n);
  // pause when nobody is watching
  tables.unwatch(bj, row()); tables.unwatch(rl, row());
  await new Promise(r => setTimeout(r, 24000));
  console.log('paused after viewers left:', !bj.botAwake && !rl.botAwake);
  const f1 = bj.feed.length; await new Promise(r => setTimeout(r, 4000)); console.log('no new bot activity while paused:', bj.feed.length === f1);
  process.exit(0);
})();
