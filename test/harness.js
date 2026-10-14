'use strict';
// Test harness: isolated temp DB + helper to run game actions as a throwaway user.
const os = require('node:os'), path = require('node:path'), fs = require('node:fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-test-'));
process.env.CASINO_DB = path.join(dir, 't.db');
process.env.CASINO_DATA = dir;
const { stmt } = require('../lib/db');
const engine = require('../lib/engine');
const games = require('../games');

let n = 0;
function newUser(balance = 1e9) {
  const r = stmt.insertUser.run('t' + (++n), 't' + n, 's', 'h', balance, '2000-01-01', Date.now(), balance);
  return stmt.userById.get(Number(r.lastInsertRowid));
}
function play(user, game, action, body) {
  const fresh = stmt.userById.get(user.id);
  return engine.run(fresh, game, games[game], action, body);
}
function balance(user) { return stmt.userById.get(user.id).balance; }
module.exports = { newUser, play, balance, games, stmt, engine };
