'use strict';
// Kick chat bot for the 24/7 stream: chat commands (!game switches the on-air table), follow/sub/gift alerts on the stream scene,
// and the casino link posted every so often. Uses Kick's public API: one OAuth (PKCE) connect by the channel owner, signed webhooks in.
//   env: KICK_CLIENT_ID, KICK_CLIENT_SECRET, KICK_CHANNEL (the channel the bot may be connected to), PUBLIC_URL,
//        KICK_LINK_MIN (link post interval, 20), KICK_SWITCH_COOLDOWN_MIN (10), KICK_OVERRIDE_MIN (how long a !game pick stays, 60),
//        KICK_RELAY_KEY (shared key for stream/relay.js, which forwards chat commands when Kick's chat webhook doesn't deliver)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const API = 'https://api.kick.com', ID = 'https://id.kick.com';
const SCOPES = 'user:read channel:read chat:write events:subscribe';
const EVENTS = ['chat.message.sent', 'channel.followed', 'channel.subscription.new', 'channel.subscription.renewal', 'channel.subscription.gifts', 'kicks.gifted'];
const FILE = path.join(process.env.CASINO_DATA || path.join(__dirname, '..', 'data'), 'kick.json');
const num = (k, d) => Math.max(0, Number(process.env[k] || d));
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = { bj: 'blackjack', '21': 'blackjack', poker: 'holdem', texas: 'holdem', texasholdem: 'holdem', '3card': 'threecard', threecardpoker: 'threecard', ride: 'letitride', casinowar: 'war', dice: 'sicbo', moneywheel: 'wheel', bigsix: 'wheel' };
const CREDIT = 'Music: Kevin MacLeod (incompetech.com) — licensed under Creative Commons: By Attribution 4.0 (creativecommons.org/licenses/by/4.0)';

