// Lucky Chips Casino — app shell: boot, routing, auth, header, home, lobby, leaderboard, profile & settings.
import { api, state, on, setUser, setBalance, setDemo, shownBalance, refreshUser, loadCatalog, ApiError, maxAffordable } from './api.js';
import { h, clear, fmt, sgn, toast, modal, badge, tabs, store, timeAgo, $ } from './ui.js';
import { sfx } from './sfx.js';
import { applyPrefs, countTo, pulse } from './fx.js';

const root = document.getElementById('app');
let cleanup = [];                     // functions to run when leaving the current page
const onLeave = fn => cleanup.push(fn);
export { onLeave };

const CATS = [['all', 'All games'], ['cards', '🃏 Cards'], ['table', '🎡 Table'], ['dice', '🎲 Dice'], ['machine', '🎰 Machines'], ['arcade', '🕹 Arcade']];
const SKILL = { high: ['Skill game', 'green'], medium: ['Some skill', 'gold'], none: ['Pure luck', ''] };

// ---------- boot ----------
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.update().catch(() => {}))).catch(() => {});   // old workers pick up the self-unregistering sw.js
  try { await loadCatalog(); } catch (e) { root.replaceChildren(h('div', { class: 'boot' }, 'Could not reach the casino. ', h('button', { class: 'btn', onclick: () => location.reload() }, 'Retry'))); return; }
  try { const r = await api('/me'); state.user = r.user; } catch {}
  on('logout', () => { toast('You were signed out.', 'bad'); route(); });
  on('balance', updateBalanceChip);
  on('user', u => { if (u) { sfx.adopt(u.settings); applyPrefs(); } updateBalanceChip(); });
  if (state.user) { sfx.adopt(state.user.settings); applyPrefs(); }
  window.addEventListener('hashchange', route);
  route();
}

// ---------- routing ----------
export function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

