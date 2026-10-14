// Quick regression suite (≈1 min). Long statistical simulations live in test/*.sim.js and `npm run test:sims`.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const quick = ['smoke.test.js', 'tables.full.test.js', 'firebase.test.js', 'http.test.js', 'fee.test.js'];
const sims = ['roulette.test.js', 'blackjack.test.js', 'threecard.sim.js', 'baccarat.sides.js', 'bots.test.js'];
const list = process.argv.includes('--sims') ? sims : quick;
let failed = 0;
for (const f of list) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 240000, env: { ...process.env, FIREBASE_DISABLED: process.env.FIREBASE_DISABLED } });
  const out = (r.stdout || '') + (r.stderr || '');
  const bad = r.status !== 0 || /\bFAIL\b|FAILURE|\bERR\b/.test(out);
  if (bad) failed++;
  console.log(`${bad ? '✘' : '✔'} ${f.padEnd(24)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (bad) console.log(out.split('\n').filter(l => /FAIL|ERR|Error|FAILURE/.test(l)).slice(0, 8).map(l => '    ' + l).join('\n'));
}
console.log(failed ? `\n${failed} suite(s) failed` : '\nAll suites passed');
process.exit(failed ? 1 : 0);
