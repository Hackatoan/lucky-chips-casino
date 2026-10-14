// Secondary pages: live-tables lobby, bot arena, house ledger, leaderboards, profile, and the create-table / queue dialogs.
import { api, state, setUser, setBalance } from './api.js';
import { h, clear, fmt, sgn, toast, modal, badge, timeAgo, btn, store } from './ui.js';
import { sfx } from './sfx.js';
import { go, shell, onLeave, settingsModal, saveSetting } from './app.js';

const CAT_LABEL = { cards: '🃏 Card games', table: '🎡 Wheel & table games', dice: '🎲 Dice games', arcade: '🕹 Arcade', machine: '🎰 Slot machines' };

// ---------------------------------------------------------------- join with a code
export function joinCodeForm() {
  const input = h('input', { type: 'text', maxlength: 9, placeholder: 'Table code', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Table code', style: { textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 800, maxWidth: '170px' } });
  const submit = e => { e.preventDefault(); const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length !== 6) { toast('Table codes are 6 characters, like K7QM4X.', 'bad'); return; } sfx.play('join'); location.hash = '#/t/' + code; };
  return h('form', { class: 'row joincode', onsubmit: submit }, h('span', { class: 'muted small' }, 'Have a code?'), input, h('button', { class: 'btn green', type: 'submit' }, 'Join table'));
}

// ---------------------------------------------------------------- queue waiting dialog
export function queueModal(gameId, first) {
  const g = state.byId[gameId];
  const pos = h('b', null, '#' + first.position);
  const total = h('span', null, String(first.total));
  let stopped = false;
  const m = modal(`${g.icon} Waiting for a ${g.name} seat`, h('div', { class: 'center' },
    h('p', null, 'Every public table is full, so you\'re in line. You\'ll be seated automatically — keep this window open.'),
    h('div', { style: { fontSize: '2rem', margin: '10px 0' } }, 'Your place: ', pos, ' of ', total),
    h('p', { class: 'muted small' }, 'Meanwhile you can still play solo, or watch a table from the Live tables page.'),
    h('div', { class: 'actions' }, btn('Leave the queue', 'red', async () => { stopped = true; try { await api('/queue/leave', { game: gameId }); } catch {} m.close(); }))),
    { onClose: () => { stopped = true; } });
  (async function poll() {
    while (!stopped) {
      await new Promise(r => setTimeout(r, 2000));
      if (stopped) return;
      try {
        const s = await api('/queue?game=' + gameId);
        if (s.seated) { stopped = true; m.close(); sfx.play('join'); toast('🪑 Your seat is ready!', 'good'); go('#/t/' + s.seated); return; }
        if (s.queued === false) { stopped = true; m.close(); return; }
        pos.textContent = '#' + s.position; total.textContent = String(s.total);
      } catch { /* keep trying */ }
    }
  })();
}

// ---------------------------------------------------------------- create a private table
export function privateTableModal(gameId) {
  const u = state.user;
  const sharedGames = state.games.filter(x => x.shared);
  let g = state.byId[gameId] || sharedGames[0];
  const body = h('div');
  const draw = () => {
    const meta = g.meta || {};
    const saved = (u.rules && u.rules[g.id]) || {};
    const ruleVals = {};
    const gameSel = h('select', { 'aria-label': 'Game', onchange: e => { g = state.byId[e.target.value]; draw(); } }, sharedGames.map(x => h('option', { value: x.id, selected: x.id === g.id }, x.icon + ' ' + x.name)));
    const simul = g.shared.mode === 'simul';
    const secs = h('input', { type: 'range', min: 10, max: 60, step: 5, value: g.shared.secs || 20, disabled: !simul, style: { padding: 0 } });
    const secsOut = h('b', null, (g.shared.secs || 20) + 's'); secs.addEventListener('input', () => { secsOut.textContent = secs.value + 's'; });
    const optRows = (meta.options || []).map(def => {
      const cur = saved[def.key] !== undefined ? saved[def.key] : def.default; ruleVals[def.key] = cur;
      if (def.type === 'select') return h('label', { class: 'opt-row' }, h('span', null, def.label), h('select', { onchange: e => { ruleVals[def.key] = e.target.value; } }, def.choices.map(c => h('option', { value: c.v, selected: String(c.v) === String(cur) }, c.label))));
      const out = h('b', null, cur + (def.unit || ''));
      return h('label', { class: 'opt-row' }, h('span', null, def.label), h('input', { type: 'range', min: def.min, max: def.max, step: def.step, value: cur, style: { padding: 0 }, oninput: e => { ruleVals[def.key] = Number(e.target.value); out.textContent = e.target.value + (def.unit || ''); } }), out);
    });
    const feeMode = h('select', { 'aria-label': 'Fee type' }, h('option', { value: 'pct' }, '% of every wager'), h('option', { value: 'flat' }, 'chips per hand'));
    const feeVal = h('input', { type: 'number', min: 0, max: 100, step: 0.5, value: 0, style: { width: '90px' }, 'aria-label': 'Fee amount' });
    const bankable = !!g.shared.bankable;
    const banker = h('input', { type: 'checkbox', style: { width: 'auto' }, disabled: !bankable });
    const bank = h('input', { type: 'number', min: 200, max: Math.max(200, u.balance), step: 50, value: Math.min(1000, Math.max(200, Math.floor(u.balance / 2))), style: { width: '120px' }, 'aria-label': 'Bank size' });
    body.replaceChildren(
      h('label', { class: 'opt-row' }, h('span', null, 'Game'), gameSel),
      simul ? h('label', { class: 'opt-row' }, h('span', null, 'Betting window per round'), secs, secsOut) : h('p', { class: 'muted small' }, 'Everyone plays their own hands at their own pace in this room — you get chat, a live feed and spectators.'),
      optRows.length ? h('div', null, h('h3', null, '⚖ Table rules'), optRows) : null,
      h('h3', null, '💸 Hand fee'),
      h('p', { class: 'muted small' }, 'Casinos take a commission or a per-hand fee. Set one for this table (it goes to the bank if you\'re the banker). 0 = none.'),
      h('div', { class: 'row' }, feeVal, feeMode),
      h('h3', null, '🏦 Be the banker'),
      bankable ? h('div', null,
        h('label', { class: 'row', style: { cursor: 'pointer' } }, banker, h('span', null, 'I\'ll be the house: players bet against my chips')),
        h('p', { class: 'muted small' }, 'Your bank is set aside when you create the table. Winners are paid from it, losers feed it, and you cash out whatever is left when you close the table. You earn the house edge — and carry the variance.'),
        h('label', { class: 'opt-row' }, h('span', null, 'Bank (at least 200 chips)'), bank))
        : h('p', { class: 'muted small' }, `${g.name} can't be banked yet (only games with a shared outcome like roulette, baccarat, Sic Bo and wheels).`),
      h('div', { class: 'actions', style: { marginTop: '16px' } },
        btn('Create table & get invite link', 'gold big', async e => {
          e.target.disabled = true;
          try {
            const payload = { game: g.id, public: false, secs: Number(secs.value), rules: ruleVals, fee: { mode: feeMode.value, value: Number(feeVal.value) || 0 } };
            if (banker.checked && bankable) payload.bank = Number(bank.value);
            const r = await api('/table', payload);
            if (payload.bank) { const me = await api('/me'); setUser(me.user); }
            sfx.play('join'); m.close();
            try { await navigator.clipboard.writeText(location.origin + '/#/t/' + r.table.code); toast('Table created — invite link copied to your clipboard! Code: ' + r.table.code, 'good', 6000); } catch { toast('Table created. Code: ' + r.table.code, 'good', 6000); }
            go('#/t/' + r.table.code);
          } catch (err) { toast(err.message, 'bad', 5000); e.target.disabled = false; }
        })));
  };
  const m = modal('🔗 Play with friends', body, { wide: true });
  draw();
}

// ---------------------------------------------------------------- live tables lobby
export async function lobbyPage() {
  const body = h('div');
  shell(h('div', null,
    h('div', { class: 'sec-title' }, h('h1', null, '👥 Live tables'), joinCodeForm()),
    h('div', { class: 'row', style: { marginBottom: '12px' } },
      h('a', { class: 'btn', href: '#/arena' }, '🤖 Bot arena — watch bots play any game'),
      h('a', { class: 'btn', href: '#/multi' }, '📺 Multi-view — watch several tables at once')),
    h('p', { class: 'muted' }, 'Public tables are created automatically as players arrive — Quick play seats you at the busiest table with a free seat, and if every table is full you wait in a queue. You can also watch any table from the gallery (gallery chat is separate from the players\' chat).'),
    body), 'lobby');
  let stop = false;
  onLeave(() => { stop = true; });
  const load = async () => {
    if (stop) return;
    try {
      const r = await api('/lobby');
      const banked = r.bankers || [];
      body.replaceChildren(
        banked.length ? h('div', { class: 'panel', style: { marginBottom: '12px' } }, h('h3', null, '🏦 Banked private tables'), h('p', { class: 'muted small' }, 'Players are betting against a host\'s own chips. You need the invite link or code to sit down — here\'s a peek.'),
          banked.map(b => h('div', { class: 'lobby-row' }, state.byId[b.game].icon, h('b', null, state.byId[b.game].name), h('span', { class: 'muted small' }, `${b.players}/${b.capacity} seated · bank ${fmt(b.bank)} chips`), h('span', { class: 'grow' }), h('a', { class: 'btn sm', href: '#/t/' + b.code }, 'Open invite')))) : null,
        ...Object.entries(CAT_LABEL).map(([cat, label]) => {
          const list = r.games.filter(g => g.category === cat);
          if (!list.length) return null;
          return h('div', null, h('h2', { style: { margin: '18px 0 8px' } }, label), ...list.map(g => h('div', { class: 'panel', style: { marginBottom: '10px' } },
            h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, g.icon + ' ' + g.name), badge(g.mode === 'simul' ? 'shared outcome' : 'own hands', ''), h('span', { class: 'muted small' }, `up to ${g.max} players per table`), h('span', { class: 'grow' }),
              g.full ? h('button', { class: 'btn gold', onclick: () => import('./app.js').then(a => a.quickPlay(g.id)) }, `⏳ Join queue (${g.queue} waiting)`) : h('button', { class: 'btn gold', onclick: () => import('./app.js').then(a => a.quickPlay(g.id)) }, '⚡ Quick play'),
              h('button', { class: 'btn', onclick: () => privateTableModal(g.id) }, '🔗 Private table')),
            g.full ? h('p', { class: 'small gold', style: { margin: '6px 0 0' } }, `All ${g.maxTables} public tables are full — new players queue and are seated in order.`) : null,
            g.tables.length ? g.tables.map(t => h('div', { class: 'lobby-row' },
              h('b', null, 'Table ' + t.code),
              h('span', { class: 'seatdots', title: `${t.players}/${t.capacity} seated` }, Array.from({ length: t.capacity }, (_, i) => h('i', { class: i < t.players ? 'f' : '' }))),
              h('span', { class: 'muted small' }, `${t.players}/${t.capacity} seated${t.sitting ? ` · ${t.sitting} sitting out` : ''} · ${t.viewers || 0} watching` + (t.mode === 'simul' ? ` · round ${t.round} · ${t.phase === 'betting' ? 'betting open' : 'dealing'}` : '')),
              h('span', { class: 'grow' }),
              h('a', { class: 'btn sm', href: `#/t/${t.code}/watch` }, '👁 Watch'),
              h('a', { class: 'btn sm green', href: `#/t/${t.code}` }, t.players >= t.capacity ? 'Try to join' : 'Join')))
              : h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, 'No tables open yet — Quick play will open one for you.'))));
        }));
    } catch (e) { body.replaceChildren(h('p', { class: 'lose' }, e.message)); }
    if (!stop) { const t = setTimeout(load, 4000); onLeave(() => clearTimeout(t)); }
  };
  load();
}