async function route() {
  for (const f of cleanup.splice(0)) { try { f(); } catch {} }
  const hash = location.hash.replace(/^#/, '') || '/';
  if (!state.user) return authPage(hash);
  const parts = hash.split('/').filter(Boolean);
  window.scrollTo(0, 0);
  try {
    if (!parts.length) return homePage();
    if (parts[0] === 'lobby') return (await import('./pages.js')).lobbyPage();
    if (parts[0] === 'arena') return (await import('./pages.js')).arenaPage();
    if (parts[0] === 'multi') return (await import('./multiview.js')).multiPage(shell, onLeave);
    if (parts[0] === 'house') return (await import('./pages.js')).housePage();
    if (parts[0] === 'g' && state.byId[parts[1]]) { const gp = await import('./gamepage.js'); return gp.gamePage(parts[1], null, shell, onLeave); }
    if (parts[0] === 't' && parts[1]) { const gp = await import('./gamepage.js'); return gp.tablePage(parts[1].toUpperCase(), parts[2], shell, onLeave); }
    if (parts[0] === 'learn') { const lp = await import('./learn.js'); return lp.learnPage(parts[1], shell); }
    if (parts[0] === 'trainer') { const tp = await import('./trainer.js'); return tp.trainerPage(shell, onLeave); }
    if (parts[0] === 'leaders') return (await import('./pages.js')).leadersPage();
    if (parts[0] === 'me') return (await import('./pages.js')).profilePage();
    location.hash = '#/';
  } catch (e) {
    console.error(e);
    shell(h('div', { class: 'panel', style: { marginTop: '20px' } }, h('h2', null, 'Something went wrong'), h('p', null, e.message || String(e)), h('a', { class: 'btn', href: '#/' }, 'Back to games')), '');
  }
}

// ---------- shell / header ----------
let balChip;
function updateBalanceChip() {
  if (!balChip || !state.user) return;
  const u = state.user;
  const amt = balChip.querySelector('.amt');
  if (amt) {
    const old = Number(amt.textContent.replace(/,/g, '')) || 0, now = shownBalance();
    if (old !== now) { countTo(amt, old, now); pulse(balChip, 'bump', 600); }
  }
  const claim = balChip.querySelector('.claim');
  if (claim) claim.hidden = !u.canClaim;
}

export function shell(content, active) {
  const u = state.user;
  const nav = [['#/', 'Games', '', '🎰'], ['#/lobby', 'Live tables', 'lobby', '👥'], ['#/learn', 'Learn', 'learn', '📖'], ['#/trainer', 'Counting', 'trainer', '🃏'], ['#/leaders', 'Leaders', 'leaders', '🏆']];
  balChip = h('div', { class: 'bal' + (state.demo ? ' demo' : ''), title: state.demo ? 'Demo chips — practice only, never touches your real balance' : 'Your chips (play money — no cash value)' },
    h('span', { class: 'coin' }, state.demo ? '🧪' : '🪙'), h('span', { class: 'amt' }, fmt(shownBalance())),
    state.demo ? h('button', { class: 'btn xs', title: 'Reset demo chips to 10,000', onclick: refillDemo }, '↻') : null,
    h('button', { class: 'btn gold xs claim', hidden: !u.canClaim || state.demo, onclick: claimDaily }, '🎁 Claim ' + fmt(u.daily)));
  const mode = h('div', { class: 'seg mini', role: 'group', 'aria-label': 'Chip mode' },
    h('button', { type: 'button', class: state.demo ? '' : 'on', title: 'Play with your real (play-money) chips', onclick: () => switchMode(false) }, 'Real'),
    h('button', { type: 'button', class: state.demo ? 'on' : '', title: 'Practice with demo chips — nothing is saved or ranked', onclick: () => switchMode(true) }, 'Demo'));
  const top = h('header', { class: 'top' }, h('div', { class: 'top-in' },
    h('a', { class: 'logo', href: '#/' }, '🎰 Lucky ', h('span', null, 'Chips')),
    h('nav', { class: 'nav', 'aria-label': 'Main' }, nav.map(([href, label, key, ico]) => h('a', { href, class: key === active || (!key && !active) ? 'on' : '' }, h('i', { class: 'ni' }, ico), h('span', null, label)))),
    mode, balChip,
    h('button', { class: 'avatar', title: u.display + ' — menu', 'aria-label': 'Account menu', onclick: accountMenu }, (u.display || u.username)[0].toUpperCase())));
  document.body.classList.toggle('demo-mode', state.demo);
  const foot = h('footer', { class: 'foot' },
    h('div', { class: 'foot-in' },
      h('div', null, h('b', null, '🎰 Lucky Chips Casino'), h('div', { class: 'muted small' }, 'Play money only — chips have no cash value and can never be cashed out. For fun and learning. 18+ recommended.')),
      h('div', { class: 'foot-links' },
        h('a', { href: issueUrl('game'), target: '_blank', rel: 'noopener noreferrer' }, '💡 Request a game'),
        h('a', { href: issueUrl('bug'), target: '_blank', rel: 'noopener noreferrer' }, '🐞 Report a bug'),
        h('a', { href: '#/house' }, '🏦 The House'),
        h('a', { href: '#/learn' }, '📖 Learn'),
        state.repo ? h('a', { href: 'https://github.com/' + state.repo, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub') : null),
      h('div', { class: 'foot-links small' }, h('a', { href: '/terms' }, 'Terms'), h('a', { href: '/privacy' }, 'Privacy'), h('a', { href: '/cookies' }, 'Cookies'), h('a', { href: '#', 'data-cookie-settings': '' }, 'Cookie settings'), h('a', { href: '/responsible' }, 'Play-money & responsible play'))));
  root.replaceChildren(top, h('main', { class: 'wrap' }, content), foot);
  if (u.needsVerify) verifyBanner().then(b => { if (b && root.isConnected) root.querySelector('main').prepend(b); }).catch(() => {});
  return root;
}

// GitHub "new issue" links with a prefilled template (no personal data is included)
function issueUrl(kind) {
  const repo = state.repo || 'Hackatoan/lucky-chips-casino';
  const t = kind === 'game'
    ? { title: 'Game request: ', labels: 'game-request', body: '## Game name\n\n## How it plays\n(rules, bets, payouts — links welcome)\n\n## Why it would be fun / what you would want the coach to teach\n\n## Multiplayer?\n(shared outcome like roulette, or everyone plays their own hand?)\n' }
    : { title: 'Bug: ', labels: 'bug', body: '## What happened\n\n## What you expected\n\n## Steps to reproduce\n1. \n\n## Game / table (no personal info please)\n\n## Device & browser\n' };
  return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(t.title)}&labels=${t.labels}&body=${encodeURIComponent(t.body)}`;
}
async function switchMode(demo) {
  if (demo === state.demo) return;
  if (demo && /^#\/t\//.test(location.hash)) { toast('Demo chips are for solo practice. Leave the table first.', 'bad'); return; }
  setDemo(demo); sfx.play('click');
  toast(demo ? '🧪 Demo mode — practice with free chips; nothing is saved or ranked.' : '🪙 Back to your real chips.', 'info');
  route();
}
async function refillDemo() { try { const r = await api('/demo/refill', {}); setUser(r.user); sfx.play('coin'); route(); } catch (e) { toast(e.message, 'bad'); } }

async function claimDaily() {
  try {
    const r = await api('/daily', {});
    setUser(r.user); sfx.play('coin'); setTimeout(() => sfx.play('win', 1), 150);
    toast(`🎁 +${fmt(r.claimed)} free chips — see you tomorrow!`, 'good');
    updateBalanceChip();
    if (location.hash === '' || location.hash === '#/') route();
  } catch (e) { toast(e.message, 'bad'); if (e.data && e.data.user) setUser(e.data.user); }
}

function accountMenu() {
  const u = state.user;
  const m = modal(u.display, h('div', null,
    h('p', { class: 'muted small' }, u.email ? `Signed in as ${u.email}` + (u.provider === 'google.com' ? ' with Google' : '') + '. ' : `Signed in as ${u.username}. `, 'Your public name is what other players see in tables and on the leaderboard.'),
    h('div', { class: 'row' },
      h('a', { class: 'btn', href: '#/me', onclick: () => m.close() }, '📊 Profile & stats'),
      h('button', { class: 'btn', onclick: () => { m.close(); settingsModal(); } }, '⚙ Settings'),
      h('button', { class: 'btn', onclick: () => { sfx.set(!sfx.enabled); saveSetting({ sound: sfx.enabled }); m.close(); toast(sfx.enabled ? '🔊 Sound on' : '🔇 Sound off'); } }, sfx.enabled ? '🔊 Mute' : '🔇 Unmute'),
      h('button', { class: 'btn', onclick: async () => { const on = !(document.documentElement.dataset.anim === 'on'); await saveSetting({ animations: on }); m.close(); toast(on ? '✨ Animations on' : 'Animations off'); } }, document.documentElement.dataset.anim === 'off' ? '✨ Animations on' : '🧘 Animations off'),
      h('button', { class: 'btn red', onclick: async () => { await api('/logout', {}); try { const fm = await import('./fbclient.js'); await fm.signOutFb(); } catch {} state.user = null; m.close(); route(); } }, 'Sign out'))));
}

export async function saveSetting(patch) {
  try { const r = await api('/settings', patch); setUser(r.user); return r.user; } catch (e) { toast(e.message, 'bad'); return null; }
}

// ---------- settings modal (coach, sound, hand fee) ----------
export function settingsModal() {
  const u = state.user;
  const s = u.settings || {};
  const fee = u.fee || { mode: 'pct', value: 0 };
  const L = u.feeLimits;
  const box = h('div');
  const tog = (label, key, def, help) => h('label', { class: 'row', style: { margin: '8px 0', cursor: 'pointer' } },
    h('input', { type: 'checkbox', checked: s[key] === undefined ? def : s[key], style: { width: 'auto' }, onchange: async e => { if (key === 'sound') sfx.set(e.target.checked); await saveSetting({ [key]: e.target.checked }); } }),
    h('span', null, label, help ? h('div', { class: 'muted small' }, help) : null));
  const feeVal = h('b', null);
  const feeMode = h('select', { 'aria-label': 'Fee type', onchange: () => { range.min = L[feeMode.value].min; range.max = L[feeMode.value].max; range.step = L[feeMode.value].step; range.value = 0; upd(); } },
    h('option', { value: 'pct', selected: fee.mode === 'pct' }, '% of every wager'), h('option', { value: 'flat', selected: fee.mode === 'flat' }, 'flat chips per hand'));
  const range = h('input', { type: 'range', min: L[fee.mode].min, max: L[fee.mode].max, step: L[fee.mode].step, value: fee.value, disabled: u.feeLocked, style: { padding: 0 } });
  const note = h('p', { class: 'muted small' });
  const upd = () => {
    const mode = feeMode.value, v = Number(range.value);
    feeVal.textContent = mode === 'pct' ? v + '%' : v + ' chips/hand';
    note.textContent = v === 0 ? 'No hand fee: you only face each game\'s own built-in house edge.'
      : mode === 'pct' ? `Every wager is charged an extra ${v}% up front, so the effective house edge is about ${v} points higher than the game's own (e.g. blackjack ≈ ${(0.5 + v).toFixed(1)}%, roulette ≈ ${(2.7 + v).toFixed(1)}%).`
      : `Each hand costs a flat ${v} chips on top of your bet (like a poker-room rake or a "seat fee"). It hits small bets hardest: on a 10-chip bet that's a ${(v / 10 * 100).toFixed(0)}% edge; on 100 chips ${(v).toFixed(0)}%.`;
  };
  range.addEventListener('input', upd);
  upd();
  box.append(
    h('h3', null, 'Coach'),
    tog('Show the live coach tips', 'coach', true, 'Tells you the best move and why — turn off to test yourself.'),
    tog('Show the Hi-Lo card count in blackjack', 'showCount', true, 'Running count, decks left and true count.'),
    tog('Jump to the review after each round', 'autoReview', true),
    tog('Show table chat', 'chat', true, 'Hide chat on every table (public, private and gallery) — you can still play and watch.'),
    h('h3', { style: { marginTop: '18px' } }, 'Look & sound'),
    tog('Animations', 'animations', !matchMedia('(prefers-reduced-motion: reduce)').matches, 'Smooth card, chip and result effects. Turn off for a calm, static table (also helps older devices).'),
    tog('Celebrations (confetti & floating win amounts)', 'celebrate', true),
    tog('Sound effects', 'sound', true, 'Chips, cards, dice, wheel and win/lose jingles.'),
    h('label', { class: 'f', style: { marginTop: '8px' } }, h('span', null, 'Volume'),
      h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(sfx.volume * 100), style: { padding: 0 }, oninput: e => sfx.setVolume(e.target.value / 100), onchange: async e => { sfx.play('chip'); await saveSetting({ volume: Number(e.target.value) }); } })),
    h('h3', { style: { marginTop: '18px' } }, 'House edge: hand fee'),
    h('p', { class: 'muted small' }, 'A second way to tune the house edge besides each game\'s rule options (which you can change on every game page). Casinos use commissions and seat fees; here you can too.'),
    u.feeLocked ? h('p', { class: 'badge gold' }, 'Locked by the casino operator') : null,
    h('div', { class: 'row' }, feeMode, feeVal), range, note,
    h('button', { class: 'btn gold', disabled: u.feeLocked, onclick: async () => { const r = await saveSetting({ fee: { mode: feeMode.value, value: Number(range.value) } }); if (r) { toast('Table settings saved', 'good'); } } }, 'Save hand fee'));
  modal('Table settings', box);
}

