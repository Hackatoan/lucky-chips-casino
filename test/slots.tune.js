// Calibrates every slot machine: pads the reel strips with blanks until the Monte-Carlo return matches the target.
const fs = require('node:fs'), path = require('node:path');
const kit = require('../lib/slotkit'), defs = require('../games/slotdefs');
const only = process.argv[2];
const out = path.join(__dirname, '..', 'games', 'slots.tuned.json');
let tuned = {}; try { tuned = JSON.parse(fs.readFileSync(out, 'utf8')); } catch {}
const N_SEARCH = Number(process.env.N_SEARCH || 150000), N_FINAL = Number(process.env.N_FINAL || 1500000);
for (const [key, cfg] of Object.entries(defs)) {
  if (only && key !== only) continue;
  const t0 = Date.now();
  let lo = 0, hi = 120, best = 0;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const r = kit.simulate({ ...cfg, blanks: mid }, N_SEARCH);
    if (r.rtp > cfg.targetRtp) lo = mid + 1; else hi = mid;
  }
  best = lo;
  // final high-sample check at best and best-1
  const cand = [Math.max(0, best - 1), best].map(b => ({ b, r: kit.simulate({ ...cfg, blanks: b }, N_FINAL) }));
  const pick = cand.sort((a, b) => Math.abs(a.r.rtp - cfg.targetRtp) - Math.abs(b.r.rtp - cfg.targetRtp))[0];
  // fine-tune: scale all pays so the return lands on target (returns are linear in the paytable)
  const payScale = Math.max(0.6, Math.min(1.6, cfg.targetRtp / pick.r.rtp));
  const scaled = { ...cfg, blanks: pick.b, pays: kit.scalePays(cfg.pays, payScale) };
  const fin = kit.simulate(scaled, N_FINAL);
  tuned[key] = { blanks: pick.b, payScale: +payScale.toFixed(4), rtp: +fin.rtp.toFixed(4), se: +fin.se.toFixed(4), hit: +fin.hit.toFixed(3), fs: +fin.fs.toFixed(4), vol: +fin.vol.toFixed(2) };
  console.log(key.padEnd(8), JSON.stringify(tuned[key]), `target ${cfg.targetRtp}`, `${Math.round((Date.now() - t0) / 1000)}s`);
  fs.writeFileSync(out, JSON.stringify(tuned, null, 2));
}
