// Game page: layout, coach/review/rules tabs, solo vs shared-table plumbing, table panel (players, host tools, bank, queue,
// provably-fair check, chat with global on/off), spectator mode for viewers + bot arena, and the invite preview.
import { api as realApi, api, state, setBalance, setUser, shownBalance } from './api.js';
import { h, clear, fmt, sgn, toast, modal, badge, tabs, store, btn } from './ui.js';
import { sfx } from './sfx.js';
import { roundFx, animOn } from './fx.js';
import { go, quickPlay, privateTable, settingsModal, saveSetting } from './app.js';

const SKILL = { high: 'Skill game', medium: 'Some skill', none: 'Pure luck' };

export function gamePage(id, _x, shell, onLeave) { return mountGame(id, shell, onLeave, null); }

// ------------------------------------------------------------------ table entry (invite link / code / lobby)
export async function tablePage(code, mode, shell, onLeave) {
  let snap;
  try { snap = (await api('/table/' + code)).table; }
  catch (e) { toast(e.message, 'bad'); return go('#/lobby'); }
  if (snap.bot) mode = 'watch';                                    // bot tables are watch-only
  let role = snap.role;
  if (mode === 'watch' && role === 'none') {
    try { await api(`/table/${code}/watch`, {}); role = 'viewer'; } catch (e) { toast(e.message, 'bad', 5000); return go('#/lobby'); }
  } else if (role === 'none') {
    return invitePage(snap, shell);                                // never auto-seat: show Join / Watch buttons
  }
  snap = (await api('/table/' + code)).table;
  return mountGame(snap.game, shell, onLeave, { code, role: snap.role, snap });
}

// Anonymous / embedded read-only view of a table. No account: guests can watch (never see private cards) but can't play or chat.
export async function guestTablePage(code, embed, shell, onLeave) {
  let snap;
  try { snap = (await realApi('/pub/table/' + code)).table; }
  catch (e) { shell(h('div', { class: 'panel center', style: { margin: '40px auto', maxWidth: '480px' } }, h('h2', null, 'Table not found'), h('p', { class: 'muted' }, e.message || 'That table is no longer running.'), h('a', { class: 'btn gold', href: '/' }, 'Open the casino'))); return; }
  snap.role = 'viewer';
  const had = state.user;
  if (!state.user) state.user = { display: 'Guest', settings: {}, guest: true, balance: 0, fee: { mode: 'pct', value: 0 } };
  onLeave(() => { if (!had) state.user = undefined; document.body.classList.remove('embed'); });
  if (embed) document.body.classList.add('embed');
  return mountGame(snap.game, shell, onLeave, { code, role: 'viewer', snap, guest: true, embed });
}
// the same calls a signed-in viewer makes, answered from the public read-only endpoints
async function guestApi(path, body) {
  if (!body && path.startsWith('/game/')) return { view: {}, last: null, balance: 0 };
  const m = path.match(/^\/table\/([A-Z0-9]{6})$/); if (!body && m) return realApi('/pub' + path);
  throw new Error('Sign in to do that — guests can watch but not play or chat.');
}
function shareTable(code, g) {
  const origin = location.origin, watch = `${origin}/#/t/${code}/watch`, embedSrc = `${origin}/embed/${code}`;
  const iframe = `<iframe src="${embedSrc}" width="100%" height="640" style="border:0;border-radius:12px" allow="fullscreen" allowfullscreen title="${g.name} at Lucky Chips Casino"></iframe>`;
  const row = (label, val) => h('div', { style: { margin: '10px 0' } }, h('div', { class: 'small muted' }, label), h('div', { class: 'row' }, h('input', { type: 'text', readonly: true, value: val, style: { flex: 1, minWidth: '200px' }, onclick: e => e.target.select() }), btn('Copy', 'xs gold', async () => { try { await navigator.clipboard.writeText(val); toast('Copied!', 'good'); } catch { toast('Select the text and copy it.', 'info'); } })));
  modal('Share or embed this table', h('div', null,
    h('p', { class: 'muted small' }, 'Anyone with the link can watch without signing in. They can\'t see private cards, play or chat. Signing in is only needed to chat or take a seat.'),
    row('Watch link', watch), row('Full-screen embed page', embedSrc), row('Embed code (iframe)', iframe)));
}
function goFullscreen(el) { const f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) f.call(el).catch(() => {}); else toast('Fullscreen isn\'t available in this browser.', 'info'); }

function invitePage(snap, shell) {
  const g = state.byId[snap.game];
  const seats = snap.players.filter(p => !p.banker).length;
  const full = seats >= snap.capacity;
  const out = h('div', { class: 'auth', style: { maxWidth: '520px' } }, h('div', { class: 'panel center' },
    h('div', { style: { fontSize: '3rem' } }, g.icon),
    h('h2', { style: { marginBottom: '2px' } }, snap.hostName ? `${snap.hostName} invited you to ${g.name}` : `Join a ${g.name} table`),
    h('div', { class: 'muted' }, `Table ${snap.code} · ${snap.public ? 'public' : 'private'} · ${seats}/${snap.capacity} seated · ${snap.viewers} watching`),
    h('div', { style: { margin: '14px 0' } },
      snap.bank ? h('div', { class: 'badge gold', style: { margin: '3px' } }, `🏦 Banked by ${snap.bank.host} — bank ${fmt(snap.bank.amount)} chips`) : null,
      snap.fee && snap.fee.value ? h('div', { class: 'badge red', style: { margin: '3px' } }, `Hand fee ${snap.fee.mode === 'pct' ? snap.fee.value + '%' : snap.fee.value + ' chips/hand'}`) : h('div', { class: 'badge green', style: { margin: '3px' } }, 'No hand fee'),
      h('div', { class: 'small muted', style: { marginTop: '8px' } }, 'Players here: ', snap.players.map(p => p.name).join(', ') || 'nobody yet')),
    h('div', { class: 'actions' },
      btn(full ? 'Table is full — watch & queue' : '🪑 Join table', full ? '' : 'gold big', async () => {
        try { if (full) { await api(`/table/${snap.code}/watch`, {}); location.hash = `#/t/${snap.code}/watch`; return; } await api(`/table/${snap.code}/join`, {}); sfx.play('join'); go('#/t/' + snap.code); }
        catch (e) { toast(e.message, 'bad', 5000); } }),
      btn('👁 Just watch', 'big', async () => { try { await api(`/table/${snap.code}/watch`, {}); go(`#/t/${snap.code}/watch`); } catch (e) { toast(e.message, 'bad'); } }),
      btn('Not now', 'ghost', () => go('#/lobby')))));
  shell(out, 'lobby');
}