// ---------- auth: Google, email + password (Firebase), and legacy username accounts ----------
const G_LOGO = () => { const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 48 48'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
  for (const [d, f] of [['M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z', '#EA4335'], ['M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.9z', '#4285F4'], ['M10.5 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.2z', '#FBBC05'], ['M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.2-8.8 2.2-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z', '#34A853']]) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); p.setAttribute('fill', f); svg.append(p); }
  return svg; };

async function authPage(returnHash) {
  let cfg = { firebase: null, local: true };
  try { cfg = await api('/config'); } catch {}
  let fbc = null;
  const useFb = !!cfg.firebase;
  let mode = 'login';
  const msg = h('p', { class: 'lose small', role: 'alert', style: { minHeight: '1.2em' } });
  const info = h('p', { class: 'small gold' });
  const email = h('input', { type: 'text', autocomplete: 'username', maxlength: 120, required: true, 'aria-label': useFb ? 'Email or username' : 'Username' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', required: true, maxlength: 200, 'aria-label': 'Password' });
  const display = h('input', { type: 'text', maxlength: 20, placeholder: 'Shown to other players', 'aria-label': 'Public name' });
  const emailLbl = h('span', null), dispRow = h('label', { class: 'f', hidden: true }, h('span', null, 'Public name (shown at tables, in chat and on leaderboards)'), display);
  const submit = h('button', { class: 'btn gold big', style: { width: '100%' }, type: 'submit' }, 'Sign in');
  const forgot = h('button', { class: 'linkbtn', type: 'button', onclick: async () => {
    const e = email.value.trim(); if (!/@/.test(e)) { msg.textContent = 'Type your email address above first, then press “Forgot password”.'; return; }
    try { fbc = fbc || await loadFb(); await fbc.resetPassword(e); msg.textContent = ''; info.textContent = `📧 If ${e} has an account, a reset link is on its way.`; } catch (err) { msg.textContent = fbc ? fbc.friendly(err) : err.message; }
  } }, 'Forgot password?');
  const seg = h('div', { class: 'seg' }, h('button', { type: 'button', class: 'on', onclick: () => setMode('login') }, 'Sign in'), h('button', { type: 'button', onclick: () => setMode('register') }, 'Create account'));
  async function loadFb() { const m = await import('./fbclient.js'); await m.ready(cfg.firebase); return m; }
  function setMode(m) {
    mode = m; msg.textContent = ''; info.textContent = '';
    [...seg.children].forEach((b, i) => b.classList.toggle('on', (i === 0) === (m === 'login')));
    dispRow.hidden = m === 'login'; forgot.hidden = m !== 'login' || !useFb;
    emailLbl.textContent = m === 'login' ? (useFb ? 'Email (or username for older accounts)' : 'Username') : (useFb ? 'Email address' : 'Username (private — used to sign in)');
    email.type = m === 'register' && useFb ? 'email' : 'text';
    submit.textContent = m === 'login' ? 'Sign in' : (useFb ? 'Create account' : 'Create account — get 1,000 free chips');
    pass.autocomplete = m === 'login' ? 'current-password' : 'new-password';
  }
  // exchange a Firebase ID token for our session; ask for a public name when the account is new
  async function finish(idToken, wantedDisplay) {
    let r;
    const again = async (data, why) => { const name = await askName(data.suggestion, why); if (!name) return null; return finish(idToken, name); };
    try { r = await api('/auth/firebase', { idToken, display: wantedDisplay || undefined }); }
    catch (e) { if (e.data && e.data.needsDisplay) return again(e.data, e.message); throw e; }
    if (r.needsDisplay) return again(r, r.error);
    state.user = r.user; sfx.play('coin');
    if (r.created && r.welcome) toast('🎉 Welcome! 1,000 free chips are in your account.', 'good', 5000);
    else if (r.created) toast('📧 Account created — verify your email to unlock your 1,000 free chips.', 'good', 7000);
    else if (r.welcome) toast('✅ Email verified — 1,000 free chips added!', 'good', 5000);
    if (!returnHash || returnHash === '/') location.hash = '#/'; else route();
  }
  function askName(suggestion, why) {
    return new Promise(resolve => {
      const input = h('input', { type: 'text', maxlength: 20, value: suggestion || '', 'aria-label': 'Public name' }); const err = h('p', { class: 'lose small' }, why && !/Choose a public name/.test(why) ? why : '');
      let done = false; const m = modal('Pick your public name', h('form', { onsubmit: e => { e.preventDefault(); done = true; m.close(); resolve(input.value.trim()); } },
        h('p', { class: 'muted small' }, 'This is what other players see at tables, in chat and on leaderboards. 3–20 letters, numbers, spaces or underscores. You can change it later.'), input, err, h('div', { class: 'actions' }, h('button', { class: 'btn gold', type: 'submit' }, 'Continue'))), { onClose: () => { if (!done) resolve(null); } });
      setTimeout(() => input.select(), 50);
    });
  }
  const form = h('form', { onsubmit: async e => {
    e.preventDefault(); msg.textContent = ''; info.textContent = ''; submit.disabled = true;
    try {
      const who = email.value.trim();
      if (useFb && /@/.test(who)) {
        fbc = fbc || await loadFb();
        const idToken = mode === 'login' ? await fbc.emailSignIn(who, pass.value) : await fbc.emailSignUp(who, pass.value);
        await finish(idToken, mode === 'register' ? display.value.trim() : undefined);
      } else {
        if (mode === 'register' && useFb) { msg.textContent = 'Use your email address to create an account.'; return; }
        const body = { username: who, password: pass.value }; if (mode === 'register' && display.value.trim()) body.display = display.value.trim();
        const r = await api(mode === 'login' ? '/login' : '/register', body);
        state.user = r.user; sfx.play('coin'); if (r.welcome) toast('🎉 Welcome! 1,000 free chips are in your account.', 'good', 5000);
        if (!returnHash || returnHash === '/') location.hash = '#/'; else route();
      }
    } catch (err) { msg.textContent = fbc && err.code ? fbc.friendly(err) : err.message; sfx.play('error'); } finally { submit.disabled = false; }
  } }, h('label', { class: 'f' }, emailLbl, email), h('label', { class: 'f' }, h('span', null, 'Password'), pass), dispRow, msg, info, submit, h('div', { class: 'center', style: { marginTop: '8px' } }, forgot));
  const googleBtn = useFb ? h('button', { class: 'btn gbtn', type: 'button', onclick: async e => {
    msg.textContent = ''; const b = e.currentTarget; b.disabled = true;
    try { fbc = fbc || await loadFb(); const t = await fbc.google(); await finish(t); } catch (err) { msg.textContent = fbc ? fbc.friendly(err) : err.message; sfx.play('error'); } finally { b.disabled = false; }
  } }, G_LOGO(), 'Continue with Google') : null;
  setMode('login');
  root.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'panel' },
    h('h1', null, '🎰 Lucky Chips'),
    h('p', { class: 'center muted' }, 'A play-money casino. 1,000 free chips every day, 25+ games, and a coach that explains every move.'),
    returnHash.startsWith('/t/') ? h('p', { class: 'badge gold', style: { display: 'block', textAlign: 'center', margin: '0 0 12px' } }, '🔗 Sign in to join your friend\'s table') : null,
    googleBtn, useFb ? h('div', { class: 'or' }, h('span', null, 'or with email')) : null, seg, form,
    h('p', { class: 'disc' }, 'Chips have no cash value and can never be cashed out. For entertainment and learning only. You must be 18+. By continuing you agree to the ', h('a', { href: '/terms', target: '_blank' }, 'Terms'), ' and ', h('a', { href: '/privacy', target: '_blank' }, 'Privacy Policy'), '.'))));
}

