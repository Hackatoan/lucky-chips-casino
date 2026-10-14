// Synthesised casino sound effects (Web Audio API) — no audio files needed.
let ac = null, master = null, enabled = true, vol = 0.55, quiet = false;
try { enabled = localStorage.getItem('lc.sound') !== '0'; const v = localStorage.getItem('lc.vol'); if (v !== null) vol = Math.min(1, Math.max(0, Number(v))); } catch {}

function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = vol; master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
let noiseBuf = null;
function noiseBuffer(c) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function tone(freq, dur, { type = 'sine', v = 0.18, at = 0, slide = 0, attack = 0.005 } = {}) {
  const c = ctx(); if (!c || !enabled) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { v = 0.2, at = 0, lo = 0, hi = 0, f = 0, q = 1, attack = 0.002 } = {}) {
  const c = ctx(); if (!c || !enabled) return;
  const t = c.currentTime + at;
  const s = c.createBufferSource(); s.buffer = noiseBuffer(c);
  let node = s;
  if (f) { const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; node.connect(b); node = b; }
  if (hi) { const b = c.createBiquadFilter(); b.type = 'highpass'; b.frequency.value = hi; node.connect(b); node = b; }
  if (lo) { const b = c.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = lo; node.connect(b); node = b; }
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  node.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
}

const S = {
  click() { tone(880, 0.04, { type: 'triangle', v: 0.07 }); },
  tick() { tone(1400, 0.025, { type: 'square', v: 0.04 }); },
  chip() {
    noise(0.05, { f: 4200, q: 2, v: 0.35 });
    tone(2400, 0.07, { type: 'triangle', v: 0.08, at: 0.004 });
    noise(0.04, { f: 5200, q: 3, v: 0.25, at: 0.045 });
  },
  chips() { for (let i = 0; i < 4; i++) { noise(0.045, { f: 3600 + i * 400, q: 2, v: 0.3, at: i * 0.055 }); tone(2000 + i * 150, 0.05, { type: 'triangle', v: 0.05, at: i * 0.055 }); } },
  card() { noise(0.09, { lo: 3800, hi: 700, v: 0.32 }); noise(0.03, { hi: 3000, v: 0.12, at: 0.01 }); },
  flip() { noise(0.06, { lo: 5200, hi: 1200, v: 0.26 }); tone(500, 0.04, { type: 'triangle', v: 0.04 }); },
  shuffle() { for (let i = 0; i < 14; i++) noise(0.07, { lo: 3500, hi: 500, v: 0.22, at: i * 0.045 + Math.random() * 0.02 }); },
  dice(n = 9) {
    for (let i = 0; i < n; i++) {
      const at = Math.pow(i / n, 1.6) * 0.85;
      noise(0.045, { f: 900 + Math.random() * 1400, q: 4, v: 0.3 * (1 - i / (n + 2)) + 0.05, at });
      tone(260 + Math.random() * 240, 0.05, { type: 'triangle', v: 0.05, at });
    }
  },
  ball(ms = 3000) {      // roulette ball ticking as it slows
    let t = 0, gap = 0.035;
    while (t < ms / 1000) {
      tone(1700 + Math.random() * 300, 0.02, { type: 'square', v: 0.035, at: t });
      noise(0.012, { hi: 4000, v: 0.08, at: t });
      t += gap; gap *= 1.07;
    }
    tone(180, 0.18, { type: 'sine', v: 0.2, at: t + 0.02, slide: -60 });
  },
  reel() { for (let i = 0; i < 6; i++) { noise(0.03, { f: 1800, q: 3, v: 0.12, at: i * 0.045 }); } },
  stop() { tone(190, 0.12, { type: 'triangle', v: 0.25, slide: -80 }); noise(0.05, { lo: 1200, v: 0.2 }); },
  coin() { tone(1568, 0.09, { type: 'sine', v: 0.14 }); tone(2093, 0.22, { type: 'sine', v: 0.14, at: 0.07 }); },
  win(level = 1) {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
    const n = Math.min(notes.length, 3 + level);
    for (let i = 0; i < n; i++) { tone(notes[i], 0.22, { type: 'triangle', v: 0.14, at: i * 0.075 }); tone(notes[i] * 2, 0.12, { type: 'sine', v: 0.05, at: i * 0.075 }); }
    if (level >= 2) for (let i = 0; i < 6; i++) tone(1800 + (i % 3) * 400, 0.1, { type: 'sine', v: 0.07, at: 0.35 + i * 0.07 });
  },
  jackpot() {
    S.win(3);
    for (let i = 0; i < 14; i++) { tone(1568 + (i % 4) * 330, 0.12, { type: 'sine', v: 0.09, at: 0.5 + i * 0.075 }); noise(0.04, { f: 5000, q: 3, v: 0.12, at: 0.5 + i * 0.075 }); }
  },
  lose() { tone(247, 0.25, { type: 'sawtooth', v: 0.07, slide: -60 }); tone(185, 0.38, { type: 'sawtooth', v: 0.07, at: 0.18, slide: -50 }); },
  push() { tone(440, 0.18, { type: 'triangle', v: 0.1 }); tone(440, 0.18, { type: 'triangle', v: 0.1, at: 0.14 }); },
  bust() { tone(300, 0.35, { type: 'sawtooth', v: 0.09, slide: -200 }); noise(0.2, { lo: 600, v: 0.15 }); },
  error() { tone(150, 0.16, { type: 'square', v: 0.07 }); },
  join() { tone(660, 0.08, { type: 'sine', v: 0.1 }); tone(880, 0.12, { type: 'sine', v: 0.1, at: 0.07 }); },
  msg() { tone(1200, 0.05, { type: 'sine', v: 0.06 }); },
  bell() { tone(1318, 0.5, { type: 'sine', v: 0.12 }); tone(1975, 0.45, { type: 'sine', v: 0.06 }); },
  pop() { tone(500, 0.06, { type: 'sine', v: 0.1, slide: 500 }); },
  whoosh() { noise(0.35, { lo: 2500, hi: 300, v: 0.15, attack: 0.18 }); },
  explode() { noise(0.5, { lo: 900, v: 0.5 }); tone(90, 0.5, { type: 'sine', v: 0.3, slide: -50 }); },
  gem() { tone(1320, 0.1, { type: 'sine', v: 0.12 }); tone(1760, 0.18, { type: 'sine', v: 0.12, at: 0.06 }); },
};