// ---------------------------------------------------------------- bot arena
export async function arenaPage() {
  const body = h('div', { class: 'grid' });
  shell(h('div', null,
    h('div', { class: 'sec-title' }, h('div', null, h('h1', null, '🤖 Bot arena'), h('div', { class: 'muted' }, 'One table per game where house bots play forever — following the coach\'s advice. Watch to learn strategy, or just enjoy the show.')),
      h('a', { class: 'btn gold', href: '#/multi' }, '📺 Multi-view')),
    h('p', { class: 'muted small' }, 'Bots use demo chips (nothing is saved or ranked), you can\'t take a seat, and tables pause automatically when nobody is watching to save resources.'),
    body), 'lobby');
  let stop = false; onLeave(() => { stop = true; });
  const load = async () => {
    if (stop) return;
    try {
      const r = await api('/arena');
      body.replaceChildren(...r.arena.map(a => h('a', { class: 'tile cat-' + a.category, href: `#/t/${a.code}/watch` },
        h('div', { class: 'tile-art' }, h('span', { class: 'ico' }, a.icon), h('span', { class: 'multi' }, a.live ? '🔴 LIVE' : '⏸ paused')),
        h('div', { class: 'tile-body' }, h('h3', null, a.name), h('div', { class: 'muted small' }, a.mode === 'simul' ? `Round ${a.round} · shared outcome` : 'Bots play their own hands'), h('div', { class: 'row' }, badge('👁 ' + a.watching), h('span', { class: 'btn gold sm' }, 'Watch'))))));
    } catch (e) { body.replaceChildren(h('p', { class: 'lose' }, e.message)); }
    if (!stop) { const t = setTimeout(load, 6000); onLeave(() => clearTimeout(t)); }
  };
  load();
}

