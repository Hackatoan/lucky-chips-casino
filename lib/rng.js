'use strict';
// All randomness in the casino goes through here.
//  - Default: crypto.randomInt (CSPRNG).
//  - Shared-table rounds run inside `seeded(seed, ctx, fn)`: an HMAC-SHA256 stream keyed by a seed whose
//    SHA-256 hash was published BEFORE bets were placed. After the round the seed is revealed so anyone can
//    check (a) hash(seed) == commitment and (b) replay the same draws.
const crypto = require('node:crypto');

let src = null;       // active deterministic stream, or null for the CSPRNG

class Stream {
  constructor(seed, label) { this.key = Buffer.from(seed, 'hex'); this.label = label; this.counter = 0; this.buf = Buffer.alloc(0); this.pos = 0; this.draws = []; }
  _more() {
    const mac = crypto.createHmac('sha256', this.key).update(`${this.label}:${this.counter++}`).digest();
    this.buf = mac; this.pos = 0;
  }
  u32() {
    if (this.pos + 4 > this.buf.length) this._more();
    const v = this.buf.readUInt32BE(this.pos); this.pos += 4; return v;
  }
  int(n) {                                   // unbiased: rejection sampling on 32-bit values
    const limit = 0x100000000 - (0x100000000 % n);
    let x; do { x = this.u32(); } while (x >= limit);
    const r = x % n; if (this.draws.length < 64) this.draws.push([n, r]); return r;
  }
}

const int = n => (src ? src.int(n) : crypto.randomInt(n));
const range = (a, b) => a + int(b - a + 1);
const die = () => int(6) + 1;
const pick = arr => arr[int(arr.length)];
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = int(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function weighted(weights) {
  let total = 0;
  for (const w of weights) total += w;
  let r = int(total);
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
  return weights.length - 1;
}
const float = () => (src ? src.int(2 ** 30) / 2 ** 30 : crypto.randomInt(2 ** 48) / 2 ** 48);

// run fn with a deterministic stream; returns { value, draws }
function seeded(seed, label, fn) {
  const prev = src;
  src = new Stream(seed, label);
  try { const value = fn(); return { value, draws: src.draws }; }
  finally { src = prev; }
}
const newSeed = () => crypto.randomBytes(32).toString('hex');
const commit = seed => crypto.createHash('sha256').update(Buffer.from(seed, 'hex')).digest('hex');

module.exports = { int, range, die, pick, shuffle, weighted, float, seeded, newSeed, commit, Stream };
