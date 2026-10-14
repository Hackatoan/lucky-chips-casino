const { newUser, play, balance, stmt } = require('./harness');
const setRules = (u, r) => stmt.setSettings.run(JSON.stringify({ rules: { roulette: r } }), u.id);
const u = newUser(1e9);
for (const [wheel, partage, label] of [['eu', false, 'EU'], ['am', false, 'AM'], ['eu', true, 'EU+partage']]) {
  setRules(u, { wheel, partage: partage ? 'on' : 'off' });
  const start = balance(u);
  let staked = 0;
  const N = 40000;
  for (let i = 0; i < N; i++) {
    const bets = [{ type: 'red', amount: 10 }, { type: 'straight', nums: [17], amount: 10 }, { type: 'dozen', k: 2, amount: 10 }];
    play(u, 'roulette', 'spin', { bets }); staked += 30;
  }
  const rtp = 1 + (balance(u) - start) / staked;
  console.log(label, 'RTP', (rtp * 100).toFixed(2) + '%');
}
const r = play(u, 'roulette', 'spin', { wheel: 'eu', bets: [{ type: 'call', name: 'voisins', amount: 1 }, { type: 'split', nums: [8, 11], amount: 5 }, { type: 'corner', nums: [1, 2, 4, 5], amount: 5 }, { type: 'sixline', nums: [1, 2, 3, 4, 5, 6], amount: 5 }] });
console.log(r.analysis.headline, r.analysis.sections.map(s => s.title));
for (const bad of [{ type: 'split', nums: [1, 5], amount: 5 }, { type: 'corner', nums: [3, 4, 6, 7], amount: 5 }, { type: 'straight', nums: [40], amount: 5 }, { type: 'red', amount: 0 }]) {
  try { play(u, 'roulette', 'spin', { bets: [bad] }); console.log('FAIL accepted', bad); } catch (e) { console.log('rejected ok:', e.message.slice(0, 50)); }
}