// ---------------------------------------------------------------- the house ledger
export async function housePage() {
  const r = await api('/house');
  const t = r.total.casino, b = r.total.banker;
  const edge = t.wagered ? (t.profit / t.wagered) : 0;
  const maxAbs = Math.max(1, ...r.daily.map(d => Math.abs(d.profit)));
  const stat = (k, v, cls) => h('div', { class: 'panel center' }, h('div', { class: 'muted small' }, k), h('div', { style: { fontSize: '1.5rem', fontWeight: 800 }, class: cls || '' }, v));
  shell(h('div', null,
    h('div', { class: 'sec-title' }, h('h1', null, '🏦 The House'), h('span', { class: 'muted small' }, 'What the casino earned from real-chip play (demo and bot rounds excluded)')),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' } },
      stat('House profit', sgn(t.profit), t.profit >= 0 ? 'win' : 'lose'), stat('Wagered', fmt(t.wagered)), stat('Paid out', fmt(t.returned)), stat('Hand fees', fmt(t.fees)), stat('Rounds', fmt(t.rounds)), stat('Realized edge', t.wagered ? (edge * 100).toFixed(2) + '%' : '—')),
    b.rounds ? h('p', { class: 'muted small' }, `Player-banked private tables: ${fmt(b.rounds)} rounds, ${fmt(b.wagered)} wagered, bankers earned ${sgn(b.profit)} in total (not counted above).`) : null,
    h('div', { class: 'sec-title' }, h('h2', null, 'By game')),
    h('div', { class: 'panel', style: { overflowX: 'auto' } }, r.games.length ? h('table', { class: 't' }, h('thead', null, h('tr', null, ['Game', 'Rounds', 'Wagered', 'Paid out', 'Fees', 'House profit', 'Realized edge', 'Theory'].map((c, i) => h('th', { class: i ? 'num' : '' }, c)))),
      h('tbody', null, r.games.map(g => h('tr', null, h('td', null, g.icon + ' ' + g.name), h('td', { class: 'num' }, fmt(g.casino.rounds)), h('td', { class: 'num' }, fmt(g.casino.wagered)), h('td', { class: 'num' }, fmt(g.casino.returned)), h('td', { class: 'num' }, fmt(g.casino.fees)),
        h('td', { class: 'num ' + (g.casino.profit >= 0 ? 'win' : 'lose') }, sgn(g.casino.profit)), h('td', { class: 'num' }, g.realizedEdge === null ? '—' : (g.realizedEdge * 100).toFixed(2) + '%'), h('td', { class: 'num muted small' }, g.theory))))) : h('p', { class: 'muted' }, 'No real-chip rounds yet.')),
    h('p', { class: 'muted small' }, 'Over many rounds the realized edge converges to each game\'s theoretical edge. Small samples swing wildly — that\'s variance, and why short sessions can end ahead.'),
    h('div', { class: 'sec-title' }, h('h2', null, 'Daily house profit')),
    h('div', { class: 'panel' }, r.daily.length ? h('div', { class: 'bars' }, r.daily.map(d => h('div', { class: 'bar-col', title: `${d.day}: ${sgn(d.profit)} over ${d.rounds} rounds` }, h('div', { class: 'bar ' + (d.profit >= 0 ? 'up' : 'down'), style: { height: Math.max(3, Math.abs(d.profit) / maxAbs * 100) + '%' } }), h('div', { class: 'bar-l' }, d.day.slice(5))))) : h('p', { class: 'muted' }, 'Nothing yet.'))), '');
}

