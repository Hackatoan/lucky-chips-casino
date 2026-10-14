'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { stmt, tx } = require('./lib/db');
const engine = require('./lib/engine');
const games = require('./games');
const cfg = require('./lib/config');
const filter = require('./lib/filter');
const tables = require('./lib/tables');
const rating = require('./lib/rating');
const bots = require('./lib/bots');
const fbauth = require('./lib/fbauth');

const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '0.0.0.0';
const { TZ } = require('./lib/clock');
const DAILY = Number(process.env.DAILY_CHIPS || 1000);
const PUB = path.join(__dirname, 'public');
const SESSION_DAYS = 30;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

// ---------- helpers ----------
const { dayKey } = require('./lib/clock');
function msSinceMidnight() { return 86400e3 - msToNextDay(); }
function msToNextDay() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  const secs = (Number(p.hour) % 24) * 3600 + Number(p.minute) * 60 + Number(p.second);
  return (86400 - secs) * 1000;
}
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex'); }
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function parseCookies(h) {
  const o = {};
  for (const part of String(h || '').split(';')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return o;
}
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
function isHttps(req) { return req.headers['x-forwarded-proto'] === 'https'; }

// naive in-memory throttle for auth endpoints
const attempts = new Map();
function throttle(key, max, windowMs) {
  if (process.env.CASINO_NO_THROTTLE) return true;   // local test sweeps only
  const now = Date.now();
  const a = (attempts.get(key) || []).filter(t => now - t < windowMs);
  if (a.length >= max) { attempts.set(key, a); return false; }
  a.push(now); attempts.set(key, a); return true;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of attempts) if (!v.some(t => now - t < 3600e3)) attempts.delete(k); stmt.sessPurge.run(now); }, 600e3).unref();

function json(res, status, obj, headers = {}) {
  let body = Buffer.from(JSON.stringify(obj));
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers };
  if (body.length > 1400 && /\bgzip\b/.test(String(res.req && res.req.headers['accept-encoding'] || ''))) { body = zlib.gzipSync(body, { level: 6 }); h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding'; }
  h['Content-Length'] = body.length;
  res.writeHead(status, h);
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 20000) { reject(new engine.GameError('Request too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { const o = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(o && typeof o === 'object' ? o : {}); }
      catch { reject(new engine.GameError('Bad JSON.')); }
    });
    req.on('error', reject);
  });
}

function authUser(req) {
  const tok = parseCookies(req.headers.cookie).sid;
  if (!tok) return null;
  const s = stmt.sessGet.get(sha(tok));
  if (!s || s.expires < Date.now()) return null;
  return stmt.userById.get(s.user_id) || null;
}
function startSession(res, req, userId) {
  const tok = crypto.randomBytes(32).toString('hex');
  stmt.sessIns.run(sha(tok), userId, Date.now() + SESSION_DAYS * 864e5);
  const cookie = `sid=${tok}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${isHttps(req) ? '; Secure' : ''}`;
  return { 'Set-Cookie': cookie };
}

