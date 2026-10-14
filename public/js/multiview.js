// Multi-view: watch several tables at once (like a sports multiview). One multiplexed SSE connection feeds every tile.
import { api, state } from './api.js';
import { h, clear, fmt, sgn, toast, btn, store, badge } from './ui.js';
import { sfx } from './sfx.js';
import { animOn } from './fx.js';
import { go } from './app.js';

const MAX = 6;
export async function multiPage(shell, onLeave) {
  let codes = store.get('mv.codes', []).filter(c => /^[A-Z0-9]{6}$/.test(c)).slice(0, MAX);
  const tiles = new Map();
  const grid = h('div', { class: 'mv-grid' });
  const status = h('div', { class: 'muted small' });
  let es = null, token = 0;
  sfx.quiet = true;                                   // a wall of tables would be a wall of noise
  onLeave(() => { if (es) es.close(); sfx.quiet = false; });

  const sourceSel = h('select', { 'aria-label': 'Add a table', style: { maxWidth: '260px' } }, h('option', { value: '' }, 'Add a table…'));
  const codeIn = h('input', { type: 'text', placeholder: 'or enter a code', maxlength: 9, style: { maxWidth: '150px', textTransform: 'uppercase' }, 'aria-label': 'Table code' });
  const add = code => { code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length !== 6) return toast('Enter a 6-character table code.', 'bad'); if (codes.includes(code)) return toast('Already on the wall.'); if (codes.length >= MAX) return toast(`The wall holds ${MAX} tables.`, 'bad'); codes.push(code); save(); connect(); };
  const save = () => store.set('mv.codes', codes);
  const controls = h('div', { class: 'row', style: { margin: '8px 0' } }, sourceSel, btn('Add', 'gold', () => { add(sourceSel.value); sourceSel.value = ''; }), codeIn, btn('Add code', '', () => { add(codeIn.value); codeIn.value = ''; }),
    btn('🤖 Fill with bot tables', '', async () => { const a = (await api('/arena')).arena.filter(x => !codes.includes(x.code)); const pick = a.sort(() => Math.random() - .5).slice(0, MAX - codes.length); codes.push(...pick.map(x => x.code)); save(); connect(); }),
    btn('Clear wall', 'ghost', () => { codes = []; save(); connect(); }));
  shell(h('div', null, h('div', { class: 'sec-title' }, h('div', null, h('h1', null, '📺 Multi-view'), h('div', { class: 'muted' }, 'Watch up to six tables at once. Sound is muted here; click a tile\'s title to open it full screen.'))), controls, status, grid), 'lobby');

  // sources
  (async () => {
    try {
      const [ar, lb] = await Promise.all([api('/arena'), api('/lobby')]);
      const og = (label, items) => h('optgroup', { label }, items.map(([v, t]) => h('option', { value: v }, t)));
      sourceSel.append(og('🤖 Bot tables (always on)', ar.arena.map(a => [a.code, `${a.icon} ${a.name}`])),
        og('👥 Live public tables', lb.games.flatMap(g => g.tables.map(t => [t.code, `${g.icon} ${g.name} · ${t.players}/${t.capacity} · ${t.code}`]))));
    } catch {}
  })();

  function removeTile(code) { codes = codes.filter(c => c !== code); save(); connect(); }

  async function ensureTile(code, snap) {
    let t = tiles.get(code);
    if (t) return t;
    const g = state.byId[snap.game];
    const mod = (await import(`./games/${snap.game}.js`)).default;
    const stage = h('div', { class: 'felt readonly' });
    const foot = h('div', { class: 'mv-foot' });
    const head = h('div', { class: 'mv-head' }, h('a', { href: `#/t/${code}/watch`, style: { color: 'inherit', fontWeight: 800, textDecoration: 'none' } }, g.icon + ' ' + g.name), badge(snap.bot ? '🤖 bots' : snap.public ? 'public' : 'private', snap.bot ? 'gold' : 'green'), h('span', { class: 'muted small' }, code), h('button', { class: 'x', title: 'Remove from wall', onclick: () => removeTile(code) }, '✕'));
    const body = h('div', { class: 'mv-body' }, h('div', { class: 'mv-scale', style: { transform: 'scale(.5555)' } }, stage));
    const el = h('div', { class: 'mv-tile' }, head, body, foot);
    t = { code, g, mod, stage, foot, el, snap, who: null, sc: null, shown: false };
    const view = {};
    const sc = Object.create({});
    Object.assign(sc, { id: g.id, game: g, mod, stage, readonly: true, table: null, view, coachNode: null, tab: null, busy: false, user: state.user, toast() {}, sfx, setCoach() {}, showReview() {}, coachOn: () => false, sitting: false, call: async () => null, primary: async () => null, refresh: async () => {}, tableCall: async () => ({}), lastReviewJson: '' });
    t.sc = sc; t.inited = false; t.simul = g.shared.mode === 'simul';
    tiles.set(code, t); grid.append(el);
    return t;
  }
  function paint(t, snap) {
    t.snap = snap;
    try {
      if (t.simul) {
        if (t.mod.spectate) { t.mod.spectate(t.sc, snap); }
        else { t.stage.replaceChildren(h('div', { class: 'banner-result' }, snap.outcome ? (snap.outcome.text || 'Result: ' + snap.outcome.n) : 'Waiting for the first round…'), h('div', { class: 'rl-hist' }, (snap.history || []).map(x => x && x.c ? h('span', { class: x.c }, x.n) : null))); }
        t.foot.replaceChildren(h('span', null, `Round ${snap.round}`), h('span', { class: 'muted' }, `· ${snap.players.length} players`), snap.outcome ? h('b', { class: 'gold' }, snap.outcome.text || '') : null);
      } else {
        const names = snap.players.filter(p => !p.banker).map(p => p.name);
        if (!t.who || !names.includes(t.who)) { t.who = names[0] || null; t.sc.__who = null; }
        const pv = t.who && snap.pviews ? snap.pviews[t.who] : null;
        if (pv) {
          if (!t.inited || t.sc.__who !== t.who) { t.stage.replaceChildren(); t.sc._seeded = null; t.mod.init(t.sc); t.inited = true; t.sc.__who = t.who; }
          t.mod.render(pv, t.sc);
        } else t.stage.replaceChildren(h('p', { class: 'center muted' }, t.who ? `Waiting for ${t.who}…` : 'Nobody is seated.'));
        const idx = names.indexOf(t.who), f = (snap.feed || []).slice(-1)[0];
        t.foot.replaceChildren(h('button', { class: 'btn xs', onclick: () => { t.who = names[(idx + 1) % names.length]; t.sc.__who = null; paint(t, t.snap); } }, '⇄ ' + (t.who || '—')), f ? h('span', { class: f.net >= 0 ? 'win' : 'lose' }, `${f.name}: ${f.headline} ${sgn(f.net)}`) : h('span', { class: 'muted' }, snap.bot && !snap.players.length ? 'starting…' : ''));
      }
    } catch (e) { console.error(e); }
  }

  function connect() {
    if (es) es.close();
    for (const [code, t] of [...tiles]) if (!codes.includes(code)) { t.el.remove(); tiles.delete(code); }
    status.textContent = codes.length ? '' : 'The wall is empty — add a table above, or use “Fill with bot tables”.';
    if (!codes.length) return;
    const my = ++token;
    es = new EventSource('/api/multi?codes=' + codes.join(','));
    es.addEventListener('state', async e => { if (my !== token) return; const m = JSON.parse(e.data); const t = await ensureTile(m.code, m.d); paint(t, m.d); });
    es.addEventListener('result', async e => { if (my !== token) return; const m = JSON.parse(e.data), t = tiles.get(m.code); if (t && animOn() && t.mod.onResult && t.simul) { try { await t.mod.onResult(t.sc, m.d); } catch {} } });
    es.onerror = () => { /* auto-retry */ };
  }
  connect();
}