// ---------------------------------------------------------------- leaderboards
export async function leadersPage() {
  let mode = store.get('lb.mode', 'net'), period = store.get('lb.period', 'all'), game = store.get('lb.game', '');
  const body = h('div', { class: 'panel' });
  const bar = h('div', { class: 'filters' });
  const modes = [['net', '🏆 Net winnings'], ['rating', '⭐ Skill rating'], ['balance', '🪙 Richest'], ['biggest', '💥 Biggest win']];
  const periods = [['all', 'All time'], ['week', 'This week'], ['today', 'Today']];
  const gameSel = h('select', { 'aria-label': 'Game', style: { maxWidth: '220px' }, onchange: e => { game = e.target.value; store.set('lb.game', game); load(); } }, h('option', { value: '' }, 'All games'), state.games.map(g => h('option', { value: g.id, selected: g.id === game }, g.icon + ' ' + g.name)));
  const medals = ['🥇', '🥈', '🥉'];
  const table = (cols, rows, me) => rows.length ? h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, '#'), cols.map((c, i) => h('th', { class: i ? 'num' : '' }, c)))),
    h('tbody', null, rows.map((row, i) => h('tr', { class: row[0] === me ? 'me' : '' }, h('td', null, i < 3 ? h('span', { class: 'medal' }, medals[i]) : i + 1), row.map((c, j) => h('td', { class: (j ? 'num ' : '') + (c && c.c ? c.c : '') }, c && c.v !== undefined ? c.v : c)))))) : h('p', { class: 'muted' }, 'No results yet — be the first on the board!');
  const tierOf = r => { const T = [[2200, 'Grandmaster 👑'], [2000, 'Master 🏆'], [1800, 'Expert 💎'], [1600, 'Advanced 🥇'], [1400, 'Skilled 🥈'], [1200, 'Regular 🥉'], [1000, 'Novice 🎯'], [0, 'Rookie 🌱']]; return T.find(([m]) => r >= m)[1]; };
  const load = async () => {
    body.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
    const q = new URLSearchParams(); if (game) q.set('game', game); else if (['all', 'week', 'today'].includes(period)) q.set('period', period);
    const r = await api('/leaderboard?' + q);
    let out;
    if (mode === 'rating') {
      out = [h('p', { class: 'muted small' }, 'Chess-style Elo from how accurate your decisions are, using only information you could see. Play with the coach off to be rated. ' + (game ? 'Minimum 20 rated decisions.' : 'Overall rating weighs each game by decisions played (minimum 30).')),
        table(['Player', 'Rating', 'Rated decisions'], (r.ratings || []).map(x => [x.username, { v: Math.round(x.rating) + ' · ' + tierOf(x.rating) }, fmt(x.n)]), r.you)];
    } else if (mode === 'balance') out = [table(['Player', 'Chips', 'Peak'], r.balance.map(x => [x.username, fmt(x.balance), fmt(x.peak)]), r.you)];
    else if (mode === 'biggest') out = [table(['Player', 'Biggest single-round win'], (r.biggest || []).filter(x => x.biggest > 0).map(x => [x.username, fmt(x.biggest)]), r.you)];
    else out = [r.yourNet !== undefined && !game ? h('p', { class: 'muted small' }, 'Your lifetime net: ', h('b', { class: r.yourNet >= 0 ? 'win' : 'lose' }, sgn(r.yourNet)), ' chips = everything won back minus everything wagered (hand fees included). Daily free chips and demo play don\'t count.') : null,
      table(['Player', 'Net winnings − losses', 'Rounds'], r.net.map(x => [x.username, { v: sgn(x.net), c: x.net >= 0 ? 'win' : 'lose' }, fmt(x.rounds)]), r.you)];
    body.replaceChildren(...out);
  };
  const draw = () => {
    bar.replaceChildren(...modes.map(([k, l]) => h('button', { class: 'pill' + (k === mode ? ' on' : ''), onclick: () => { mode = k; store.set('lb.mode', k); draw(); load(); } }, l)),
      ...(mode === 'net' && !game ? periods.map(([k, l]) => h('button', { class: 'pill' + (k === period ? ' on' : ''), style: { opacity: .9 }, onclick: () => { period = k; store.set('lb.period', k); draw(); load(); } }, l)) : []), gameSel);
  };
  shell(h('div', null, h('div', { class: 'sec-title' }, h('h1', null, '🏆 Leaderboards'), h('a', { href: '#/house', class: 'muted small' }, 'See how the house is doing →')), bar, body), 'leaders');
  draw(); load();
}