function suggestDisplay(claims) {
  let base = String(claims.name || (claims.email || 'player').split('@')[0] || 'player').normalize('NFKD').replace(/[^A-Za-z0-9_ ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (base.length < 3) base = 'Player';
  for (let i = 0; i < 30; i++) {
    const cand = i === 0 ? base : (base.slice(0, 16) + (10 + Math.floor(Math.random() * 990))).slice(0, 20);
    if (!checkDisplay(cand, 0)) return cand;
  }
  return 'Player' + crypto.randomInt(1000, 99999);
}
// Sign in (or first-time create) a local account from a verified Firebase identity.
function fbSignIn(claims, display) {
  return tx(() => {
    let u = stmt.userByFb.get(claims.uid);
    const today = dayKey();
    if (u) {
      stmt.updFb.run(claims.email, claims.verified ? 1 : 0, claims.provider, u.id);
      let welcome = false;
      if (claims.verified && !u.welcome) { stmt.grantWelcome.run(DAILY, DAILY, today, Date.now(), u.id); welcome = true; }
      return { user: stmt.userById.get(u.id), welcome, created: false };
    }
    const name = String(display || '').trim().replace(/\s+/g, ' ');
    if (!name) return { needsDisplay: true, suggestion: suggestDisplay(claims), error: 'Choose a public name to finish creating your account.', status: 200 };
    const dErr = checkDisplay(name, 0);
    if (dErr) return { error: dErr, needsDisplay: true, suggestion: suggestDisplay(claims) };
    const username = 'fb_' + crypto.randomBytes(5).toString('hex');
    const verified = claims.verified;
    const r = stmt.insertFbUser.run(username, name, 'x', '!', verified ? DAILY : 0, verified ? today : '', 0, Date.now(), verified ? DAILY : 0, claims.uid, claims.email, verified ? 1 : 0, claims.provider, verified ? 1 : 0);
    if (verified) stmt.claim.run(0, today, Date.now(), 0, Number(r.lastInsertRowid));      // stamps the 6-hour claim cool-down
    return { user: stmt.userById.get(Number(r.lastInsertRowid)), welcome: verified, created: true };
  });
}

function checkDisplay(name, selfId) {
  if (!/^[A-Za-z0-9_ ]{3,20}$/.test(name) || name !== name.trim()) return 'Public name must be 3–20 characters: letters, numbers, spaces or underscores.';
  if (!filter.nameIsClean(name)) return 'That public name isn\'t allowed — please pick something family-friendly.';
  if (stmt.displayTaken.get(name, selfId)) return 'That public name is already in use.';
  return null;
}

function recentFor(u) {
  const rows = stmt.recentGames.all(u.id);
  const running = new Set();
  for (const r of stmt.gsAll.all(u.id)) {
    const g = games[r.game];
    if (!g || !g.inProgress || !r.json) continue;
    try { if (g.inProgress(JSON.parse(r.json).s)) running.add(r.game); } catch {}
  }
  const out = rows.filter(r => games[r.game]).map(r => ({ game: r.game, ts: r.ts, rounds: r.n, net: r.net, inProgress: running.has(r.game) }));
  for (const id of running) if (!out.some(o => o.game === id)) out.unshift({ game: id, ts: Date.now(), rounds: 0, net: 0, inProgress: true });
  out.sort((a, b) => (b.inProgress - a.inProgress) || (b.ts - a.ts));
  return out.slice(0, 6);
}

function publicUser(u) {
  const today = dayKey();
  const needsVerify = !!(u.fb_uid && !u.email_verified);
  const canClaim = !needsVerify && u.last_claim !== today && Date.now() - (u.last_claim_ts || 0) >= 6 * 3600e3;
  const stats = stmt.statsAll.all(u.id);
  let rounds = 0, wagered = 0, returned = 0, biggest = 0, ok = 0, total = 0;
  for (const s of stats) { rounds += s.rounds; wagered += s.wagered; returned += s.returned; biggest = Math.max(biggest, s.biggest); ok += s.skill_ok; total += s.skill_total; }
  let settings = {}; try { settings = JSON.parse(u.settings || '{}'); } catch {}
  return {
    ratings: rating.forUser(u.id), recent: recentFor(u), fee: cfg.effectiveFee(settings), feeLocked: cfg.LOCK, feeLimits: cfg.LIMITS,
    rules: Object.fromEntries(Object.values(games).filter(g => cfg.optionsOf(g).length).map(g => [g.id, cfg.resolveRules(g, settings)])),
    email: u.email || null, provider: u.provider || (u.fb_uid ? 'firebase' : 'username'), needsVerify,
    username: u.username, display: u.display || u.username, displayChangedAt: u.display_changed || 0, balance: u.balance, peak: u.peak, created: u.created, canClaim,
    daily: DAILY, demoBalance: u.demo_balance, nextClaimMs: canClaim ? 0 : Math.max(msToNextDay(), Math.max(0, 6 * 3600e3 - (Date.now() - (u.last_claim_ts || 0)))), claims: u.claims, settings,
    totals: { rounds, wagered, returned, biggest, skillOk: ok, skillTotal: total },
    stats: Object.fromEntries(stats.map(s => [s.game, { rounds: s.rounds, wagered: s.wagered, returned: s.returned, biggest: s.biggest, skillOk: s.skill_ok, skillTotal: s.skill_total }])),
  };
}

let catalogCache = null;
function catalog() {
  if (catalogCache) return catalogCache;
  return catalogCache = Object.values(games).map(g => ({
    id: g.id, name: g.name, icon: g.icon, category: g.category, skill: g.skill, blurb: g.blurb, edge: g.edge, meta: g.meta,
    shared: g.shared ? { max: g.shared.max, secs: g.shared.secs, repeat: !!g.shared.repeat, primary: g.shared.primary, mode: g.shared.mode, bankable: !!g.shared.exposure } : null,
  }));
}

// ---------- API ----------
async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (m === 'GET' && p === '/api/learn/examples') return json(res, 200, require('./lib/examples').all());
  if (m === 'GET' && p === '/api/learn/bj-chart') return json(res, 200, games.blackjack._t.chartData());
  if (m === 'GET' && p === '/api/games') return json(res, 200, { games: catalog(), tz: TZ, repo: process.env.GITHUB_REPO || 'Hackatoan/lucky-chips-casino' });
  if (m === 'GET' && p === '/api/health') return json(res, 200, { ok: true, users: stmt.userCount.get().n });

  if (m === 'GET' && p === '/api/config') return json(res, 200, { firebase: fbauth.WEB_CONFIG, local: process.env.LOCAL_AUTH !== '0' });

  if (m === 'POST' && p === '/api/auth/firebase') {
    const ip = clientIp(req);
    if (!throttle('auth:' + ip, 30, 600e3)) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    const b = await readBody(req);
    let claims;
    try { claims = await fbauth.verifyIdToken(b.idToken); }
    catch (e) { return json(res, e.status || 401, { error: e.message || 'Could not verify your sign-in.' }); }
    const r = fbSignIn(claims, b.display);
    if (r.error) return json(res, r.status || 400, { error: r.error, needsDisplay: r.needsDisplay, suggestion: r.suggestion });
    return json(res, 200, { user: publicUser(r.user), welcome: r.welcome, created: r.created }, startSession(res, req, r.user.id));
  }

  if (m === 'POST' && (p === '/api/register' || p === '/api/login')) {
    const ip = clientIp(req);
    if (!throttle('auth:' + ip, 20, 600e3)) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    const b = await readBody(req);
    const username = String(b.username || '').trim();
    const password = String(b.password || '');
    if (p === '/api/register') {
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return json(res, 400, { error: 'Username must be 3–20 letters, numbers or underscores.' });
      if (password.length < 6 || password.length > 200) return json(res, 400, { error: 'Password must be at least 6 characters.' });
      if (!/^(127\.|::1)/.test(ip) && !throttle('reg:' + ip, Number(process.env.REG_PER_HOUR || 5), 3600e3)) return json(res, 429, { error: 'Too many new accounts from this address. Try later.' });
      if (stmt.userByName.get(username)) return json(res, 400, { error: 'That username is taken.' });
      const display = String(b.display || username).trim().replace(/\s+/g, ' ');
      const dErr = checkDisplay(display, 0);
      if (dErr) return json(res, 400, { error: dErr });
      const salt = crypto.randomBytes(16).toString('hex');
      const r = stmt.insertUser.run(username, display, salt, hashPw(password, salt), DAILY, dayKey(), Date.now(), DAILY);
      const headers = startSession(res, req, Number(r.lastInsertRowid));
      return json(res, 200, { user: publicUser(stmt.userById.get(Number(r.lastInsertRowid))), welcome: true }, headers);
    }
    const u = stmt.userByName.get(username);
    const dummy = '0'.repeat(32);
    const calc = hashPw(password, u ? u.salt : dummy);
    if (!u || u.fb_uid || u.hash.length !== calc.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(u.hash))) return json(res, 401, { error: u && u.fb_uid ? 'That account signs in with Google or email — use the matching option.' : 'Wrong username or password.' });
    return json(res, 200, { user: publicUser(u) }, startSession(res, req, u.id));
  }

  if (m === 'POST' && p === '/api/logout') {
    const tok = parseCookies(req.headers.cookie).sid;
    if (tok) stmt.sessDel.run(sha(tok));
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
  }

  // public, read-only spectating (no account): watch links and the /embed view
  const pm = p.match(/^\/api\/pub\/table\/([A-Za-z0-9]{6})(?:\/(stream))?$/);
  if (pm && m === 'GET') {
    const ip = clientIp(req);
    if (!throttle('pub:' + ip, 90, 60e3)) return json(res, 429, { error: 'Easy there — too many requests.' });
    const t = tables.get(pm[1]);
    if (!t) return json(res, 404, { error: 'That table no longer exists.' });
    if (pm[2]) return tables.guestStream(t, req, res, ip);
    return json(res, 200, { table: tables.snapshot(t, 'viewer') });
  }
  const user = authUser(req);
  if (m === 'GET' && p === '/api/me') return user ? json(res, 200, { user: publicUser(user) }) : json(res, 200, { user: null });
  if (!user) return json(res, 401, { error: 'Please sign in.' });

  if (m === 'POST' && p === '/api/daily') {
    // Server clock only: the calendar day comes from the server in a fixed timezone (client time/timezone is never read),
    // plus a 6-hour cool-down from the last claim so clock rollbacks or DST quirks can't hand out two claims in a row.
    const r = tx(() => {
      const u = stmt.userById.get(user.id);
      const t = Date.now();
      if ((u.fb_uid && !u.email_verified) || u.last_claim === dayKey() || t - (u.last_claim_ts || 0) < 6 * 3600e3) return null;
      stmt.claim.run(DAILY, dayKey(), t, DAILY, u.id);
      return stmt.userById.get(u.id);
    });
    if (!r) return json(res, 400, { error: user.fb_uid && !user.email_verified ? 'Verify your email address first — then your free chips unlock.' : 'Already claimed today.', user: publicUser(stmt.userById.get(user.id)) });
    return json(res, 200, { user: publicUser(r), claimed: DAILY });
  }

  if (m === 'POST' && p === '/api/demo/refill') {
    stmt.setDemo.run(10000, user.id);
    return json(res, 200, { user: publicUser(stmt.userById.get(user.id)) });
  }

  if (m === 'POST' && p === '/api/settings') {
    const b = await readBody(req);
    let cur = {}; try { cur = JSON.parse(user.settings || '{}'); } catch {}
    const allowed = ['coach', 'showCount', 'sound', 'autoReview', 'animations', 'celebrate', 'chat'];
    for (const k of allowed) if (typeof b[k] === 'boolean') cur[k] = b[k];
    if (typeof b.volume === 'number' && b.volume >= 0 && b.volume <= 100) cur.volume = Math.round(b.volume);
    if (b.fee !== undefined) {
      if (cfg.LOCK) return json(res, 403, { error: 'The house fee is locked by the operator.' });
      const f = cfg.validFee(b.fee);
      if (!f) return json(res, 400, { error: 'Bad fee setting.' });
      cur.fee = f;
    }
    if (b.rules && typeof b.rules === 'object') {
      cur.rules = cur.rules || {};
      for (const [gid, vals] of Object.entries(b.rules)) {
        const g = games[gid];
        if (!g || !vals || typeof vals !== 'object') continue;
        cur.rules[gid] = cur.rules[gid] || {};
        for (const def of cfg.optionsOf(g)) {
          if (vals[def.key] === undefined) continue;
          const v = cfg.validOpt(def, vals[def.key]);
          if (v === undefined) return json(res, 400, { error: `Bad value for ${def.label}.` });
          cur.rules[gid][def.key] = v;
        }
      }
    }
    stmt.setSettings.run(JSON.stringify(cur), user.id);
    return json(res, 200, { user: publicUser(stmt.userById.get(user.id)) });
  }

  if (m === 'POST' && p === '/api/profile') {
    const b = await readBody(req);
    const display = String(b.display || '').trim().replace(/\s+/g, ' ');
    if (display.toLowerCase() === String(user.display).toLowerCase() && display !== user.display) {
      stmt.setDisplay.run(display, user.display_changed || 0, user.id);   // just changing capitalisation
    } else {
      const wait = (user.display_changed || 0) + 10 * 60e3 - Date.now();
      if (user.display_changed && wait > 0) return json(res, 429, { error: `You can change your public name again in ${Math.ceil(wait / 60e3)} min.` });
      const err = checkDisplay(display, user.id);
      if (err) return json(res, 400, { error: err });
      stmt.setDisplay.run(display, Date.now(), user.id);
    }
    return json(res, 200, { user: publicUser(stmt.userById.get(user.id)) });
  }

  if (m === 'GET' && p === '/api/leaderboard') {
    const period = url.searchParams.get('period');
    let net;
    if (period === 'today') net = stmt.topNetSince.all(Date.now() - msSinceMidnight());
    else if (period === 'week') net = stmt.topNetSince.all(Date.now() - 7 * 864e5);
    else net = stmt.topNet.all();
    const mine = stmt.netOf.get(user.id);
    const game = url.searchParams.get('game');
    if (game && games[game]) {
      return json(res, 200, { game, net: stmt.topNetGame.all(game), biggest: stmt.topBiggestGame.all(game), ratings: rating.topGame(game), you: user.display, yourNet: 0 });
    }
    return json(res, 200, { ratings: game ? rating.topGame(game) : rating.top(), net, period: period || 'all', balance: stmt.topBalance.all(), biggest: stmt.topBiggest.all(), you: user.display, yourNet: mine ? mine.net || 0 : 0 });
  }

  if (m === 'GET' && p === '/api/house') {
    const rows = stmt.houseByGame.all();
    const by = {};
    for (const r of rows) {
      const g = (by[r.game] ||= { id: r.game, casino: { rounds: 0, wagered: 0, returned: 0, fees: 0, profit: 0 }, banker: { rounds: 0, wagered: 0, returned: 0, fees: 0, profit: 0 } });
      const c = r.source === 'banker' ? g.banker : g.casino;
      c.rounds += r.rounds; c.wagered += r.wagered; c.returned += r.returned; c.fees += r.fees; c.profit += r.wagered + r.fees - r.returned;
    }
    const list = Object.values(by).filter(g => games[g.id]).map(g => ({ ...g, name: games[g.id].name, icon: games[g.id].icon, theory: games[g.id].edge,
      realizedEdge: g.casino.wagered ? (g.casino.wagered + g.casino.fees - g.casino.returned) / g.casino.wagered : null }));
    const tot = list.reduce((a, g) => { for (const k of ['rounds', 'wagered', 'returned', 'fees', 'profit']) { a.casino[k] += g.casino[k]; a.banker[k] += g.banker[k]; } return a; },
      { casino: { rounds: 0, wagered: 0, returned: 0, fees: 0, profit: 0 }, banker: { rounds: 0, wagered: 0, returned: 0, fees: 0, profit: 0 } });
    return json(res, 200, { games: list.sort((a, b) => b.casino.profit - a.casino.profit), total: tot, daily: stmt.houseDaily.all().reverse() });
  }

  if (m === 'GET' && p === '/api/rating-history') return json(res, 200, { history: rating.history(user.id, String(url.searchParams.get('game'))) });

  if (m === 'GET' && p === '/api/history') {
    const g = url.searchParams.get('game');
    const rows = g ? stmt.histGetGame.all(user.id, g, 50) : stmt.histGet.all(user.id, 50);
    return json(res, 200, { history: rows });
  }

  // ----- lobby & shared tables -----
  if (m === 'GET' && p === '/api/multi') { const codes = String(url.searchParams.get('codes') || '').split(',').filter(c => /^[A-Za-z0-9]{6}$/.test(c)); if (!codes.length) return json(res, 400, { error: 'No tables selected.' }); return tables.streamMulti(codes, stmt.userById.get(user.id), req, res); }
  if (m === 'GET' && p === '/api/arena') return json(res, 200, { arena: bots.listArena() });
  if (m === 'GET' && p === '/api/lobby') return json(res, 200, { ...tables.lobby(), you: user.display });
  if (m === 'POST' && p === '/api/lobby/quick') {
    const b = await readBody(req);
    const user2 = Object.assign({}, user, { ip: clientIp(req) });
    const r = tables.quickJoin(user2, String(b.game));
    if (r.queued) return json(res, 200, { queued: r.queued });
    return json(res, 200, { table: tables.snapshot(r.table) });
  }
  if (m === 'GET' && p === '/api/queue') return json(res, 200, tables.queueStatus(user, String(url.searchParams.get('game'))));
  if (m === 'POST' && p === '/api/queue/leave') { const b = await readBody(req); tables.leaveGlobalQueue(user, String(b.game)); return json(res, 200, { ok: true }); }
  if (m === 'POST' && p === '/api/table') {
    const b = await readBody(req);
    if (!throttle('mk:' + user.id, 10, 600e3)) return json(res, 429, { error: 'You are creating tables too quickly.' });
    const nBots = Math.max(0, Math.min(7, Math.floor(Number(b.bots) || 0)));
    const t = tables.create({ game: String(b.game), user: stmt.userById.get(user.id), isPublic: !!b.public && !nBots, secs: b.secs, rules: b.rules, fee: b.fee, bank: b.bank, practice: nBots > 0, blinds: b.blinds });
    try {
      tables.join(t, Object.assign({}, user, { ip: clientIp(req) }), { buyin: b.buyin });
      if (nBots) tables.addPracticeBots(t, nBots);
    } catch (e) { tables.closeTable(t, null, 'cancelled'); throw e; }
    return json(res, 200, { table: tables.snapshot(t, 'player', user.id) });
  }
  const tm = p.match(/^\/api\/table\/([A-Za-z0-9]{6})(?:\/([a-z]+))?$/);
  if (tm) {
    const t = tables.get(tm[1]);
    if (!t) return json(res, 404, { error: 'That table no longer exists — start a new one.' });
    const act = tm[2];
    if (m === 'GET' && !act) {
      const role = t.players.has(user.id) ? 'player' : t.viewers.has(user.id) ? 'viewer' : 'none';
      const snap = tables.snapshot(t, role === 'viewer' ? 'viewer' : 'player', user.id);
      snap.seated = role === 'player'; snap.role = role; snap.isHost = t.hostId === user.id; snap.queued = t.queue.findIndex(x => x.uid === user.id) + 1; snap.chat = role === 'none' ? [] : snap.chat;
      return json(res, 200, { table: snap });
    }
    if (m === 'GET' && act === 'stream') return tables.stream(t, user, req, res);
    if (m === 'POST') {
      const b = await readBody(req);
      const fresh = Object.assign(stmt.userById.get(user.id), { ip: clientIp(req) });
      if (act === 'switch') { tables.switchGame(t, fresh, String(b.game)); return json(res, 200, { ok: true, table: tables.snapshot(t) }); }
      if (act === 'close') { const r = tables.closeTable(t, fresh); return json(res, 200, { ok: true, ...r, user: publicUser(stmt.userById.get(user.id)) }); }
      if (act === 'topup') { tables.topUpBank(t, fresh, b.amount); return json(res, 200, { ok: true, user: publicUser(stmt.userById.get(user.id)) }); }
      if (act === 'queue') { const pos = tables.tableQueueJoin(t, fresh); return json(res, 200, { position: pos }); }
      if (act === 'unqueue') { tables.tableQueueLeave(t, fresh); return json(res, 200, { ok: true }); }
      if (act === 'kick') { tables.kick(t, fresh, b.name); return json(res, 200, { ok: true }); }
      if (act === 'join') { tables.join(t, fresh, { buyin: b.buyin }); return json(res, 200, { table: tables.snapshot(t, 'player', user.id) }); }
      if (act === 'pk') { tables.pokerAct(t, fresh, String(b.action), b.to); return json(res, 200, { ok: true }); }
      if (act === 'rebuy') { const r = tables.pokerRebuy(t, fresh, b.amount); return json(res, 200, { ok: true, ...r }); }
      if (act === 'leave') { tables.leave(t, fresh); tables.unwatch(t, fresh); return json(res, 200, { ok: true }); }
      if (act === 'sitout') { tables.sitOut(t, fresh); return json(res, 200, { ok: true, table: tables.snapshot(t) }); }
      if (act === 'sitin') { tables.sitIn(t, fresh); return json(res, 200, { ok: true, table: tables.snapshot(t) }); }
      if (act === 'watch') { tables.watch(t, fresh); return json(res, 200, { table: tables.snapshot(t, 'viewer') }); }
      if (act === 'place') { const r = tables.place(t, fresh, b); return json(res, 200, { ...r, table: tables.snapshot(t) }); }
      if (act === 'unplace') { const r = tables.unplace(t, fresh); return json(res, 200, r); }
      if (act === 'ready') { tables.ready(t, fresh); return json(res, 200, { ok: true }); }
      if (act === 'chat') { tables.chat(t, fresh, b.text); return json(res, 200, { ok: true }); }
    }
    return json(res, 404, { error: 'Not found.' });
  }

  const gm = p.match(/^\/api\/game\/([a-z0-9_]+)(?:\/([A-Za-z]+))?$/);
  if (gm) {
    const mod = games[gm[1]];
    if (!mod) return json(res, 404, { error: 'No such game.' });
    const demo = req.headers['x-demo'] === '1';
    if (m === 'GET' && !gm[2]) {
      const { view, last } = engine.peek(user, mod.id, mod, { demo, ...(demo ? {} : tables.engineOpts(user.id, mod.id)) });
      return json(res, 200, { view, last, balance: demo ? user.demo_balance : user.balance });
    }
    if (m === 'POST' && gm[2]) {
      if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'JSON only.' });
      const b = await readBody(req);
      const fresh = stmt.userById.get(user.id);
      if (!throttle('act:' + user.id, 40, 5000)) return json(res, 429, { error: 'Easy there — too many actions per second.' });
      const seat = !demo && mod.shared && tables.seatedAt(user.id, mod.id);
      if (seat && mod.shared.mode !== 'parallel' && mod.shared.primary.includes(gm[2])) return json(res, 409, { error: `You're seated at table ${seat}. Place your bets at the table (or leave it first).` });
      if (seat && mod.shared.mode === 'rounds') {            // shared-dealer table: the table decides who may act and when
        const t = tables.get(seat), o = tables.roundAct(t, fresh, gm[2], b);
        return json(res, 200, { view: o.view, analysis: o.analysis, balance: o.balance, ended: o.ended, demo: false });
      }
      const out = engine.run(fresh, mod.id, mod, gm[2], b, demo ? { demo: true } : tables.engineOpts(user.id, mod.id));
      if (!demo) tables.notifyPlay(fresh, mod.id, { view: out.view, analysis: out.analysis });
      return json(res, 200, { view: out.view, analysis: out.analysis, balance: out.ctx.bal, ended: out.ctx.ended, demo });
    }
  }
  return json(res, 404, { error: 'Not found.' });
}