// ------------------------------------------------------------------ the game page itself
async function mountGame(id, shell, onLeave, table) {
  const api = table && table.guest ? guestApi : realApi;          // guests are answered from the public read-only endpoints
  const g = state.byId[id];
  const mod = (await import(`./games/${id}.js`)).default;
  const first = await api('/game/' + id);
  setBalance(first.balance);
  if (table) state.demo && toast('Demo chips are for solo practice — tables use real chips.', 'info');

  const stage = h('div', { class: 'felt' });
  const coachBox = h('div', { class: 'coach' });
  const reviewBox = h('div', { class: 'review' }, h('p', { class: 'muted' }, 'After every round you\'ll get a breakdown here: what happened, whether your decisions were right, the odds, and tips.'));
  const rulesBox = h('div', { class: 'rules' });
  const tableBox = h('div', { class: 'tblbox' });
  const othersBox = h('div', { class: 'others' });
  const roundBar = h('div', { class: 'round-bar', hidden: true });
  const settings = () => state.user.settings || {};
  const myName = () => state.user.display;

  const ctx = {
    id, game: g, stage, mod, view: first.view, table, busy: false, readonly: false, lastReviewJson: first.last ? JSON.stringify(first.last) : '',
    coachNode: null, tab: null,
    coachOn: () => settings().coach !== false,
    setCoach(node) { ctx.coachNode = node; drawCoach(); },
    showReview(a, quiet) {
      reviewBox.replaceChildren(reviewNode(a));
      ctx.lastReviewJson = JSON.stringify(a);
      if (!quiet && ctx.tab && ctx.tab.btns.review) {
        if (settings().autoReview !== false) ctx.tab.select('review');
        else if (!ctx.tab.btns.review.querySelector('.dot')) ctx.tab.btns.review.append(h('span', { class: 'dot' }));
      }
    },
    toast, sfx,
    get user() { return state.user; },
    get sitting() { return !!(table && table.role === 'player' && myPlayer() && myPlayer().out); },
    async call(action, body) {
      if (ctx.busy || ctx.readonly) return null;
      ctx.busy = true;
      try { return applyResult(await api(`/game/${id}/${action}`, body || {})); }
      catch (e) { toast(e.message, 'bad'); return null; }
      finally { ctx.busy = false; }
    },
    // main action of a game (spin/deal/roll...): solo -> play now; simul table -> place bets with the group
    async primary(action, body) {
      if (ctx.readonly) return null;
      if (!table || table.role !== 'player' || g.shared.mode === 'parallel' || !(g.shared.primary || []).includes(action)) return ctx.call(action, body);
      if (ctx.busy) return null;
      if (stage.classList.contains('bets-closed')) { toast('Bets are closed — wait for the next round.', 'info'); return null; }
      ctx.busy = true;
      try {
        const r = await api(`/table/${table.code}/place`, body || {});
        setBalance(r.balance); if (r.view) ctx.view = r.view; mod.render(ctx.view, ctx);
        sfx.play('chips'); toast(g.shared.repeat ? 'Bets placed.' : 'Bets placed — the round starts when the timer ends or everyone is ready.', 'good');
        return r;
      } catch (e) { toast(e.message, 'bad'); return null; }
      finally { ctx.busy = false; }
    },
    async refresh() { const r = await api('/game/' + id); setBalance(r.balance); ctx.view = r.view; mod.render(r.view, ctx); return r; },
    tableCall(path, body) { return api(`/table/${table.code}/${path}`, body || {}); },
  };

  function applyResult(r) {
    setBalance(r.balance);
    ctx.view = r.view;
    mod.render(r.view, ctx);
    if (r.analysis) { ctx.showReview(r.analysis); if (!r.demo) sfx.outcome(r.analysis); else sfx.outcome(r.analysis); roundFx(stage, r.analysis, stage); }
    return r;
  }

  // ----- coach tab -----
  function drawCoach() {
    if (!ctx.coachOn()) {
      coachBox.replaceChildren(h('p', { class: 'muted' }, 'Coach is off — you\'re playing rated: no hints, and your decisions count toward your skill rating.'), h('button', { class: 'btn sm', onclick: async () => { await saveSetting({ coach: true }); drawCoach(); await ctx.refresh().catch(() => {}); } }, 'Turn coach on (practice)'));
      return;
    }
    coachBox.replaceChildren(ctx.coachNode || h('p', { class: 'muted' }, 'Place a bet to get live tips for this game.'),
      h('p', { class: 'muted small', style: { marginTop: '10px' } }, '🎓 With the coach on, decisions are practice and don\'t change your skill rating. Switch it off in Settings to play rated.'));
  }
  drawCoach();

  // ----- rules tab -----
  function drawRules() {
    const meta = g.meta || {};
    const opts = meta.options || [];
    const u = state.user;
    const atTable = !!table;
    const rulesNow = atTable && table.snap ? table.snap.rules : (u.rules && u.rules[id]) || {};
    const optNodes = opts.map(def => {
      const cur = rulesNow[def.key] !== undefined ? rulesNow[def.key] : def.default;
      let input;
      if (def.type === 'select') {
        input = h('select', { 'aria-label': def.label, disabled: atTable, onchange: e => setRule(def.key, e.target.value) }, def.choices.map(c => h('option', { value: c.v, selected: String(c.v) === String(cur) }, c.label)));
      } else {
        const out = h('b', null, cur + (def.unit || ''));
        input = h('div', null, h('input', { type: 'range', min: def.min, max: def.max, step: def.step, value: cur, disabled: atTable, style: { padding: 0 }, oninput: e => { out.textContent = e.target.value + (def.unit || ''); }, onchange: e => setRule(def.key, Number(e.target.value)) }), out, def.help ? h('div', { class: 'muted small' }, def.help) : null);
      }
      return h('label', { class: 'opt-row' }, h('span', null, def.label), input);
    });
    const fee = atTable && table.snap ? table.snap.fee : u.fee;
    rulesBox.replaceChildren(
      opts.length ? h('div', null, h('h3', null, '⚖ Table rules (house edge)'), h('p', { class: 'muted small' }, atTable ? 'At a shared table the rules are fixed for everyone (set when the table was created).' : 'Change the rules to change the house edge. New rules apply from the next round.'), optNodes) : null,
      h('div', { class: 'edge-line' }, 'Game edge: ', h('b', null, g.edge), fee && fee.value ? [' · Hand fee: ', h('b', { class: 'lose' }, fee.mode === 'pct' ? fee.value + '% of each wager' : fee.value + ' chips/hand')] : ' · No hand fee ', ' ', atTable ? null : h('button', { class: 'btn xs', onclick: settingsModal }, 'change fee')),
      h('h3', null, 'How to play'), h('div', { class: 'rules' }, (meta.rules || []).map(p => h('p', null, p))),
      meta.tips && meta.tips.length ? [h('h3', null, 'Strategy & tips'), h('ul', null, meta.tips.map(t => h('li', null, t)))] : null);
  }
  async function setRule(key, val) {
    try { const r = await api('/settings', { rules: { [id]: { [key]: val } } }); setUser(r.user); toast('Rules updated — applies next round.', 'good'); drawRules(); await ctx.refresh(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  drawRules();

  // ----- layout -----
  const botTable = !!(table && table.snap && table.snap.bot);
  const feeChip = !table && state.user.fee && state.user.fee.value ? h('button', { class: 'badge red', style: { cursor: 'pointer' }, onclick: settingsModal, title: 'Hand fee — adds to the house edge' }, 'Hand fee ' + (state.user.fee.mode === 'pct' ? state.user.fee.value + '%' : state.user.fee.value + '/hand')) : null;
  const head = h('div', { class: 'game-head' },
    h('a', { class: 'btn sm ghost', href: table ? '#/lobby' : '#/' }, '← ' + (table ? 'Lobby' : 'Games')),
    h('h1', null, g.icon + ' ' + g.name), badge('Edge ' + g.edge), badge(SKILL[g.skill] || '', g.skill === 'high' ? 'green' : g.skill === 'medium' ? 'gold' : ''), botTable ? badge('🤖 Bot table', 'gold') : null, feeChip,
    h('span', { class: 'grow' }),
    g.shared && !table ? [h('button', { class: 'btn', onclick: () => quickPlay(id) }, '👥 Public table'), h('button', { class: 'btn', title: 'Spectate a public table (works even when every seat is taken)', onclick: async () => { try { const r = await api('/lobby'); const gg = r.games.find(x => x.id === id); const t = gg && gg.tables.slice().sort((a, b) => (b.players + (b.viewers || 0)) - (a.players + (a.viewers || 0)))[0]; if (!t) return toast('No public tables are open yet — click Public table to start one.', 'info'); go('#/t/' + t.code + '/watch'); } catch (e) { toast(e.message, 'bad'); } } }, '👁 Watch'), h('button', { class: 'btn', onclick: () => privateTable(id) }, '🔗 Play with friends')] : null,
    table ? [h('button', { class: 'btn', title: 'Fullscreen', onclick: () => goFullscreen(document.querySelector('.game') || stage) }, '⛶ Fullscreen'), h('button', { class: 'btn', title: 'Share a watch link or embed this table', onclick: () => shareTable(table.code, g) }, '🔗 Share / embed')] : null,
    table ? (table.guest ? h('a', { class: 'btn gold', href: '/#/', target: table.embed ? '_blank' : '_self', rel: 'noopener' }, 'Sign in to play or chat') : h('button', { class: 'btn red', onclick: leaveTable }, table.role === 'viewer' ? 'Stop watching' : 'Leave table')) : null);

  const isBankerHost = () => !!(table && table.snap && table.snap.bank && table.snap.hostName === myName());
  const spectating = () => !!table && (table.role === 'viewer' || isBankerHost());
  if (botTable) ctx.coachOn = () => true;                 // watching bots: always show the coach's read on the bot's hand
  const items = [['coach', '🎓 Coach', coachBox], ['review', '📋 Review', reviewBox]];
  if (table) items.unshift(['table', table.role === 'viewer' ? '👁 Gallery' : '👥 Table', tableBox]);
  items.push(['rules', '📖 Rules', rulesBox]);
  const tabItems = table && (table.role === 'viewer' || (table.snap.bank && table.snap.hostName === myName())) ? items.filter(i => i[0] !== 'review' && (i[0] !== 'coach' || botTable)) : items;
  const tabset = tabs(tabItems, { active: table ? 'table' : 'coach', onChange: id2 => { if (id2 === 'review' && ctx.tab && ctx.tab.btns.review) { const d = ctx.tab.btns.review.querySelector('.dot'); if (d) d.remove(); } } });
  ctx.tab = tabset;
  shell(h('div', null, head, h('div', { class: 'game' }, h('div', { class: 'stagecol' }, roundBar, stage, othersBox), h('div', { class: 'side' }, tabset.el))), table ? 'lobby' : '');
  if (first.last) ctx.showReview(first.last, true);

  // ===================== shared table =====================
  let es = null, snap = table ? table.snap : null, tick = null, prevSnap = null;
  let tp = {};
  const seenPlayers = new Set();
  const chatOn = () => table && table.guest ? store.get('guestChat', true) !== false : settings().chat !== false;   // guests have no account, so their preference lives in this browser
  const myPlayer = () => snap && snap.players.find(p => p.name === myName());
  const mutes = new Set(store.get('muted', []));
  let spec = null;                                 // viewer-side renderer state (parallel rooms)

  if (!table) {
    mod.init(ctx); mod.render(ctx.view, ctx);
    onLeave(() => { if (mod.destroy) mod.destroy(ctx); });
  } else {
    if (!spectating()) { mod.init(ctx); mod.render(ctx.view, ctx); }
    else stage.append(h('div', { class: 'spectator-banner' }, botTable ? '🤖 Bots are playing — you\'re watching' : isBankerHost() ? '🏦 You\'re the banker — the table bets against you' : '👁 You\'re watching table ' + table.code));
    buildTablePanel();
    connect();
    onLeave(() => { if (es) es.close(); clearInterval(tick); clearInterval(roundTick); for (const o of others.values()) if (mod.destroy) { try { mod.destroy(o.sc); } catch {} } if (mod.destroy) mod.destroy(ctx); });
  }

  async function leaveTable() { try { await ctx.tableCall('leave'); } catch {} sfx.play('click'); go(botTable ? '#/arena' : '#/g/' + id); }

  function connect() {
    es = new EventSource(table.guest ? `/api/pub/table/${table.code}/stream` : `/api/table/${table.code}/stream`);
    es.addEventListener('state', e => onState(JSON.parse(e.data)));
    es.addEventListener('chat', e => addChat(JSON.parse(e.data)));
    es.addEventListener('result', e => onResult(JSON.parse(e.data)));
    es.addEventListener('evicted', () => { es.close(); toast('Your sit-out lock ended and your seat went to a new player — you\'re watching now.', 'info', 6000); setTimeout(() => go(`#/t/${table.code}/watch`), 50); });
    es.addEventListener('promoted', () => { es.close(); sfx.play('join'); toast('🪑 A seat opened — you\'re in!', 'good', 5000); setTimeout(() => go(`#/t/${table.code}`), 50); });
    es.addEventListener('kicked', () => { es.close(); toast('The host removed you from this table.', 'bad', 5000); go('#/lobby'); });
    es.addEventListener('closed', e => { es.close(); const d = JSON.parse(e.data); toast(d.reason + (d.payout ? ` Bank cashed out: ${fmt(d.payout)} chips (${sgn(d.profit)}).` : ''), 'info', 7000); api('/me').then(r => setUser(r.user)).catch(() => {}); go('#/lobby'); });
    es.addEventListener('switched', e => { es.close(); const d = JSON.parse(e.data); toast(`🎮 The host switched the table to ${state.byId[d.game].name}!`, 'info', 5000); setTimeout(() => go('#/t/' + table.code + (table.role === 'viewer' ? '/watch' : '')), 50); });
    es.onerror = () => { /* EventSource retries automatically */ };
  }

  function buildTablePanel() {
    const isViewer = table.role === 'viewer';
    const link = location.origin + '/#/t/' + table.code;
    tp.status = h('div', { class: 'small' });
    tp.bar = h('div', { class: 'timer-bar', hidden: true }, h('div'));
    tp.bank = h('div');
    tp.players = h('div', { class: 'tp-players' });
    tp.hist = h('div', { class: 'rl-hist' });
    tp.feed = h('div', { class: 'feed' });
    tp.btns = h('div', { class: 'row' });
    tp.host = h('div');
    tp.fair = h('details', { class: 'fair' });
    tp.chatLog = h('div', { class: 'chat-log', 'aria-live': 'polite' });
    tp.input = h('input', { type: 'text', maxlength: 140, placeholder: isViewer ? 'Chat with other viewers…' : 'Say something to the table…', 'aria-label': 'Chat message' });
    tp.chatBox = h('div');
    tp.viewersBadge = badge('', '');
    tp.queueBtn = h('div');
    const send = async e => { e.preventDefault(); const text = tp.input.value.trim(); if (!text) return; try { await ctx.tableCall('chat', { text }); tp.input.value = ''; } catch (err) { toast(err.message, 'bad'); } };
    tp.drawChat = () => {
      if (!chatOn()) { tp.chatBox.replaceChildren(h('p', { class: 'muted small' }, '💬 Chat is hidden. ', h('button', { class: 'btn xs', onclick: () => toggleChat(true) }, 'Show chat'))); return; }
      tp.chatBox.replaceChildren(
        h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h4', { style: { margin: '12px 0 4px' } }, isViewer ? '💬 Gallery chat — viewers only' : '💬 Table chat'), h('button', { class: 'btn xs ghost', title: 'Hide chat everywhere', onclick: () => toggleChat(false) }, 'Hide')),
        h('div', { class: 'chat' + (isViewer ? ' viewer-chat' : '') }, tp.chatLog, table.guest ? h('p', { class: 'muted small', style: { margin: '6px 0' } }, 'Watching as a guest — ', h('a', { href: '/#/', target: '_blank', rel: 'noopener' }, 'sign in'), ' to chat.') : h('form', { class: 'chat-form', onsubmit: send }, tp.input, h('button', { class: 'btn sm gold', type: 'submit' }, 'Send'))),
        snap && snap.public ? h('p', { class: 'muted small' }, 'Public chat is filtered. Click a name to mute that player for you.') : null);
      tp.chatLog.scrollTop = tp.chatLog.scrollHeight;
    };
    tableBox.replaceChildren(
      h('div', { class: 'row' }, h('b', null, 'Table ' + table.code), badge(snap.bot ? 'Bots' : snap.public ? 'Public' : 'Private', snap.bot ? 'gold' : snap.public ? 'green' : 'gold'), tp.viewersBadge, h('span', { class: 'grow' }),
        snap.bot ? null : h('button', { class: 'btn xs', title: 'Copy the invite link', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Invite link copied!', 'good'); sfx.play('click'); } catch { prompt('Copy this link:', link); } } }, '🔗 Link'),
        snap.bot ? null : h('button', { class: 'btn xs', title: 'Friends can type this code under "Join with a code"', onclick: async () => { try { await navigator.clipboard.writeText(table.code); toast('Code copied: ' + table.code, 'good'); } catch { toast('Table code: ' + table.code); } } }, '# ' + table.code)),
      tp.bank, tp.status, tp.bar,
      isViewer ? tp.queueBtn : tp.btns,
      tp.host,
      h('h4', { style: { margin: '12px 0 4px' } }, snap.mode === 'parallel' ? 'Players (each plays their own hand)' : 'Players'), tp.players,
      snap.mode === 'parallel' ? [h('h4', { style: { margin: '12px 0 4px' } }, 'Live feed'), tp.feed] : [h('div', { class: 'muted small', style: { marginTop: '8px' } }, 'Recent results'), tp.hist],
      tp.fair, tp.chatBox);
    tp.drawChat();
    for (const m of snap.chat) addChat(m, true);
  }
  async function toggleChat(on) { if (table.guest) store.set('guestChat', on); else await saveSetting({ chat: on }); tp.drawChat(); for (const m of snap.chat) addChat(m, true); }
  async function takeSeat() {
    try { await api(`/table/${table.code}/join`, {}); go('#/t/' + table.code); }
    catch (e) { toast(e.message, 'bad', 5000); }
  }

  function onState(s) {
    prevSnap = snap; snap = s; table.snap = s; table.role = s.role;
    if (!tp.players) return;
    const host = s.hostName === myName();
    tp.viewersBadge.textContent = '👁 ' + s.viewers + (s.queue ? ` · ⏳ ${s.queue} waiting` : '');
    // players
    const frag = s.players.map(p => {
      const me = p.name === myName();
      const isNew = !seenPlayers.has(p.name); seenPlayers.add(p.name);
      const st = p.banker ? '🏦 banker' : p.out ? (p.locked ? '🪑 sitting out (seat held)' : '🪑 sitting out (seat can be taken)') : s.mode === 'parallel' ? (p.last ? 'last ' + sgn(p.last.net) : 'playing…') : p.staked ? `bet ${fmt(p.staked)}` : p.ready ? '✔ ready' : '…';
      return h('div', { class: 'tp-p' + (p.online ? '' : ' off') + (isNew ? ' new' : '') + (s.mode === 'parallel' && spec && spec.watch === p.name ? ' sel' : ''), onclick: s.mode === 'parallel' && spectating() ? () => { spec.watch = p.name; renderSpectator(s); } : null },
        h('i', { class: 'dotp' }), h('span', { class: 'nm' }, p.name + (me ? ' (you)' : '')), h('span', { class: 'muted small' }, st),
        s.mode !== 'parallel' && p.last ? h('b', { class: 'small ' + (p.last.net > 0 ? 'win' : p.last.net < 0 ? 'lose' : '') }, sgn(p.last.net)) : null,
        host && !p.banker && !me && !s.public ? h('button', { class: 'x', title: 'Remove from table', onclick: ev => { ev.stopPropagation(); kick(p.name); } }, '✕') : null);
    });
    for (let i = s.players.filter(p => !p.banker).length; i < s.capacity; i++) frag.push(h('div', { class: 'tp-p off' }, h('i', { class: 'dotp' }), h('span', { class: 'nm muted' }, s.bot ? 'Open (bots only)' : 'Open seat')));
    tp.players.replaceChildren(...frag);
    tp.hist.replaceChildren(...(s.history || []).map(x => (x && typeof x === 'object') ? histChip(x) : h('span', { style: { background: 'rgba(255,255,255,.12)' } }, String(x))));
    if (s.feed) tp.feed.replaceChildren(...s.feed.slice().reverse().map(f => h('div', { class: 'tp-p' }, h('span', { class: 'nm' }, f.name), h('span', { class: 'muted small' }, f.headline), h('b', { class: 'small ' + (f.net > 0 ? 'win' : f.net < 0 ? 'lose' : '') }, sgn(f.net)))));
    // bank panel
    if (s.bank) {
      tp.bank.replaceChildren(h('div', { class: 'edge-line' }, h('b', null, '🏦 Bank ' + fmt(s.bank.amount) + ' chips'), ' ', h('span', { class: s.bank.profit >= 0 ? 'win' : 'lose' }, `(${sgn(s.bank.profit)} for ${s.bank.host})`), h('div', { class: 'muted small' }, `Players bet against ${s.bank.host}'s chips. At risk right now: up to ${fmt(s.bank.exposure)}.` + (s.fee && s.fee.value ? ` Hand fee ${s.fee.mode === 'pct' ? s.fee.value + '%' : s.fee.value + ' chips'} goes to the bank.` : ''))));
    } else tp.bank.replaceChildren(s.fee && s.fee.value && !s.public ? h('div', { class: 'edge-line' }, 'Table hand fee: ', h('b', { class: 'lose' }, s.fee.mode === 'pct' ? s.fee.value + '%' : s.fee.value + ' chips/hand')) : '');
    // status / timer (simul tables)
    if (tick) clearInterval(tick);
    const offset = s.now - Date.now();
    const upd = () => {
      if (s.mode === 'poker') { tp.status.textContent = s.pk && s.pk.practice ? '🤖 Practice table — demo chips, bots play with you.' : s.pk && s.pk.needPlayers ? 'Waiting for another player — a hand needs at least two.' : `Blinds ${s.pk ? s.pk.sb + '/' + s.pk.bb : ''} · no limit`; tp.bar.hidden = true; return; }
      if (s.mode === 'parallel') { tp.status.textContent = s.bot ? '🤖 Bots play endlessly while someone is watching.' : 'Everyone plays at their own pace. Results appear in the live feed.'; tp.bar.hidden = true; return; }
      if (s.phase === 'results') { tp.status.textContent = `Round ${s.round - 1} complete — next round starting…`; tp.bar.hidden = true; return; }
      if (s.mode === 'rounds' && s.phase !== 'betting') {
        if (!s.deadline) { tp.status.textContent = s.phase === 'dealing' ? 'Dealing…' : `Round ${s.round}…`; tp.bar.hidden = true; return; }
        const left = Math.max(0, s.deadline - (Date.now() + offset));
        if (tp.dl !== s.deadline) { tp.dl = s.deadline; tp.dlTotal = Math.max(left, 1); }
        tp.status.textContent = `Round ${s.round}: ${s.phase === 'insurance' ? 'insurance decisions' : 'everyone is playing'} — ${Math.ceil(left / 1000)}s`;
        tp.bar.hidden = false; tp.bar.firstChild.style.width = (left / tp.dlTotal * 100).toFixed(1) + '%'; return;
      }
      if (!s.deadline) { tp.status.textContent = s.repeat ? 'Place your bets, then press Go.' : 'Place your bets — the round starts when the first bet lands.'; tp.bar.hidden = true; return; }
      const left = Math.max(0, s.deadline - (Date.now() + offset));
      tp.status.textContent = `Round ${s.round}: betting closes in ${Math.ceil(left / 1000)}s`;
      tp.bar.hidden = false; tp.bar.firstChild.style.width = (left / (s.secs * 1000) * 100).toFixed(1) + '%';
    };
    upd(); tick = setInterval(upd, 250);
    // fairness
    drawFair(s);
    // host tools
    drawHost(s, host);
    // player vs viewer controls
    if (table.role === 'player' && !isBankerHost()) {
      const me = myPlayer();
      stage.classList.toggle('sitting-out', !!(me && me.out));
      const btns = [];
      if (me && me.out) btns.push(h('button', { class: 'btn green', onclick: () => ctx.tableCall('sitin').then(() => sfx.play('join')).catch(e => toast(e.message, 'bad')) }, '🪑 Sit back in'));
      else {
        if (s.mode !== 'parallel' && s.mode !== 'poker') {
          if (!s.repeat) btns.push(h('button', { class: 'btn sm', disabled: !(me && me.staked) || s.phase !== 'betting', onclick: takeBack }, '↩ Take bets back'));
          if (s.mode !== 'rounds') btns.push(h('button', { class: 'btn sm', disabled: s.phase !== 'betting', onclick: () => ctx.tableCall('ready').then(() => sfx.play('click')).catch(e => toast(e.message, 'bad')) }, s.repeat ? '🎲 Go (roll now)' : '✔ I\'m ready'));
        }
        btns.push(h('button', { class: 'btn sm', title: 'Skip rounds without losing your seat. Your seat is protected for one full round; after that, someone waiting can take it.', disabled: !!(me && (me.staked || me.active)), onclick: () => ctx.tableCall('sitout').then(() => sfx.play('click')).catch(e => toast(e.message, 'bad')) }, '🪑 Sit out a round'));
      }
      tp.btns.replaceChildren(...btns);
      if (me && me.out && !stage.querySelector('.sitout-banner')) stage.prepend(h('div', { class: 'sitout-banner' }, '🪑 You\'re sitting out. Your seat is held for one full round — sit back in any time before then.'));
      if (!(me && me.out)) { const b = stage.querySelector('.sitout-banner'); if (b) b.remove(); }
    } else if (table.role === 'viewer' && table.guest) {
      tp.queueBtn.replaceChildren(h('div', { class: 'spectator-banner' }, s.bot ? '🤖 Bot table — watch-only' : 'Watching as a guest. ', s.bot ? null : h('a', { href: '/#/', target: '_blank', rel: 'noopener' }, 'Sign in to join or chat')));
    } else if (table.role === 'viewer') {
      const open = s.players.filter(p => !p.banker).length < s.capacity || s.players.some(p => p.out && !p.locked);
      tp.queueBtn.replaceChildren(h('div', { class: 'spectator-banner' }, s.bot ? '🤖 Bot table — watch-only' : open ? [h('span', null, 'There\'s a free seat. '), btn('🪑 Take a seat', 'green sm', takeSeat)] : [h('span', null, 'Table is full. '), tp.queued ? btn('Leave queue', 'sm', unqueue) : btn('⏳ Join queue', 'gold sm', enqueue)]));
    }
    // stage for spectators
    if (spectating()) renderSpectator(s);
    if (mod.onTable && !spectating()) mod.onTable(ctx, s, prevSnap);
    renderOthers(s); updateRoundBar(s);
  }
  async function enqueue() { try { const r = await ctx.tableCall('queue'); tp.queued = true; toast(`You're #${r.position} in the queue — you'll be seated automatically.`, 'good'); onState(snap); } catch (e) { toast(e.message, 'bad'); } }
  async function unqueue() { try { await ctx.tableCall('unqueue'); tp.queued = false; onState(snap); } catch (e) { toast(e.message, 'bad'); } }
  async function takeBack() { try { const r = await ctx.tableCall('unplace'); setBalance(r.balance); if (r.view) ctx.view = r.view; mod.render(ctx.view, ctx); sfx.play('chip'); } catch (e) { toast(e.message, 'bad'); } }
  async function kick(name) { if (!confirm(`Remove ${name} from the table? They won't be able to rejoin.`)) return; try { await ctx.tableCall('kick', { name }); } catch (e) { toast(e.message, 'bad'); } }

  function drawHost(s, host) {
    if (!host || s.public) { tp.host.replaceChildren(); return; }
    const gameSel = h('select', { 'aria-label': 'Switch game' }, state.games.filter(x => x.shared && (!s.bank || x.shared.exposureOk !== false)).map(x => h('option', { value: x.id, selected: x.id === s.game }, x.icon + ' ' + x.name)));
    tp.host.replaceChildren(h('details', { class: 'hosttools', open: false },
      h('summary', null, '🛠 Host tools'),
      h('div', { class: 'opt-row' }, h('span', null, 'Switch the game (everyone stays seated)'), h('div', { class: 'row' }, gameSel, btn('Switch', 'sm gold', async () => { if (gameSel.value === s.game) return; try { await ctx.tableCall('switch', { game: gameSel.value }); } catch (e) { toast(e.message, 'bad'); } }))),
      s.viewerNames && s.viewerNames.length ? h('div', { class: 'opt-row' }, h('span', null, 'Watching'), h('div', { class: 'row' }, s.viewerNames.map(n => h('span', { class: 'badge' }, n, ' ', h('button', { class: 'x', title: 'Remove', onclick: () => kick(n) }, '✕'))))) : null,
      s.bank ? h('div', { class: 'opt-row' }, h('span', null, 'Add to the bank'), h('div', { class: 'row' }, ...(() => { const i = h('input', { type: 'number', min: 1, value: 200, style: { width: '110px' }, 'aria-label': 'Top-up' }); return [i, btn('Top up', 'sm', async () => { try { const r = await ctx.tableCall('topup', { amount: Number(i.value) }); setUser(r.user); toast('Bank topped up.', 'good'); } catch (e) { toast(e.message, 'bad'); } })]; })())) : null,
      btn(s.bank ? '💰 Close table & cash out bank' : 'Close table', 'red sm', async () => { if (!confirm(s.bank ? 'Close the table and take the remaining bank back?' : 'Close the table for everyone?')) return; try { await ctx.tableCall('close'); } catch (e) { toast(e.message, 'bad'); } })));
  }

  // provably fair panel
  let lastVerified = '';
  function drawFair(s) {
    const f = s.fair; tp.fair.hidden = !f; if (!f) return;
    const rev = f.revealed[f.revealed.length - 1];
    const key = f.commit + (rev ? rev.seed : '');
    if (key === lastVerified && tp.fair.dataset.k === key) return;
    tp.fair.dataset.k = key; lastVerified = key;
    const short = x => x.slice(0, 10) + '…' + x.slice(-6);
    const out = h('div', { class: 'small' });
    tp.fair.replaceChildren(h('summary', null, '🔐 Provably fair'),
      h('p', { class: 'muted small' }, 'Before bets open, the table publishes a SHA-256 fingerprint of a secret seed. After the round the seed is revealed — you can check that it matches, so the result could not have been changed after seeing the bets.'),
      h('div', { class: 'small' }, 'Next round commitment: ', h('code', null, short(f.commit))), out);
    if (rev) verify(rev, out);
  }
  async function verify(rev, out) {
    try {
      const bytes = Uint8Array.from(rev.seed.match(/../g).map(x => parseInt(x, 16)));
      const buf = await crypto.subtle.digest('SHA-256', bytes);
      const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
      const ok = hex === rev.commit;
      out.replaceChildren(h('div', { class: ok ? 'win' : 'lose' }, `${ok ? '✔ Verified' : '✘ MISMATCH'} — round ${rev.round}: SHA-256(seed) ${ok ? '=' : '≠'} the commitment published before betting.`), h('div', { class: 'muted small' }, 'Seed: ', h('code', null, rev.seed.slice(0, 16) + '…'), ' · first draws (range → value): ', rev.draws.slice(0, 6).map(d => `${d[0]}→${d[1]}`).join(', ') || '—'));
    } catch { out.textContent = 'Your browser can\'t verify hashes here (needs https or localhost).'; }
  }
  function histChip(x) {
    if (x.c) return h('span', { class: x.c }, x.n);
    return h('span', { style: { background: 'rgba(255,255,255,.12)' } }, x.text || JSON.stringify(x));
  }


  // ----- seated players at a parallel table see everyone else's hand live, beneath their own -----
  const others = new Map();                          // name -> { box, inner, sc }
  // ----- shared-outcome tables: say plainly whether bets are open, and lock the board while they're not -----
  let roundTick = null;
  function updateRoundBar(s) {
    clearInterval(roundTick);
    const rounds = s.mode === 'rounds';
    const on = table && (s.mode === 'simul' || rounds) && (rounds || (!spectating() && !s.bot));
    roundBar.hidden = !on; if (!on) { stage.classList.remove('bets-closed'); return; }
    const skew = (s.now || Date.now()) - Date.now();
    const paint = () => {
      const open = s.phase === 'betting', left = s.deadline ? Math.max(0, Math.ceil((s.deadline - Date.now() - skew) / 1000)) : null;
      const me = s.players.find(p => p.name === myName()), placed = me && me.staked > 0;
      if (rounds) {
        const act = s.phase === 'play' || s.phase === 'insurance';
        roundBar.className = 'round-bar ' + (open || act ? 'open' : 'closed');
        roundBar.textContent = open ? (placed ? `✔ Your bet is in — dealing ${left !== null ? 'in ' + left + 's' : 'when everyone has bet'}.` : `🟢 Betting is open${left !== null ? ' — ' + left + 's left' : ''}. Place your bet; everyone is dealt together.`)
          : s.phase === 'insurance' ? `🛡 Insurance — decide now${left !== null ? ' (' + left + 's)' : ''}. The dealer shows an Ace.`
          : s.phase === 'play' ? `🃏 Everyone plays at once — ${left !== null ? left + 's left; idle seats stand automatically' : 'make your moves'}.`
          : s.phase === 'results' ? '🏁 Round over — next round opens in a moment.' : 'Dealing…';
        return;
      }
      roundBar.className = 'round-bar ' + (open ? 'open' : 'closed');
      roundBar.textContent = open ? (placed ? `✔ Your bets are in — round starts ${left !== null ? 'in ' + left + 's' : 'when everyone is ready'}. You can still add chips.` : `🟢 Betting is open${left !== null ? ' — ' + left + 's left' : ''}. Place your chips, then confirm.`) : '🎲 Round in progress — bets are closed until the next round.';
      stage.classList.toggle('bets-closed', !open);
    };
    paint(); if ((s.phase === 'betting' || (rounds && (s.phase === 'play' || s.phase === 'insurance'))) && s.deadline) roundTick = setInterval(paint, 500);
  }
  function renderOthers(s) {
    const want = (table && s.mode === 'parallel' && !spectating() && s.pviews)
      ? s.players.filter(p => !p.banker && p.name !== myName() && s.pviews[p.name]).map(p => p.name) : [];
    for (const [n, o] of others) if (!want.includes(n)) { try { if (mod.destroy) mod.destroy(o.sc); } catch {} o.box.remove(); others.delete(n); }
    if (!want.length) { othersBox.replaceChildren(); return; }
    for (const n of want) {
      let o = others.get(n);
      if (!o) {
        const inner = h('div', { class: 'other-inner' });
        const box = h('div', { class: 'other-seat' }, h('div', { class: 'other-name' }, n), inner);
        const sc = Object.create(ctx); sc.__who = n; sc.stage = inner; sc.readonly = true; sc.table = null; sc.setCoach = () => {}; sc.call = sc.primary = async () => null; sc.coachOn = () => false; sc.toast = () => {};
        try { mod.init(sc); } catch (e) { console.error(e); }
        o = { box, inner, sc }; others.set(n, o);
      }
      try { mod.render(s.pviews[n], o.sc); } catch (e) { console.error(e); }
    }
    othersBox.replaceChildren(h('div', { class: 'others-title' }, '👥 Other players — live'), h('div', { class: 'others-grid' }, want.map(n => others.get(n).box)));
  }

  // ----- stage for viewers / banker host -----
  function renderSpectator(s) {
    if (s.mode === 'parallel') {
      // every seated player's hand is on screen at once; click a tile to make it the one the coach explains
      const names = s.players.filter(p => !p.banker).map(p => p.name);
      if (!spec) spec = { watch: names[0] || null, tiles: new Map(), grid: null };
      if (!spec.watch || !names.includes(spec.watch)) spec.watch = names[0] || null;
      if (!spec.grid) {
        spec.grid = h('div', { class: 'spec-grid' });
        stage.replaceChildren(h('div', { class: 'spectator-banner' }, botTable ? '🤖 Bots are playing — every hand is shown live (click one to hear the coach on it)' : '👁 You\'re watching — every player\'s hand is shown live'), spec.grid);
        stage.classList.add('readonly');
      }
      for (const [n, t] of spec.tiles) if (!names.includes(n)) { try { if (mod.destroy) mod.destroy(t.sc); } catch {} t.box.remove(); spec.tiles.delete(n); }
      const focus = n => { spec.watch = n; for (const [k, t] of spec.tiles) { t.box.classList.toggle('sel', k === n); } const pv = snap && snap.pviews && snap.pviews[n]; if (pv) { try { mod.render(pv, spec.tiles.get(n).sc); } catch (e) { console.error(e); } } };
      for (const n of names) {
        let t = spec.tiles.get(n);
        if (!t) {
          const inner = h('div', { class: 'spec-inner' });
          const box = h('div', { class: 'spec-tile', onclick: () => focus(n), title: botTable ? 'Click to see the coach\'s read on this hand' : '' }, h('div', { class: 'spec-name' }, n), inner);
          const sc = Object.create(ctx); sc.__who = n; sc.stage = inner; sc.readonly = true; sc.table = null; sc.setCoach = node => { if (botTable && spec.watch === n) ctx.setCoach(node); }; sc.call = sc.primary = async () => null; sc.coachOn = () => botTable; sc.toast = () => {};
          try { mod.init(sc); } catch (e) { console.error(e); }
          t = { box, inner, sc }; spec.tiles.set(n, t);
        }
        t.box.classList.toggle('sel', n === spec.watch);
        const pv = s.pviews && s.pviews[n];
        t.box.classList.toggle('waiting', !pv);
        if (pv) { try { mod.render(pv, t.sc); } catch (e) { console.error(e); } }
      }
      const want = names.map(n => spec.tiles.get(n).box);
      if (spec.grid.children.length !== want.length || want.some((b, i) => spec.grid.children[i] !== b)) spec.grid.replaceChildren(...want);
      spec.grid.style.setProperty('--z', names.length <= 1 ? 1 : names.length === 2 ? .8 : .62);
      return;
    }
    // simul tables: render the shared outcome
    if (mod.spectate) { mod.spectate(ctx, s); return; }
    stage.replaceChildren(h('div', { class: 'spectator-banner' }, '👁 Table ' + table.code + ' — round ' + s.round),
      s.outcome ? h('div', { class: 'banner-result' }, s.outcome.text || 'Result: ' + s.outcome.n) : h('p', { class: 'center muted' }, 'Waiting for the first round…'),
      h('div', { class: 'rl-hist' }, (s.history || []).map(histChip)));
  }

  async function onResult(d) {
    const iPlayed = d.results.some(r => r.name === myName());
    if (animOn() && mod.onResult) { try { await mod.onResult(spec && spec.sctx ? spec.sctx : ctx, d); } catch (e) { console.error(e); } }
    if (table.role === 'player' && !isBankerHost()) {
      try {
        const r = await api('/game/' + id);
        setBalance(r.balance); ctx.view = r.view; mod.render(r.view, ctx);
        if (iPlayed && r.last && JSON.stringify(r.last) !== ctx.lastReviewJson) { ctx.showReview(r.last); sfx.outcome(r.last); roundFx(stage, r.last, stage); }
      } catch (e) { console.error(e); }
    } else if (!mod.onResult) sfx.play('chip');
  }

  function addChat(m, silent) {
    if (!tp.chatLog || !chatOn()) return;
    if (!m.sys && mutes.has(m.name)) return;
    const stick = tp.chatLog.scrollTop + tp.chatLog.clientHeight >= tp.chatLog.scrollHeight - 30;
    const nameEl = m.sys ? null : h('b', { style: { cursor: 'pointer' }, title: 'Click to mute/unmute', onclick: () => {
      if (m.name === myName()) return;
      if (mutes.has(m.name)) mutes.delete(m.name); else mutes.add(m.name);
      store.set('muted', [...mutes]); toast(mutes.has(m.name) ? `Muted ${m.name}` : `Unmuted ${m.name}`);
    } }, m.name);
    tp.chatLog.append(h('div', { class: 'm' + (m.sys ? ' sys' : '') }, nameEl, nameEl ? ': ' : '', m.text));
    while (tp.chatLog.childNodes.length > 80) tp.chatLog.firstChild.remove();
    if (stick) tp.chatLog.scrollTop = tp.chatLog.scrollHeight;
    if (!silent && !m.sys && m.name !== myName()) sfx.play('msg');
  }
}

// ---------- review rendering ----------
export function reviewNode(a) {
  const net = a.net;
  return h('div', null,
    h('div', { class: 'rv-head' }, h('h3', null, a.headline), h('div', { class: 'rv-net ' + (net > 0 ? 'win' : net < 0 ? 'lose' : '') }, net === 0 ? 'Even' : sgn(net))),
    a.sections.map(sec => h('div', { class: 'rv-sec' }, h('h4', null, sec.title), sec.items.map(it => h('div', { class: 'it ' + it.k }, it.t)))));
}