// banner for email accounts that haven't verified yet (chips unlock on verification)
async function verifyBanner() {
  const u = state.user; if (!u || !u.needsVerify) return null;
  const m = await import('./fbclient.js');
  return h('div', { class: 'verify-banner' }, h('span', null, `📧 Verify ${u.email || 'your email'} to unlock your ${fmt(u.daily)} free chips — we sent you a link.`),
    h('button', { class: 'btn xs', onclick: async () => { try { await (await loadMod(m)).resendVerification(); toast('Verification email sent again.', 'good'); } catch (e) { toast(m.friendly ? m.friendly(e) : e.message, 'bad'); } } }, 'Resend email'),
    h('button', { class: 'btn xs gold', onclick: async () => { try { const mm = await loadMod(m); const t = await mm.freshToken(); const r = await api('/auth/firebase', { idToken: t }); setUser(r.user); if (r.welcome) { sfx.play('coin'); toast('✅ Verified — 1,000 free chips added!', 'good', 5000); } else toast('Not verified yet — click the link in the email first.', 'info', 5000); route(); } catch (e) { toast(m.friendly ? m.friendly(e) : e.message, 'bad', 6000); } } }, 'I\'ve verified'));
}
async function loadMod(m) { const cfg = await api('/config'); await m.ready(cfg.firebase); return m; }