// ---------- static (in-memory, pre-compressed, ETag'd) ----------
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt']);
const staticCache = new Map();          // abs path -> { mtime, size, buf, gz, br, etag, type }
// Build id = hash of every public file. Asset URLs get `?v=<build>` appended on the fly, so a deploy changes every
// module URL and no browser/CDN can keep running stale JS (dynamic import() ignores a hard refresh in some browsers).
const BUILD = (() => {
  const hash = crypto.createHash('sha1');
  const walk = d => { for (const n of fs.readdirSync(d).sort()) { const f = path.join(d, n); fs.statSync(f).isDirectory() ? walk(f) : hash.update(n).update(fs.readFileSync(f)); } };
  try { walk(PUB); } catch {}
  return hash.digest('hex').slice(0, 10);
})();
function versioned(ext, buf) {
  if (ext === '.js') return Buffer.from(buf.toString('utf8').replace(/(\.js)(['"`])/g, `$1?v=${BUILD}$2`));
  if (ext === '.html') return Buffer.from(buf.toString('utf8').replace(/(\.js|\.css)(["'])/g, `$1?v=${BUILD}$2`));
  return buf;
}
function loadStatic(file, st) {
  const hit = staticCache.get(file);
  if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return hit;
  const ext = path.extname(file);
  const buf = versioned(ext, fs.readFileSync(file));
  const e = { mtime: st.mtimeMs, size: st.size, buf, type: MIME[ext] || 'application/octet-stream', etag: '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"' };
  if (COMPRESSIBLE.has(ext) && buf.length > 600) { e.gz = zlib.gzipSync(buf, { level: 9 }); e.br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }); }
  staticCache.set(file, e);
  return e;
}
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB + path.sep) && file !== PUB) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) return serveStatic(req, res, new URL(url.pathname.replace(/\/?$/, '/') + 'index.html', 'http://x'));    // /terms -> /terms/index.html
    if (err || !st.isFile()) {
      if (!path.extname(rel)) return serveStatic(req, res, new URL('/', 'http://x'));     // SPA fallback
      res.writeHead(404); return res.end('Not found');
    }
    let e;
    try { e = loadStatic(file, st); } catch { res.writeHead(500); return res.end('Error'); }
    const ext = path.extname(file);
    const headers = { 'Content-Type': e.type, ETag: e.etag, Vary: 'Accept-Encoding', 'Cache-Control': /^\/(icon|apple)/.test(rel) || ext === '.png' ? 'public, max-age=86400' : 'private, no-cache' };   // `private` keeps Cloudflare from edge-caching or overriding it with its 4h browser TTL
    if (req.headers['if-none-match'] === e.etag) { res.writeHead(304, headers); return res.end(); }
    const ae = String(req.headers['accept-encoding'] || '');
    let body = e.buf;
    if (e.br && /\bbr\b/.test(ae)) { body = e.br; headers['Content-Encoding'] = 'br'; }
    else if (e.gz && /\bgzip\b/.test(ae)) { body = e.gz; headers['Content-Encoding'] = 'gzip'; }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    res.end(body);
  });
}

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://*.googleusercontent.com; style-src 'self' 'unsafe-inline'; script-src 'self' https://www.gstatic.com https://apis.google.com; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://*.firebaseapp.com; frame-src https://accounts.google.com https://*.firebaseapp.com https://apis.google.com; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'",
};