// ---------------------------------------------------------------- profile
export async function profilePage() {
  const u = state.user;
  const [hist, me] = await Promise.all([api('/history'), api('/me')]);
  setUser(me.user);
  const U = me.user, T = U.totals, R = U.ratings || { games: {} };
  const nameIn = h('input', { type: 'text', value: U.display, maxlength: 20, 'aria-label': 'Public name' });
  const msg = h('span', { class: 'small' });
  const rows = Object.entries(U.stats || {}).filter(([g]) => state.byId[g]).sort((a, b) => b[1].rounds - a[1].rounds);
  const rated = Object.entries(R.games || {}).filter(([g, x]) => state.byId[g] && x.n > 0).sort((a, b) => b[1].n - a[1].n);
  const sparkBox = h('div');
  shell(h('div', null,
    h('div', { class: 'sec-title' }, h('h1', null, '📊 ' + U.display)),
    h('div', { class: 'panel' },
      h('h3', null, 'Public name'),
      h('p', { class: 'muted small' }, 'This is the name other players see at tables, in chat and on the leaderboard. Your sign-in username stays private.'),
      h('form', { class: 'row', onsubmit: async e => { e.preventDefault(); msg.textContent = ''; try { const r = await api('/profile', { display: nameIn.value }); setUser(r.user); msg.className = 'small win'; msg.textContent = 'Saved!'; sfx.play('win', 1); } catch (err) { msg.className = 'small lose'; msg.textContent = err.message; } } },
        h('div', { style: { maxWidth: '280px', flex: 1 } }, nameIn), h('button', { class: 'btn gold', type: 'submit' }, 'Save'), msg)),
    h('div', { class: 'grid', style: { marginTop: '14px', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' } },
      [['Balance', fmt(U.balance)], ['Peak balance', fmt(U.peak)], ['Rounds played', fmt(T.rounds)], ['Biggest win', fmt(T.biggest)], ['Net result', sgn(T.returned - T.wagered)], ['Decision accuracy', T.skillTotal ? Math.round(T.skillOk / T.skillTotal * 100) + '%' : '—']].map(([k, v]) =>
        h('div', { class: 'panel center' }, h('div', { class: 'muted small' }, k), h('div', { style: { fontSize: '1.5rem', fontWeight: 800 } }, v)))),
    h('div', { class: 'sec-title' }, h('h2', null, '⭐ Skill rating'), h('span', { class: 'muted small' }, 'Chess-style Elo from how accurate your decisions are')),
    h('div', { class: 'panel' },
      R.overall ? h('div', { class: 'row' }, h('div', { style: { fontSize: '2.4rem', fontWeight: 900 } }, R.tier.icon + ' ' + R.overall), h('div', null, h('b', null, R.tier.name), h('div', { class: 'muted small' }, `${fmt(R.decisions)} rated decisions${R.provisional ? ' · provisional until 30' : ''}`))) : h('p', { class: 'muted' }, 'No rating yet. Switch the coach off in Settings and play skill games (blackjack, video poker, Let It Ride, Three Card Poker, Red Dog…). Decisions made with the coach showing the answer are practice and don\'t count.'),
      rated.length ? h('table', { class: 't', style: { marginTop: '10px' } }, h('thead', null, h('tr', null, ['Game', 'Rating', 'Tier', 'Rated', 'Accuracy', 'Peak'].map((c, i) => h('th', { class: i ? 'num' : '' }, c)))),
        h('tbody', null, rated.map(([g, x]) => h('tr', { style: { cursor: 'pointer' }, onclick: () => showSpark(g) }, h('td', null, state.byId[g].icon + ' ' + state.byId[g].name), h('td', { class: 'num' }, x.rating + (x.provisional ? '?' : '')), h('td', { class: 'num' }, x.tier.icon + ' ' + x.tier.name), h('td', { class: 'num' }, fmt(x.n)), h('td', { class: 'num' }, x.accuracy === null ? '—' : Math.round(x.accuracy * 100) + '%'), h('td', { class: 'num' }, x.peak))))) : null, sparkBox),
    h('div', { class: 'sec-title' }, h('h2', null, 'By game')),
    h('div', { class: 'panel', style: { overflowX: 'auto' } }, rows.length ? h('table', { class: 't' }, h('thead', null, h('tr', null, ['Game', 'Rounds', 'Wagered', 'Net', 'Biggest', 'Skill'].map((c, i) => h('th', { class: i ? 'num' : '' }, c)))),
      h('tbody', null, rows.map(([g, s]) => h('tr', null, h('td', null, state.byId[g].icon + ' ' + state.byId[g].name), h('td', { class: 'num' }, fmt(s.rounds)), h('td', { class: 'num' }, fmt(s.wagered)),
        h('td', { class: 'num ' + (s.returned - s.wagered >= 0 ? 'win' : 'lose') }, sgn(s.returned - s.wagered)), h('td', { class: 'num' }, fmt(s.biggest)), h('td', { class: 'num' }, s.skillTotal ? Math.round(s.skillOk / s.skillTotal * 100) + '%' : '—'))))) : h('p', { class: 'muted' }, 'Play a few rounds and your stats appear here.')),
    h('div', { class: 'sec-title' }, h('h2', null, 'Recent rounds')),
    h('div', { class: 'panel' }, hist.history.length ? h('table', { class: 't' }, h('tbody', null, hist.history.slice(0, 25).map(r => h('tr', null, h('td', null, (state.byId[r.game] || {}).icon + ' ' + ((state.byId[r.game] || {}).name || r.game)), h('td', { class: 'muted small' }, r.summary), h('td', { class: 'num ' + (r.net >= 0 ? 'win' : 'lose') }, sgn(r.net)), h('td', { class: 'num muted small' }, timeAgo(r.ts)))))) : h('p', { class: 'muted' }, 'Nothing yet.')),
    h('div', { class: 'sec-title' }, h('h2', null, 'Preferences')),
    h('div', { class: 'panel row' }, h('p', { class: 'muted small grow', style: { margin: 0 } }, 'Animations, celebrations, sound & volume, chat, coach tips, and the hand fee (house edge) all live in Table settings.'), h('button', { class: 'btn gold', onclick: settingsModal }, '⚙ Open settings'))), '');
  async function showSpark(game) {
    const r = await api('/rating-history?game=' + game); const pts = r.history.map(x => x.rating);
    if (pts.length < 2) { sparkBox.replaceChildren(h('p', { class: 'muted small' }, 'Play more rounds to see your rating curve.')); return; }
    const w = 600, hgt = 120, lo = Math.min(...pts) - 10, hi = Math.max(...pts) + 10;
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${(i / (pts.length - 1) * w).toFixed(1)} ${(hgt - (p - lo) / (hi - lo) * hgt).toFixed(1)}`).join(' ');
    const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`); svg.setAttribute('class', 'spark');
    const pe = document.createElementNS(ns, 'path'); pe.setAttribute('d', path); pe.setAttribute('fill', 'none'); pe.setAttribute('stroke', '#f2c14e'); pe.setAttribute('stroke-width', '2.5'); svg.append(pe);
    sparkBox.replaceChildren(h('div', { class: 'muted small', style: { marginTop: '10px' } }, `${state.byId[game].name} rating over your last ${pts.length} rounds (${Math.round(lo + 10)} → ${Math.round(pts[pts.length - 1])})`), svg);
  }
}
