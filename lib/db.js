'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DIR = process.env.CASINO_DATA || path.join(__dirname, '..', 'data');
fs.mkdirSync(DIR, { recursive: true });
const db = new DatabaseSync(process.env.CASINO_DB || path.join(DIR, 'casino.db'));

db.exec(`
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
PRAGMA cache_size=-20000;
PRAGMA temp_store=MEMORY;
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display TEXT,
  display_changed INTEGER NOT NULL DEFAULT 0,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  last_claim TEXT,
  claims INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  peak INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS game_state(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  json TEXT,
  last TEXT,
  PRIMARY KEY(user_id, game)
);
CREATE TABLE IF NOT EXISTS stats(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  rounds INTEGER NOT NULL DEFAULT 0,
  wagered INTEGER NOT NULL DEFAULT 0,
  returned INTEGER NOT NULL DEFAULT 0,
  biggest INTEGER NOT NULL DEFAULT 0,
  skill_ok INTEGER NOT NULL DEFAULT 0,
  skill_total INTEGER NOT NULL DEFAULT 0,
  fees INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, game)
);
CREATE TABLE IF NOT EXISTS history(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  net INTEGER NOT NULL,
  summary TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS history_user ON history(user_id, id DESC);
CREATE TABLE IF NOT EXISTS house(
  game TEXT NOT NULL, source TEXT NOT NULL, day TEXT NOT NULL,
  wagered INTEGER NOT NULL DEFAULT 0, returned INTEGER NOT NULL DEFAULT 0, fees INTEGER NOT NULL DEFAULT 0, rounds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(game, source, day)
);
CREATE TABLE IF NOT EXISTS banks(
  code TEXT PRIMARY KEY, host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, initial INTEGER NOT NULL, created INTEGER NOT NULL
);
`);