module.exports = function kick({ streamNow, streamList, games, streamctl }) {
  const URL_ = (process.env.PUBLIC_URL || 'https://casino.hackatoa.com').replace(/\/$/, '');
  const conf = () => process.env.KICK_CLIENT_ID && process.env.KICK_CLIENT_SECRET && process.env.KICK_CHANNEL;
  let tok = null; try { tok = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  const save = () => { fs.writeFileSync(FILE, JSON.stringify(tok), { mode: 0o600 }); };
  const pending = new Map();           // oauth state -> { verifier, at }
  const seen = new Map();              // webhook message id -> time (Kick retries; handle each once)
  let pubKey = null;

  // ---------- tokens + API ----------
  async function tokenCall(form) {
    const r = await fetch(ID + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.KICK_CLIENT_ID, client_secret: process.env.KICK_CLIENT_SECRET, ...form }) });
    if (!r.ok) throw new Error(`token ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  }
  async function access() {
    if (!tok) return null;
    if (tok.expiresAt - 120e3 < Date.now()) { Object.assign(tok, await tokenCall({ grant_type: 'refresh_token', refresh_token: tok.refresh })); save(); }
    return tok.access;
  }
  async function call(method, p, body, retried) {
    const a = await access(); if (!a) throw new Error('kick not connected');
    const r = await fetch(API + p, { method, headers: { Authorization: 'Bearer ' + a, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && !retried) { tok.expiresAt = 0; return call(method, p, body, true); }
    if (!r.ok) throw new Error(`${method} ${p} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : r.json();
  }
  async function ensureSubs() {
    if (!tok) return;
    try {
      const have = new Set(((await call('GET', '/public/v1/events/subscriptions')).data || []).map(s => s.event));
      const missing = EVENTS.filter(e => !have.has(e));
      if (missing.length) { await call('POST', '/public/v1/events/subscriptions', { method: 'webhook', events: missing.map(name => ({ name, version: 1 })) }); console.log('kick: subscribed', missing.join(', ')); }
    } catch (e) { console.error('kick: subscriptions', e.message); }
  }

  // ---------- chat out (queued: Kick rate-limits bursts) ----------
  const outq = []; let sending = false;
  function say(text) {
    if (!tok) return;
    outq.push(String(text).slice(0, 480)); if (outq.length > 8) outq.shift();
    if (!sending) pump();
  }
  // 'bot' messages need a bot identity attached to the app; without one Kick answers 404, so fall back to posting as the channel itself
  let asUser = false;
  async function post(content) {
    if (!asUser) {
      try { return await call('POST', '/public/v1/chat', { type: 'bot', content }); }
      catch (e) { if (!/ 404:/.test(e.message)) throw e; asUser = true; console.log('kick: no bot identity on this app, chatting as the channel'); }
    }
    return call('POST', '/public/v1/chat', { type: 'user', broadcaster_user_id: tok.userId, content });
  }
  async function pump() {
    sending = true;
    while (outq.length) {
      try { await post(outq.shift()); } catch (e) { console.error('kick: chat', e.message); }
      await new Promise(r => setTimeout(r, 1500));
    }
    sending = false;
  }

  // ---------- commands ----------
  const findGame = q => {
    const list = streamList(), n = ALIASES[norm(q)] || norm(q);
    if (!n) return null;
    return list.find(g => g === n || norm(games[g].name) === n) || list.find(g => g.startsWith(n) || norm(games[g].name).startsWith(n)) || null;
  };
  const gameNames = () => streamList().map(g => games[g].name).join(', ');
  const isMod = s => s && s.identity && (s.identity.badges || []).some(b => ['moderator', 'broadcaster'].includes(b.type));
  function command(msg) {
    const text = String(msg.content || '').trim(), sender = msg.sender || {}, who = sender.username || 'someone';
    const m = text.match(/^!(\w+)\s*(.*)$/); if (!m) return;
    const cmd = m[1].toLowerCase(), arg = m[2].trim();
    if (cmd === 'game' || cmd === 'table' || cmd === 'switch') {
      const now = streamNow();
      if (!arg) return say(`Now playing: ${now.icon} ${now.name}. Switch with !game <name> — choices: ${gameNames()}`);
      const g = findGame(arg);
      if (!g) return say(`@${who} I don't know "${arg.slice(0, 30)}". Choices: ${gameNames()}`);
      if (g === now.game && !now.live) return say(`@${who} ${games[g].name} is already on!`);
      const wait = streamctl.state.lastSwitch + num('KICK_SWITCH_COOLDOWN_MIN', 10) * 60e3 - Date.now();
      if (wait > 0 && !isMod(sender)) return say(`@${who} the table was just switched — try again in ${Math.ceil(wait / 60e3)} min.`);
      const mins = num('KICK_OVERRIDE_MIN', 60);
      streamctl.setOverride(g, mins);
      streamctl.emit('alert', { kind: 'switch', user: who, text: `switched the table to ${games[g].icon} ${games[g].name}` });
      return say(now.live ? `🎲 @${who} picked ${games[g].name} — it goes on as soon as the real players at the current table leave.` : `🎲 @${who} switched the table to ${games[g].icon} ${games[g].name} for the next ${mins} min!`);
    }
    if (cmd === 'games') return say(`Tables: ${gameNames()} — type !game <name> to switch.`);
    if (['play', 'link', 'casino', 'site'].includes(cmd)) return say(`🎰 Play free (play-money chips, no deposits ever): ${URL_}`);
    if (cmd === 'music' || cmd === 'song') return say(CREDIT);
    if (cmd === 'help' || cmd === 'commands') return say('Commands: !game <name> (switch table) · !games · !play (casino link) · !music');
  }

  // ---------- alerts ----------
  let lastThanks = 0;
  const thank = text => { if (Date.now() - lastThanks > 15e3) { lastThanks = Date.now(); say(text); } };      // a follow-bot raid can't flood chat
  function handle(type, d) {
    if (type === 'chat.message.sent') return command(d);
    if (type === 'channel.followed') { const u = d.follower && d.follower.username; streamctl.emit('alert', { kind: 'follow', user: u, text: 'just followed!' }); return thank(`💚 Thanks for the follow, @${u}! Type !play to grab free chips.`); }
    if (type === 'channel.subscription.new' || type === 'channel.subscription.renewal') {
      const u = d.subscriber && d.subscriber.username, n = Number(d.duration) || 1;
      streamctl.emit('alert', { kind: 'sub', user: u, text: type.endsWith('new') ? 'just subscribed!' : `resubscribed — ${n} months!` });
      return say(`🎉 @${u} ${type.endsWith('new') ? 'just subscribed' : `resubscribed for ${n} months`} — thank you!`);
    }
    if (type === 'channel.subscription.gifts') {
      const u = d.gifter && !d.gifter.is_anonymous ? d.gifter.username : 'Anonymous', n = (d.giftees || []).length || 1;
      streamctl.emit('alert', { kind: 'gift', user: u, text: `gifted ${n} sub${n > 1 ? 's' : ''}!` });
      return say(`🎁 ${u} gifted ${n} sub${n > 1 ? 's' : ''} — legend!`);
    }
    if (type === 'kicks.gifted') {
      const u = d.sender && d.sender.username, g = d.gift || {};
      streamctl.emit('alert', { kind: 'kicks', user: u, text: `sent ${Number(g.amount) || ''} Kicks${g.name ? ' — ' + g.name : ''}!`, message: String(g.message || '').slice(0, 120) });
      return say(`💎 @${u} sent ${Number(g.amount) || ''} Kicks — thank you!`);
    }
  }

  // ---------- webhook (RSA-SHA256 over "id.timestamp.body", key from Kick's public-key endpoint) ----------
  async function key(fresh) {
    if (pubKey && !fresh) return pubKey;
    const r = await fetch(API + '/public/v1/public-key'); const j = await r.json();
    pubKey = j.data && j.data.public_key; return pubKey;
  }
  async function verified(id, ts, body, sig) {
    if (!id || !ts || !sig) return false;
    if (Math.abs(Date.now() - Date.parse(ts)) > 10 * 60e3) return false;              // stale or replayed
    const data = Buffer.from(`${id}.${ts}.${body}`), s = Buffer.from(sig, 'base64');
    try { if (crypto.verify('sha256', data, await key(), s)) return true; } catch {}
    try { return crypto.verify('sha256', data, await key(true), s); } catch { return false; }  // Kick may rotate the key
  }
  function rawBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []; let n = 0;
      req.on('data', c => { n += c.length; if (n > 65536) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); req.on('error', reject);
    });
  }
  async function webhook(req, res) {
    let body; try { body = await rawBody(req); } catch { res.writeHead(413); return res.end(); }
    const h = req.headers, id = h['kick-event-message-id'];
    if (!(await verified(id, h['kick-event-message-timestamp'], body, h['kick-event-signature']))) {
      console.warn(`kick: rejected webhook ${h['kick-event-type'] || '?'} (id ${id ? 'ok' : 'missing'}, ts ${h['kick-event-message-timestamp'] || 'missing'}, sig ${h['kick-event-signature'] ? 'present' : 'missing'})`);
      res.writeHead(401); return res.end();
    }
    res.writeHead(200); res.end();
    console.log('kick: event', h['kick-event-type']);
    if (seen.has(id)) return; seen.set(id, Date.now());
    let d; try { d = JSON.parse(body); } catch { return; }
    if (d.message_id) { if (seen.has(d.message_id)) return; seen.set(d.message_id, Date.now()); }        // the relay may have handled this chat line already
    if (tok && d.broadcaster && d.broadcaster.user_id && tok.userId && d.broadcaster.user_id !== tok.userId) return;   // some other channel
    try { handle(String(h['kick-event-type'] || ''), d); } catch (e) { console.error('kick: event', e.message); }
  }

  // ---------- chat relay: Kick often doesn't deliver chat.message.sent webhooks (KickDevDocs #147), so stream/relay.js polls the public
  // chat history from a home IP (Kick 403s datacenters) and posts !commands here. Same message shape as the webhook; ids dedupe the two paths.
  async function relay(req, res) {
    const want = process.env.KICK_RELAY_KEY || '', got = String(req.headers['x-relay-key'] || '');
    if (!want || got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) { res.writeHead(401); return res.end(); }
    let list; try { list = JSON.parse(await rawBody(req)).messages; } catch { res.writeHead(400); return res.end(); }
    res.writeHead(204); res.end();
    for (const m of (Array.isArray(list) ? list : []).slice(0, 20)) {
      if (!m || !m.id || seen.has(m.id)) continue; seen.set(m.id, Date.now());
      try { command(m); } catch (e) { console.error('kick: relay', e.message); }
    }
  }

  // ---------- one-time connect by the channel owner ----------
  const page = (res, status, msg) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(msg); };
  function connect(res) {
    if (!conf()) return page(res, 503, 'Kick is not configured on this server (KICK_CLIENT_ID / KICK_CLIENT_SECRET / KICK_CHANNEL).');
    const verifier = crypto.randomBytes(48).toString('base64url'), state = crypto.randomBytes(16).toString('base64url');
    for (const [k, v] of pending) if (Date.now() - v.at > 600e3) pending.delete(k);
    pending.set(state, { verifier, at: Date.now() });
    const q = new URLSearchParams({ client_id: process.env.KICK_CLIENT_ID, response_type: 'code', redirect_uri: URL_ + '/api/kick/callback', scope: SCOPES, state,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    res.writeHead(302, { Location: ID + '/oauth/authorize?' + q, 'Cache-Control': 'no-store' }); res.end();
  }
  async function callback(res, url) {
    const st = pending.get(url.searchParams.get('state') || ''); pending.delete(url.searchParams.get('state') || '');
    if (!conf() || !st || !url.searchParams.get('code')) return page(res, 400, 'That sign-in link expired — start again at /api/kick/connect.');
    try {
      const t = await tokenCall({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: URL_ + '/api/kick/callback', code_verifier: st.verifier });
      const me = await (await fetch(API + '/public/v1/users', { headers: { Authorization: 'Bearer ' + t.access } })).json();
      const u = me.data && me.data[0];
      if (!u || norm(u.name) !== norm(process.env.KICK_CHANNEL)) return page(res, 403, `Signed in as ${u ? u.name : 'unknown'}, but this bot only runs for ${process.env.KICK_CHANNEL}.`);
      tok = { ...t, userId: u.user_id, name: u.name }; save();
      await ensureSubs();
      say('🎰 Casino bot online — type !help for commands.');
      return page(res, 200, `Connected as ${u.name}. Chat commands, alerts and link posts are live. You can close this tab.`);
    } catch (e) { console.error('kick: callback', e.message); return page(res, 502, 'Kick sign-in failed: ' + e.message); }
  }

  // ---------- timers ----------
  const LINES = [
    `🎰 Play these tables yourself — free play-money chips, no deposits: ${URL_}`,
    `🎲 Pick the next table! Type !game <name> — try !games for the list.`,
    `🃏 Every game has a built-in strategy coach. Learn to play right: ${URL_}`,
  ];
  let li = 0;
  const linkMin = num('KICK_LINK_MIN', 20);
  if (linkMin > 0) setInterval(() => { if (tok) say(LINES[li++ % LINES.length]); }, linkMin * 60e3).unref();
  setInterval(() => { for (const [k, t] of seen) if (Date.now() - t > 3600e3) seen.delete(k); }, 600e3).unref();
  setInterval(ensureSubs, 6 * 3600e3).unref();            // Kick drops subscriptions after a day of failed deliveries
  if (tok) setTimeout(ensureSubs, 5000).unref();

  return {
    say, handle,
    route(req, res, url) {
      const p = url.pathname, m = req.method;
      if (m === 'POST' && p === '/api/kick/webhook') return webhook(req, res);
      if (m === 'POST' && p === '/api/kick/relay') return relay(req, res);
      if (m === 'GET' && p === '/api/kick/connect') return connect(res);
      if (m === 'GET' && p === '/api/kick/callback') return callback(res, url);
      if (m === 'GET' && p === '/api/kick/status') return page(res, 200, tok ? `connected as ${tok.name}` : conf() ? 'not connected — open /api/kick/connect' : 'not configured');
      return page(res, 404, 'not found');
    },
  };
};
