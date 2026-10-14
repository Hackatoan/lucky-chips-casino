// Original lounge / "elevator" music, synthesised from scratch (no samples, no copyrighted material): electric piano, upright-ish bass,
// soft pad, a sparse vibraphone melody and brushes, with a small reverb. Usage: node generate.js out.wav [passes]
// Every pass of the 16-bar form is varied (seeded), so the loop doesn't feel repetitive.
const fs = require('node:fs');
const SR = 44100, BPM = 74, BEAT = 60 / BPM, PASSES = Number(process.argv[3] || 7);
const N = Math.floor(SR * BEAT * 4 * 16 * PASSES + SR * 4);
const L = new Float32Array(N), R = new Float32Array(N), SL = new Float32Array(N), SR_ = new Float32Array(N);     // dry L/R + reverb send L/R
let seed = 20261014; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hz = m => 440 * 2 ** ((m - 69) / 12);
const add = (t0, dur, fn, pan = 0, send = 0.25, gain = 1) => {
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n && i0 + i < N; i++) { const v = fn(i / SR, i); L[i0 + i] += v * gl; R[i0 + i] += v * gr; SL[i0 + i] += v * gl * send; SR_[i0 + i] += v * gr * send; }
};
// ---- instruments ----
const epiano = (m, vel) => { const f = hz(m); return t => { const env = Math.exp(-t * 2.1) * (1 - Math.exp(-t * 400)); const idx = 1.6 * Math.exp(-t * 4.5) + 0.25; const tine = 0.05 * Math.exp(-t * 18) * Math.sin(2 * Math.PI * f * 7 * t); return vel * (env * Math.sin(2 * Math.PI * f * t + idx * Math.sin(2 * Math.PI * f * t)) + tine); }; };
const vibes = (m, vel) => { const f = hz(m); return t => vel * Math.exp(-t * 1.6) * (1 - Math.exp(-t * 300)) * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 6)) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 5.2 * t)); };
const bass = (m, vel) => { const f = hz(m); return t => vel * Math.exp(-t * 1.9) * (1 - Math.exp(-t * 120)) * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t * 3)); };
const pad = (m, dur, vel) => { const f = hz(m), d = [0.997, 1, 1.003]; return t => { const a = Math.min(1, t / 1.1) * Math.min(1, Math.max(0, (dur - t) / 1.4)); let v = 0; for (const k of d) for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * f * k * h * t + h) / (h * h); return vel * a * v / 3; }; };
let nz = 0; const noise = () => (rnd() * 2 - 1);
const brush = (vel, dur) => { let lp = 0; return t => { lp += (noise() - lp) * 0.12; return vel * lp * Math.exp(-t / dur); }; };
const hat = vel => { let lp = 0, s2 = 0; return t => { const x = noise(); const hp = x - lp; lp += (x - lp) * 0.35; s2 += (hp - s2) * 0.5; return vel * s2 * Math.exp(-t * 55); }; };
// ---- the form: 16 bars in C major, ii-V-I-vi turnaround, then F / Em / Am / D9 / G13 ----
const CH = [  // [root(bass midi), voicing (rootless, midi), scale degrees for melody]
  [36, [64, 67, 71, 74], 'C'], [33, [60, 64, 67, 71], 'Am'], [38, [60, 65, 69, 72], 'Dm'], [43, [59, 62, 65, 69], 'G'],
  [36, [64, 67, 71, 74], 'C'], [33, [60, 64, 67, 71], 'Am'], [38, [60, 65, 69, 72], 'Dm'], [43, [59, 62, 65, 69], 'G'],
  [41, [64, 67, 72, 76], 'F'], [40, [62, 67, 71, 74], 'Em'], [33, [60, 64, 67, 71], 'Am'], [38, [60, 66, 69, 72], 'D'],
  [43, [59, 62, 65, 69], 'G'], [43, [59, 64, 65, 69], 'G'], [36, [64, 67, 71, 74], 'C'], [36, [64, 67, 71, 74], 'C'],
];
const PENT = [60, 62, 64, 67, 69, 72, 74, 76, 79];
for (let p = 0; p < PASSES; p++) for (let bar = 0; bar < 16; bar++) {
  const t0 = (p * 16 + bar) * 4 * BEAT, [root, voic, name] = CH[bar];
  const sw = d => (d % 1 === 0.5 ? 0.17 * BEAT : 0);                                  // swing the off-beats
  // pad (whole bar)
  for (const m of voic.slice(0, 3)) add(t0, 4 * BEAT + 0.4, pad(m - 12, 4 * BEAT + 0.4, 0.05), (rnd() - .5) * 0.8, 0.5);
  // electric piano comping: beat 1, the & of 2, sometimes beat 4
  const hits = [[0, 0.9], [1.5, 0.7]]; if (rnd() < 0.45) hits.push([3, 0.6]); if (p % 2 === 1 && rnd() < 0.5) hits.push([2.5, 0.55]);
  for (const [b, v] of hits) { const ts = t0 + (b + (b % 1 ? 0.17 : 0)) * BEAT; voic.forEach((m, i) => add(ts + i * (0.012 + rnd() * 0.012), 2.6, epiano(m, 0.085 * v * (0.85 + rnd() * 0.3)), -0.25 + i * 0.17, 0.35)); }
  // bass: root on 1, fifth/octave on 3
  add(t0, 1.6, bass(root, 0.30), 0, 0.05); add(t0 + 2 * BEAT, 1.4, bass(root + (rnd() < 0.5 ? 7 : 12), 0.22), 0, 0.05);
  if (rnd() < 0.35) add(t0 + 3.5 * BEAT, 0.8, bass(root + 2, 0.15), 0, 0.05);
  // sparse vibraphone melody
  let last = PENT[Math.floor(rnd() * PENT.length)];
  for (let b = 0; b < 8; b++) if (rnd() < (bar % 4 === 3 ? 0.28 : 0.4)) { last = PENT[Math.max(0, Math.min(PENT.length - 1, PENT.indexOf(last) + Math.floor(rnd() * 5) - 2))]; add(t0 + (b / 2) * BEAT + sw(b / 2), 2.4, vibes(last + (p % 3 === 2 ? 12 : 0), 0.07 + rnd() * 0.03), 0.3 + (rnd() - .5) * 0.3, 0.45); }
  // brushes + hats
  for (const b of [1, 3]) add(t0 + b * BEAT, 0.3, brush(0.05, 0.09), 0.1, 0.2);
  for (let k = 0; k < 8; k++) add(t0 + (k / 2) * BEAT + sw(k / 2), 0.08, hat(k % 2 ? 0.006 : 0.009), -0.2, 0.1);
}
// ---- Schroeder reverb on the send bus, mixed back in ----
const comb = (x, d, g) => { const o = new Float32Array(x.length), b = new Float32Array(d); let k = 0; for (let i = 0; i < x.length; i++) { const y = x[i] + b[k] * g; b[k] = y; o[i] = b[k]; k = (k + 1) % d; } return o; };
const allp = (x, d, g) => { const o = new Float32Array(x.length), b = new Float32Array(d); let k = 0; for (let i = 0; i < x.length; i++) { const bo = b[k]; const y = x[i] - g * bo; b[k] = x[i] + g * bo; o[i] = y; k = (k + 1) % d; } return o; };
const verb = (x, off) => { let acc = new Float32Array(x.length); for (const d of [1557, 1617, 1491, 1422].map(v => v + off)) { const c = comb(x, d, 0.83); for (let i = 0; i < acc.length; i++) acc[i] += c[i] * 0.25; } return allp(allp(acc, 225 + off, 0.5), 556 + off, 0.5); };
const WL = verb(SL, 0), WR = verb(SR_, 23);
let peak = 0; const out = new Float32Array(N * 2);
for (let i = 0; i < N; i++) { const l = L[i] + WL[i] * 0.55, r = R[i] + WR[i] * 0.55; out[2 * i] = Math.tanh(l * 1.3); out[2 * i + 1] = Math.tanh(r * 1.3); peak = Math.max(peak, Math.abs(out[2 * i]), Math.abs(out[2 * i + 1])); }
const g = 0.8 / peak, fade = SR * 2;
const buf = Buffer.alloc(44 + out.length * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + out.length * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(out.length * 2, 40);
for (let i = 0; i < out.length; i++) { const fi = Math.floor(i / 2); const f = Math.min(1, fi / fade, (N - fi) / fade); buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(out[i] * g * f * 32767))), 44 + i * 2); }
fs.writeFileSync(process.argv[2] || 'music.wav', buf);
console.log('wrote', process.argv[2] || 'music.wav', (N / SR / 60).toFixed(1) + ' min');