try { db.exec('ALTER TABLE users ADD COLUMN display TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN display_changed INTEGER NOT NULL DEFAULT 0'); } catch {}
db.exec('UPDATE users SET display=username WHERE display IS NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_display ON users(display COLLATE NOCASE)');
try { db.exec('ALTER TABLE users ADD COLUMN demo_balance INTEGER NOT NULL DEFAULT 10000'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN last_claim_ts INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0'); } catch {}
for (const col of ['fb_uid TEXT', 'email TEXT', 'email_verified INTEGER NOT NULL DEFAULT 0', 'provider TEXT', 'welcome INTEGER NOT NULL DEFAULT 0']) { try { db.exec('ALTER TABLE users ADD COLUMN ' + col); } catch {} }
db.exec('UPDATE users SET welcome=1 WHERE fb_uid IS NULL AND welcome=0');       // legacy username accounts already got their starting chips
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_fb ON users(fb_uid) WHERE fb_uid IS NOT NULL');
try { db.exec('ALTER TABLE stats ADD COLUMN fees INTEGER NOT NULL DEFAULT 0'); } catch {}   // upgrade older DBs

const q = sql => db.prepare(sql);
const stmt = {
  userById: q('SELECT * FROM users WHERE id=?'),
  userByName: q('SELECT * FROM users WHERE username=?'),
  userByFb: q('SELECT * FROM users WHERE fb_uid=?'),
  insertFbUser: q('INSERT INTO users(username,display,salt,hash,balance,last_claim,claims,created,peak,fb_uid,email,email_verified,provider,welcome) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
  updFb: q('UPDATE users SET email=?, email_verified=?, provider=? WHERE id=?'),
  grantWelcome: q('UPDATE users SET balance=balance+?, peak=MAX(peak,balance+?), last_claim=?, last_claim_ts=?, welcome=1, claims=claims+1 WHERE id=?'),
  insertUser: q('INSERT INTO users(username,display,salt,hash,balance,last_claim,claims,created,peak) VALUES(?,?,?,?,?,?,1,?,?)'),
  displayTaken: q('SELECT id FROM users WHERE display=? AND id<>?'),
  setDisplay: q('UPDATE users SET display=?, display_changed=? WHERE id=?'),
  setBalance: q('UPDATE users SET balance=?, peak=MAX(peak,?) WHERE id=?'),
  claim: q('UPDATE users SET balance=balance+?, last_claim=?, last_claim_ts=?, claims=claims+1, peak=MAX(peak,balance+?) WHERE id=?'),
  setDemo: q('UPDATE users SET demo_balance=? WHERE id=?'),
  setSettings: q('UPDATE users SET settings=? WHERE id=?'),
  sessIns: q('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)'),
  sessGet: q('SELECT * FROM sessions WHERE token=?'),
  sessDel: q('DELETE FROM sessions WHERE token=?'),
  sessPurge: q('DELETE FROM sessions WHERE expires<?'),
  gsGet: q('SELECT json,last FROM game_state WHERE user_id=? AND game=?'),
  gsSet: q('INSERT INTO game_state(user_id,game,json,last) VALUES(?,?,?,?) ON CONFLICT(user_id,game) DO UPDATE SET json=excluded.json, last=excluded.last'),
  statGet: q('SELECT * FROM stats WHERE user_id=? AND game=?'),
  statEnsure: q('INSERT OR IGNORE INTO stats(user_id,game) VALUES(?,?)'),
  statWager: q('UPDATE stats SET wagered=wagered+? WHERE user_id=? AND game=?'),
  statReturn: q('UPDATE stats SET returned=returned+? WHERE user_id=? AND game=?'),
  statRound: q('UPDATE stats SET rounds=rounds+1, biggest=MAX(biggest,?) WHERE user_id=? AND game=?'),
  statFees: q('UPDATE stats SET fees=fees+? WHERE user_id=? AND game=?'),
  statSkill: q('UPDATE stats SET skill_ok=skill_ok+?, skill_total=skill_total+? WHERE user_id=? AND game=?'),
  statsAll: q('SELECT * FROM stats WHERE user_id=?'),
  histIns: q('INSERT INTO history(user_id,game,net,summary,ts) VALUES(?,?,?,?,?)'),
  histGet: q('SELECT game,net,summary,ts FROM history WHERE user_id=? ORDER BY id DESC LIMIT ?'),
  histGetGame: q('SELECT game,net,summary,ts FROM history WHERE user_id=? AND game=? ORDER BY id DESC LIMIT ?'),
  histPrune: q('DELETE FROM history WHERE user_id=? AND id NOT IN (SELECT id FROM history WHERE user_id=? ORDER BY id DESC LIMIT 500)'),
  topBalance: q('SELECT display AS username,balance,peak FROM users WHERE is_bot=0 ORDER BY balance DESC, id LIMIT 20'),
  topBiggest: q('SELECT u.display AS username, MAX(s.biggest) AS biggest FROM stats s JOIN users u ON u.id=s.user_id GROUP BY s.user_id ORDER BY biggest DESC LIMIT 10'),
  recentGames: q('SELECT game, MAX(ts) AS ts, COUNT(*) AS n, SUM(net) AS net FROM history WHERE user_id=? GROUP BY game ORDER BY ts DESC LIMIT 8'),
  gsAll: q('SELECT game, json FROM game_state WHERE user_id=?'),
  houseAdd: q('INSERT INTO house(game,source,day,wagered,returned,fees,rounds) VALUES(?,?,?,?,?,?,?) ON CONFLICT(game,source,day) DO UPDATE SET wagered=wagered+excluded.wagered, returned=returned+excluded.returned, fees=fees+excluded.fees, rounds=rounds+excluded.rounds'),
  houseByGame: q('SELECT game, source, SUM(wagered) AS wagered, SUM(returned) AS returned, SUM(fees) AS fees, SUM(rounds) AS rounds FROM house GROUP BY game, source'),
  houseDaily: q("SELECT day, SUM(wagered + fees - returned) AS profit, SUM(rounds) AS rounds FROM house WHERE source='casino' GROUP BY day ORDER BY day DESC LIMIT 30"),
  bankGet: q('SELECT * FROM banks WHERE code=?'),
  bankIns: q('INSERT INTO banks(code,host_id,amount,initial,created) VALUES(?,?,?,?,?)'),
  bankSet: q('UPDATE banks SET amount=? WHERE code=?'),
  bankDel: q('DELETE FROM banks WHERE code=?'),
  bankAll: q('SELECT * FROM banks'),
  addBalance: q('UPDATE users SET balance=balance+?, peak=MAX(peak,balance+?) WHERE id=?'),
  topNetGame: q('SELECT u.display AS username, (s.returned - s.wagered - s.fees) AS net, s.rounds AS rounds FROM stats s JOIN users u ON u.id=s.user_id WHERE s.game=? AND s.rounds>0 ORDER BY net DESC, rounds DESC LIMIT 25'),
  topBiggestGame: q('SELECT u.display AS username, s.biggest AS biggest FROM stats s JOIN users u ON u.id=s.user_id WHERE s.game=? AND s.biggest>0 ORDER BY s.biggest DESC LIMIT 25'),
  topNet: q('SELECT u.display AS username, SUM(s.returned - s.wagered - s.fees) AS net, SUM(s.rounds) AS rounds FROM stats s JOIN users u ON u.id=s.user_id GROUP BY s.user_id HAVING rounds > 0 ORDER BY net DESC, rounds DESC LIMIT 25'),
  topNetSince: q('SELECT u.display AS username, SUM(h.net) AS net, COUNT(*) AS rounds FROM history h JOIN users u ON u.id=h.user_id WHERE h.ts >= ? GROUP BY h.user_id ORDER BY net DESC, rounds DESC LIMIT 25'),
  netOf: q('SELECT SUM(returned - wagered - fees) AS net FROM stats WHERE user_id=?'),
  userCount: q('SELECT COUNT(*) AS n FROM users WHERE is_bot=0'),
  botByName: q('SELECT * FROM users WHERE username=? AND is_bot=1'),
  insertBot: q("INSERT INTO users(username,display,salt,hash,balance,last_claim,claims,created,peak,is_bot,demo_balance) VALUES(?,?,'x','!',0,'',0,?,0,1,1000000)"),
};

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

module.exports = { db, stmt, tx };