// ---------- home ----------
const ROWS = [
  ['cards', '🃏 Card games', 'Beat the dealer — and learn the odds as you play'],
  ['table', '🎡 Wheel & table games', 'Spin it, bet it'],
  ['dice', '🎲 Dice games', 'Craps, Sic Bo and friends'],
  ['arcade', '🕹 Arcade', 'Quick rounds where you set the house edge'],
  ['machine', '🎰 Slot machines', 'Reels, ways, cascades and a shared jackpot'],
];
function gameTile(g, o = {}) {
  const sk = SKILL[g.skill] || SKILL.none;
  return h('a', { class: 'tile cat-' + g.category, href: '#/g/' + g.id, draggable: 'false' },
    h('div', { class: 'tile-art' }, h('span', { class: 'ico' }, g.icon), g.shared ? h('span', { class: 'multi', title: 'Play with friends or at public tables' }, '👥') : null),
    h('div', { class: 'tile-body' }, h('h3', null, g.name), h('p', null, g.blurb),
      h('div', { class: 'meta' }, badge('Edge ' + g.edge, ''), badge(sk[0], sk[1]))));
}
// horizontally scrolling row with arrows (desktop) and swipe (touch)
function rail(title, sub, tiles, extra) {
  const scroller = h('div', { class: 'rail', tabindex: '0' }, tiles);
  const go = dir => scroller.scrollBy({ left: dir * Math.max(260, scroller.clientWidth * 0.85), behavior: 'smooth' });
  const left = h('button', { class: 'rail-btn left', type: 'button', 'aria-label': 'Scroll left', onclick: () => { sfx.play('click'); go(-1); } }, '‹');
  const right = h('button', { class: 'rail-btn right', type: 'button', 'aria-label': 'Scroll right', onclick: () => { sfx.play('click'); go(1); } }, '›');
  const edge = () => { left.hidden = scroller.scrollLeft < 8; right.hidden = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 8; };
  scroller.addEventListener('scroll', edge, { passive: true });
  setTimeout(edge, 0); window.addEventListener('resize', edge);
  onLeave(() => window.removeEventListener('resize', edge));
  return h('section', { class: 'rail-sec' },
    h('div', { class: 'sec-title' }, h('div', null, h('h2', null, title), sub ? h('div', { class: 'muted small' }, sub) : null), extra || h('span', { class: 'muted small' }, tiles.length + ' games')),
    h('div', { class: 'rail-wrap' }, left, scroller, right));
}
function joinCodeBox() {
  const input = h('input', { type: 'text', maxlength: 9, placeholder: 'Table code', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Table code', style: { textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 800, maxWidth: '170px' } });
  const go2 = e => { e && e.preventDefault(); const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length !== 6) { toast('Table codes are 6 characters, like K7QM4X.', 'bad'); return; } sfx.play('join'); location.hash = '#/t/' + code; };
  return h('form', { class: 'row joincode', onsubmit: go2 }, h('span', { class: 'muted small' }, 'Have a code?'), input, h('button', { class: 'btn green', type: 'submit' }, 'Join table'));
}

async function homePage() {
  const u = state.user;
  let q = '';
  const body = h('div');
  const draw = () => {
    clear(body);
    if (q) {
      const list = state.games.filter(g => (g.name + ' ' + g.blurb + ' ' + g.category).toLowerCase().includes(q));
      body.append(h('div', { class: 'sec-title' }, h('h2', null, `Results for “${q}”`), h('span', { class: 'muted small' }, list.length + ' games')),
        list.length ? h('div', { class: 'grid' }, list.map(g => gameTile(g))) : h('p', { class: 'muted' }, 'No games match that search.'));
      return;
    }
    const recent = (u.recent || []).filter(r => state.byId[r.game]);
    if (recent.length) body.append(rail('▶ Continue playing', 'Pick up where you left off', recent.map(r => {
      const g = state.byId[r.game];
      return h('a', { class: 'tile cont cat-' + g.category + (r.inProgress ? ' pulse' : ''), href: '#/g/' + g.id },
        h('div', { class: 'tile-art' }, h('span', { class: 'ico' }, g.icon)),
        h('div', { class: 'tile-body' }, h('h3', null, g.name), h('div', { class: 'muted small' }, r.inProgress ? '● Hand in progress' : timeAgo(r.ts)),
          r.rounds ? h('div', { class: 'small ' + (r.net >= 0 ? 'win' : 'lose') }, `${sgn(r.net)} over ${r.rounds} round${r.rounds > 1 ? 's' : ''}`) : null,
          h('span', { class: 'btn gold sm', style: { marginTop: '6px' } }, r.inProgress ? 'Resume' : 'Play')));
    }), h('span', null)));
    const multi = state.games.filter(g => g.shared);
    body.append(rail('👥 Play with others', 'Quick-join a public table, or invite friends with a private link', multi.map(g => h('div', { class: 'tile tile-multi cat-' + g.category },
      h('div', { class: 'tile-art' }, h('span', { class: 'ico' }, g.icon)),
      h('div', { class: 'tile-body' }, h('h3', null, g.name), h('div', { class: 'muted small' }, g.shared.mode === 'simul' ? 'Shared outcome' : g.shared.mode === 'rounds' ? 'One shared dealer' : g.shared.mode === 'poker' ? 'Player vs player · practise vs bots' : 'Everyone plays their own hand'),
        h('div', { class: 'row', style: { marginTop: '8px', gap: '6px' } }, h('button', { class: 'btn gold sm', onclick: () => quickPlay(g.id) }, '⚡ Quick join'), h('button', { class: 'btn sm', onclick: () => privateTable(g.id) }, '🔗 Private'))))), joinCodeBox()));
    for (const [cat, title, sub] of ROWS) {
      const list = state.games.filter(g => g.category === cat);
      if (list.length) body.append(rail(title, sub, list.map(g => gameTile(g))));
    }
  };
  const search = h('input', { type: 'search', placeholder: '🔍 Search games…', 'aria-label': 'Search games', class: 'search', oninput: e => { q = e.target.value.trim().toLowerCase(); draw(); } });
  const banner = h('div', { class: 'banner' },
    h('div', null,
      h('h2', null, `Welcome back, ${u.display}!`),
      h('div', { class: 'muted' }, state.demo ? '🧪 Demo mode: practise with free demo chips. Nothing here is saved to your stats, ranking or balance.' : u.canClaim ? 'Your free daily chips are waiting.' : 'Free chips refresh daily — come back tomorrow for another ' + fmt(u.daily) + '.')),
    h('div', { class: 'row' }, search, !state.demo && u.canClaim ? h('button', { class: 'btn gold big', onclick: claimDaily }, '🎁 Claim ' + fmt(u.daily) + ' chips') : (!state.demo ? h('div', { class: 'badge gold' }, '✔ Daily chips claimed') : null)));
  draw();
  shell(h('div', null, banner, body), '');
}

export async function quickPlay(gameId) {
  try {
    const r = await api('/lobby/quick', { game: gameId });
    if (r.queued) { const pg = await import('./pages.js'); return pg.queueModal(gameId, r.queued); }
    sfx.play('join'); go('#/t/' + r.table.code);
  } catch (e) { toast(e.message, 'bad'); }
}
export async function privateTable(gameId) { const pg = await import('./pages.js'); pg.privateTableModal(gameId); }

boot();
