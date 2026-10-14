// Card counting trainer (Hi-Lo): flash cards, deck runs, true count, bet sizing and index-play drills. Pure practice — no chips.
import { api } from './api.js';
import { h, clear, card, btn, store, fmt, sleep, tabs } from './ui.js';
import { sfx } from './sfx.js';

const hilo = r => (r <= 4 ? 1 : r <= 7 ? 0 : -1);
const RANKS = '23456789TJQKA', SUITS = 'SHDC';
const rndCard = () => RANKS[Math.floor(Math.random() * 13)] + SUITS[Math.floor(Math.random() * 4)];
const rankIdx = c => RANKS.indexOf(c[0]);
function deck() { const d = []; for (const r of RANKS) for (const s of SUITS) d.push(r + s); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }
const stats = () => store.get('trainer.stats', { best: {}, drills: 0, correct: 0 });
const addStat = ok => { const s = stats(); s.drills++; if (ok) s.correct++; store.set('trainer.stats', s); };

export async function trainerPage(shell, onLeave) {
  const chart = await api('/learn/bj-chart');
  const timers = []; onLeave(() => timers.forEach(clearInterval));
  // ---- configurable keybinds (stored per browser) ----
  const KEYDEFS = {
    plus: { label: 'Flash cards: +1', def: ['1', '+', 'ArrowUp'] }, zero: { label: 'Flash cards: 0', def: ['0', 'ArrowRight'] }, minus: { label: 'Flash cards: −1', def: ['-', 'ArrowDown'] },
    start: { label: 'Deck run: start / stop', def: ['s'] }, yes: { label: 'Index plays: Yes', def: ['y'] }, no: { label: 'Index plays: No', def: ['n'] },
  };
  const binds = () => ({ ...Object.fromEntries(Object.entries(KEYDEFS).map(([k, d]) => [k, d.def])), ...store.get('trainer.keys', {}) });
  const keyName = k => ({ ' ': 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[k] || (k.length === 1 ? k.toUpperCase() : k));
  const H = {};                                      // drills register their key actions here
  let curTab = 'flash', capturing = null, drawKeys = () => {};
  const pane = (title, desc, node) => h('div', null, h('p', { class: 'muted' }, desc), node);

  // ---------- 1. flash cards (instant feedback) ----------
  const flash = (() => {
    let rc = 0, streak = 0, best = store.get('trainer.flashBest', 0), cur = null;
    const out = h('div'), msg = h('div', { class: 'banner-result' }), stat = h('div', { class: 'hud' });
    const next = () => { cur = rndCard(); out.replaceChildren(h('div', { class: 'cards', style: { minHeight: 0 } }, card(cur, { delay: 0 }))); sfx.play('card'); upd(); };
    const upd = () => stat.replaceChildren(...[['Streak', streak], ['Best', best], ['Accuracy', stats().drills ? Math.round(stats().correct / stats().drills * 100) + '%' : '—']].map(([l, v]) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, l))));
    const answer = v => { const ok = v === hilo(rankIdx(cur)); addStat(ok); if (ok) { streak++; if (streak > best) { best = streak; store.set('trainer.flashBest', best); } msg.className = 'banner-result win'; msg.textContent = '✔ Correct'; sfx.play('tick'); } else { streak = 0; msg.className = 'banner-result lose'; msg.textContent = `✘ ${cur[0] === 'T' ? '10' : cur[0]} counts ${hilo(rankIdx(cur)) > 0 ? '+1' : hilo(rankIdx(cur)) < 0 ? '−1' : '0'}`; sfx.play('error'); } next(); };
    H.flash = answer;
    setTimeout(next, 0);
    return pane('Flash cards', 'A card appears — tag it +1, 0 or −1 as fast as you can. Keys are configurable (⌨ Keybinds). Aim for a streak of 50 before moving on.', h('div', { class: 'felt', style: { minHeight: 0 } }, stat, h('div', { class: 'center', style: { minHeight: '130px' } }, out), msg,
      h('div', { class: 'actions' }, btn('+1  (2–6)', 'green big', () => answer(1)), btn('0  (7–9)', 'big', () => answer(0)), btn('−1  (10–A)', 'red big', () => answer(-1)))));
  })();

  // ---------- 2. count the deck / flash run ----------
  const run = (() => {
    const speed = h('input', { type: 'range', min: 250, max: 2000, step: 50, value: store.get('trainer.speed', 900), style: { padding: 0 } });
    const per = h('select', null, [1, 2, 3].map(n => h('option', { value: n }, n + ' card' + (n > 1 ? 's' : '') + ' at a time')));
    const out = h('div', { class: 'cards', style: { minHeight: '100px', justifyContent: 'center' } }), msg = h('div', { class: 'banner-result' }), ans = h('input', { type: 'number', placeholder: 'Final running count', style: { maxWidth: '200px' }, 'aria-label': 'Final running count' });
    const ctl = h('div', { class: 'actions' }); let rc = 0, running = false, token = 0;
    const abort = () => { if (!running) return; token++; running = false; out.replaceChildren(); msg.textContent = ''; ctl.replaceChildren(btn('Start a deck run', 'gold big', start)); };
    H.runStart = () => (running && ctl.querySelector('.muted') ? abort() : running ? null : start()); H.runAbort = abort;
    const start = async () => {
      if (running) return; running = true; const my = ++token; const d = deck(), n = Number(per.value); rc = 0; msg.textContent = ''; ctl.replaceChildren(h('span', { class: 'muted' }, 'Counting…'), btn('Stop', 'sm', abort)); store.set('trainer.speed', speed.value);
      const t0 = Date.now();
      for (let i = 0; i < d.length; i += n) { const grp = d.slice(i, i + n); grp.forEach(c => (rc += hilo(rankIdx(c)))); out.replaceChildren(...grp.map(c => card(c, { delay: 0 }))); sfx.play('card'); await sleep(Number(speed.value)); if (my !== token || !out.isConnected) return; }
      out.replaceChildren(h('div', { class: 'muted' }, 'Deck finished — what\'s the running count?'));
      const secs = Math.round((Date.now() - t0) / 1000);
      ctl.replaceChildren(ans, btn('Check', 'gold', () => { const ok = Number(ans.value) === rc; addStat(ok); msg.className = 'banner-result ' + (ok ? 'win' : 'lose'); msg.textContent = ok ? `✔ Correct! Final count ${rc} (a full deck always ends at 0) in ${secs}s` : `✘ The count was ${rc} (you said ${ans.value || '—'}). A full deck always ends at 0.`; sfx.play(ok ? 'win' : 'error', 1); ctl.replaceChildren(btn('Run again', 'gold', start)); running = false; }));
      ans.value = ''; ans.focus();
    };
    ans.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const b = ctl.querySelector('.btn.gold'); if (b) b.click(); } });
    ctl.replaceChildren(btn('Start a deck run', 'gold big', start));
    return pane('Deck run', 'Cards flash by one after another with no feedback. At the end, enter the running count — a complete 52-card deck always ends at 0, so you can check yourself. Real counters can run a deck in under 25 seconds.', h('div', { class: 'felt', style: { minHeight: 0 } }, h('div', { class: 'row', style: { justifyContent: 'center' } }, h('label', null, 'Speed ', speed, ' (slower ← → faster)'), per), out, msg, ctl));
  })();

  // ---------- 3. true count ----------
  const tcDrill = (() => {
    const q = h('div', { class: 'center' }), msg = h('div', { class: 'banner-result' }), inp = h('input', { type: 'number', step: '0.5', style: { maxWidth: '140px' }, 'aria-label': 'True count' }); let ans = 0;
    const next = () => { const decks = [1, 1.5, 2, 2.5, 3, 4, 5, 6][Math.floor(Math.random() * 8)], rc = Math.round((Math.random() * 20 - 6)); ans = rc / decks; q.replaceChildren(h('div', { style: { fontSize: '1.4rem' } }, `Running count `, h('b', { class: 'gold' }, (rc > 0 ? '+' : '') + rc), ` with `, h('b', { class: 'gold' }, decks), ' decks left'), h('div', { class: 'muted' }, 'What is the true count? (nearest 0.5 is fine)')); inp.value = ''; inp.focus(); };
    const check = e => { e.preventDefault(); const ok = Math.abs(Number(inp.value) - ans) <= 0.5; addStat(ok); msg.className = 'banner-result ' + (ok ? 'win' : 'lose'); msg.textContent = ok ? `✔ ${ans.toFixed(1)}` : `✘ ${ans.toFixed(2)} (running count ÷ decks left)`; sfx.play(ok ? 'tick' : 'error'); next(); };
    setTimeout(next, 0);
    return pane('True count', 'True count = running count ÷ decks remaining. Convert fast — it\'s what decides your bet size.', h('div', { class: 'felt', style: { minHeight: 0 } }, q, h('form', { class: 'row', style: { justifyContent: 'center', margin: '10px 0' }, onsubmit: check }, inp, btn('Check', 'gold', () => {}, { type: 'submit' })), msg));
  })();

  // ---------- 4. bet sizing ----------
  const betDrill = (() => {
    const q = h('div', { class: 'center' }), msg = h('div', { class: 'banner-result' }), opts = h('div', { class: 'actions' }); let tc = 0;
    H.bet = n => { const b = [...opts.children].find(x => x.textContent.trim().startsWith(String(n))); if (b) b.click(); };
    const best = t => (t < 1 ? 1 : t < 2 ? 2 : t < 3 ? 4 : t < 4 ? 6 : 8);
    const next = () => { tc = Math.round((Math.random() * 10 - 3) * 2) / 2; q.replaceChildren(h('div', { style: { fontSize: '1.4rem' } }, 'True count ', h('b', { class: 'gold' }, (tc > 0 ? '+' : '') + tc)), h('div', { class: 'muted' }, 'How many units should you bet? (1–8 spread)')); opts.replaceChildren(...[1, 2, 4, 6, 8].map(u => btn(u + (u === 1 ? ' unit' : ' units'), 'big', () => { const ok = u === best(tc); addStat(ok); msg.className = 'banner-result ' + (ok ? 'win' : 'lose'); msg.textContent = ok ? '✔ ' + u + ' units' : `✘ At ${tc >= 0 ? '+' : ''}${tc} the ramp says ${best(tc)} unit${best(tc) > 1 ? 's' : ''}`; sfx.play(ok ? 'tick' : 'error'); next(); }))); };
    setTimeout(next, 0);
    return pane('Bet sizing', 'Ramp: true count ≤ +1 → 1 unit · +2 → 2 · +3 → 4 · +4 → 6 · +5 or more → 8.', h('div', { class: 'felt', style: { minHeight: 0 } }, q, opts, msg));
  })();

  // ---------- 5. index plays ----------
  const idxDrill = (() => {
    const q = h('div', { class: 'center' }), msg = h('div', { class: 'banner-result' }), opts = h('div', { class: 'actions' });
    H.idx = yes => { const b = opts.children[yes ? 0 : 1]; if (b) b.click(); };
    const dev = chart.devs.filter(d => !d.hand.startsWith('hard 14') && !d.hand.startsWith('hard 15') || true);
    const next = () => {
      const d = dev[Math.floor(Math.random() * dev.length)];
      const m = d.when.match(/(≥|<) ([+\-−0-9]+)/); const idx = Number(m[2].replace('−', '-')); const ge = m[1] === '≥';
      const tc = idx + (Math.random() < .5 ? (ge ? 2 : -2) : (ge ? -2 : 2)), on = ge ? tc >= idx : tc < idx;
      q.replaceChildren(h('div', { style: { fontSize: '1.3rem' } }, 'You hold ', h('b', { class: 'gold' }, d.hand), ' vs dealer ', h('b', { class: 'gold' }, d.up)), h('div', { style: { fontSize: '1.1rem', margin: '6px 0' } }, 'True count ', h('b', { class: 'gold' }, (tc > 0 ? '+' : '') + tc)), h('div', { class: 'muted' }, `Index play: ${d.play} when ${d.when}. Do you make the count play?`));
      opts.replaceChildren(btn('Yes — ' + d.play, 'green big', () => fin(on, d, tc, on)), btn('No — basic strategy', 'big', () => fin(!on, d, tc, on)));
    };
    const fin = (ok, d, tc, on) => { addStat(ok); msg.className = 'banner-result ' + (ok ? 'win' : 'lose'); msg.textContent = ok ? '✔ Correct' : `✘ At ${tc >= 0 ? '+' : ''}${tc} you should ${on ? 'make the count play: ' + d.play : 'stick to basic strategy'}`; sfx.play(ok ? 'tick' : 'error'); next(); };
    setTimeout(next, 0);
    return pane('Index plays', 'The count changes a few plays. Decide whether the index applies at the true count shown.', h('div', { class: 'felt', style: { minHeight: 0 } }, q, opts, msg));
  })();

  const root = h('div', null);
  const kpanel = h('div', { class: 'panel', hidden: true, style: { marginBottom: '12px' } });
  drawKeys = () => {
    const b = binds();
    kpanel.replaceChildren(h('b', null, '⌨ Keybinds'), h('p', { class: 'muted small' }, 'Click a key box, then press the key you want (Esc cancels). Bet sizing uses the number keys for 1, 2, 4, 6, 8 units.'),
      h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px' } }, ...Object.entries(KEYDEFS).map(([k, d]) => h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'small' }, d.label),
        h('button', { class: 'btn sm' + (capturing === k ? ' gold' : ''), onclick: () => { capturing = capturing === k ? null : k; drawKeys(); } }, capturing === k ? 'press a key…' : b[k].map(keyName).join(' / '))))),
      h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn sm ghost', onclick: () => { store.set('trainer.keys', {}); capturing = null; drawKeys(); } }, 'Reset to defaults')));
  };
  const onKey = e => {
    if (!root.isConnected) return document.removeEventListener('keydown', onKey);
    if (capturing) { e.preventDefault(); if (e.key !== 'Escape') store.set('trainer.keys', { ...store.get('trainer.keys', {}), [capturing]: [e.key.length === 1 ? e.key.toLowerCase() : e.key] }); capturing = null; drawKeys(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;    // never steal keys while typing an answer
    const b = binds(), k = e.key.length === 1 ? e.key.toLowerCase() : e.key, is = a => b[a].includes(k);
    if (curTab === 'flash') { const v = is('plus') ? 1 : is('zero') ? 0 : is('minus') ? -1 : undefined; if (v !== undefined) { e.preventDefault(); H.flash(v); } }
    else if (curTab === 'run') { if (is('start')) { e.preventDefault(); H.runStart(); } }
    else if (curTab === 'idx') { if (is('yes')) { e.preventDefault(); H.idx(true); } else if (is('no')) { e.preventDefault(); H.idx(false); } }
    else if (curTab === 'bet') { if ('12468'.includes(k) && k.length === 1) { e.preventDefault(); H.bet(k); } }
  };
  document.addEventListener('keydown', onKey);
  onLeave(() => { document.removeEventListener('keydown', onKey); if (H.runAbort) H.runAbort(); });
  const t = tabs([['flash', '⚡ Flash cards', flash], ['run', '🃏 Deck run', run], ['tc', '➗ True count', tcDrill], ['bet', '🪙 Bet sizing', betDrill], ['idx', '🔵 Index plays', idxDrill]], { active: 'flash', onChange: id => { if (curTab === 'run' && id !== 'run' && H.runAbort) H.runAbort(); curTab = id; } });
  drawKeys();
  root.append(h('div', { class: 'sec-title' }, h('h1', null, '🧮 Counting trainer'), h('span', { class: 'row', style: { gap: '10px' } }, h('button', { class: 'btn sm', onclick: () => { kpanel.hidden = !kpanel.hidden; } }, '⌨ Keybinds'), h('a', { href: '#/learn/counting', class: 'muted small' }, 'How Hi-Lo works →'))),
    h('div', { class: 'callout' }, h('b', null, 'Hi-Lo: '), '2–6 = +1 · 7–9 = 0 · 10, J, Q, K, A = −1. Practice here is free and never touches your chips.'), kpanel, t.el);
  shell(root, 'trainer');
}