const handler = async (req, res) => {
  for (const [k, v] of Object.entries(SEC_HEADERS)) res.setHeader(k, v);
  // Cloudflare injects a tiny inline bootstrap script into HTML (bot detection). A per-response nonce in the CSP lets it add the
  // matching nonce attribute itself, so the policy stays strict (no 'unsafe-inline') and nothing has to be switched off at Cloudflare.
  const nonce = crypto.randomBytes(16).toString('base64');
  let csp = SEC_HEADERS['Content-Security-Policy'].replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`);
  if (/^\/embed\//.test(req.url || '')) { res.removeHeader('X-Frame-Options'); csp = csp.replace("frame-ancestors 'none'", 'frame-ancestors *'); }     // only the read-only table view may be iframed
  res.setHeader('Content-Security-Policy', csp);
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, url);
  } catch (e) {
    if (e instanceof engine.GameError) return json(res, e.status || 400, { error: e.message });
    console.error(e);
    return json(res, 500, { error: 'Server error.' });
  }
};

// Optional TLS (TLS_CERT/TLS_KEY) for hosts where the reverse proxy reaches us over the internet.
const server = process.env.TLS_CERT && process.env.TLS_KEY
  ? require('node:https').createServer({ cert: fs.readFileSync(process.env.TLS_CERT), key: fs.readFileSync(process.env.TLS_KEY) }, handler)
  : http.createServer(handler);

if (require.main === module) {
  const recovered = tables.recoverEscrow();
  if (recovered) console.log(`Refunded ${recovered} escrowed shared-table bet(s) from before the restart.`);
  server.listen(PORT, HOST, () => {
    console.log(`Lucky Chips Casino on http://${HOST}:${PORT}  (games: ${Object.keys(games).length}, tz: ${TZ})`);
    setTimeout(() => { try { require('./lib/examples').all(); } catch (e) { console.error('warmup failed', e.message); } }, 1500).unref();   // ~1s of one-off maths, off the request path
  });
}
module.exports = { server, dayKey };
