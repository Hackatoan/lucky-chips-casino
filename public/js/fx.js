// Visual effects layer. Everything here is cosmetic and honours the user's "animations" setting
// (default: on, unless the OS asks for reduced motion).
import { state } from './api.js';

const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
export function settings() { return (state.user && state.user.settings) || {}; }
export function animOn() { const s = settings(); return s.animations === undefined ? !mq.matches : !!s.animations; }
export function celebrateOn() { const s = settings(); return animOn() && s.celebrate !== false; }

// applied whenever the user object changes
export function applyPrefs() {
  document.documentElement.dataset.anim = animOn() ? 'on' : 'off';
}

// restart a CSS animation class on an element
export function pulse(el, cls, ms = 900) {
  if (!el || !animOn()) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
// react to a finished round: tone = 'win' | 'lose' | 'push'
export function stageReact(stage, tone, big) {
  pulse(stage, 'fx-' + tone, 1100);
  if (tone === 'win' && big) pulse(stage, 'fx-bigwin', 1600);
}
// floating number that drifts upward from an element (or screen centre)
export function floatText(text, tone, anchor) {
  if (!animOn()) return;
  const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2 - 40, top: innerHeight / 2, width: 80 };
  const el = document.createElement('div');
  el.className = 'float-txt ' + tone;
  el.textContent = text;
  el.style.left = Math.max(8, Math.min(innerWidth - 120, r.left + r.width / 2 - 40)) + 'px';
  el.style.top = Math.max(60, r.top) + 'px';
  document.body.append(el);
  setTimeout(() => el.remove(), 1700);
}
const COLORS = ['#f2c14e', '#e0483f', '#3fcf8e', '#5aa9ff', '#fff', '#d68cff'];
export function confetti(level = 1) {
  if (!celebrateOn()) return;
  const n = level >= 3 ? 150 : level === 2 ? 80 : 36;
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.setProperty('--x', (Math.random() * 100).toFixed(1) + 'vw');
    p.style.setProperty('--dx', ((Math.random() - 0.5) * 30).toFixed(1) + 'vw');
    p.style.setProperty('--d', (1.6 + Math.random() * 1.6).toFixed(2) + 's');
    p.style.setProperty('--r', Math.round(Math.random() * 720 - 360) + 'deg');
    p.style.background = COLORS[i % COLORS.length];
    p.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 4200);
}
// tween a number inside an element
export function countTo(el, from, to, ms = 700) {
  const fmt = n => Math.round(n).toLocaleString('en-US');
  if (!animOn() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}
// round-finished convenience used by every game page
export function roundFx(stage, analysis, anchor) {
  if (!analysis) return;
  const net = analysis.net;
  const tone = net > 0 ? 'win' : net < 0 ? 'lose' : 'push';
  const big = net >= 500;
  stageReact(stage, tone, big);
  if (net !== 0) floatText((net > 0 ? '+' : '−') + Math.abs(net).toLocaleString('en-US'), tone, anchor || stage);
  if (net >= 5000) confetti(3); else if (big) confetti(2); else if (net >= 100) confetti(1);
}