export const sfx = {
  play(name, ...a) { try { if (enabled && !quiet && S[name]) S[name](...a); } catch {} },
  get quiet() { return quiet; },
  set quiet(v) { quiet = !!v; },
  // outcome-driven sound for a finished round
  outcome(a) {
    if (!a) return;
    const big = a.net >= 500, huge = a.net >= 5000;
    if (a.net > 0) return huge ? S.jackpot() : S.win(big ? 2 : 1);
    if (a.net < 0) return S.lose();
    S.push();
  },
  get enabled() { return enabled; },
  set(on) { enabled = !!on; try { localStorage.setItem('lc.sound', on ? '1' : '0'); } catch {} if (on) { ctx(); S.pop(); } },
  unlock() { ctx(); },
  get volume() { return vol; },
  setVolume(v) { vol = Math.min(1, Math.max(0, v)); try { localStorage.setItem('lc.vol', String(vol)); } catch {} if (master) master.gain.value = vol; },
  // adopt the account's saved preferences (they follow you across devices)
  adopt(s) {
    if (!s) return;
    if (typeof s.sound === 'boolean') { enabled = s.sound; try { localStorage.setItem('lc.sound', s.sound ? '1' : '0'); } catch {} }
    if (typeof s.volume === 'number') { vol = Math.min(1, Math.max(0, s.volume / 100)); if (master) master.gain.value = vol; }
  },
};
// browsers need a user gesture before audio can start
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, () => ctx(), { once: true, passive: true });
