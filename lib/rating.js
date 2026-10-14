'use strict';
// Skill rating (chess-style Elo). Every graded decision is a "match" between the player and the spot:
//   expected = 1 / (1 + 10^((spotDifficulty - rating) / 400))      actual = quality in [0,1]
// Only information the player could legitimately see is graded. Decisions made while the coach is showing
// the answer are "assisted": tracked for accuracy stats but they never move the rating.
const { db, stmt } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS ratings(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 1200,
  n INTEGER NOT NULL DEFAULT 0,
  ok REAL NOT NULL DEFAULT 0,
  peak REAL NOT NULL DEFAULT 1200,
  an INTEGER NOT NULL DEFAULT 0,
  aok REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, game)
);
CREATE TABLE IF NOT EXISTS rating_hist(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL, ts INTEGER NOT NULL, rating REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS rating_hist_u ON rating_hist(user_id, game, id DESC);
`);
const q = s => db.prepare(s);
const st = {
  get: q('SELECT * FROM ratings WHERE user_id=? AND game=?'),
  all: q('SELECT * FROM ratings WHERE user_id=?'),
  upsert: q('INSERT INTO ratings(user_id,game,rating,n,ok,peak,an,aok) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,game) DO UPDATE SET rating=excluded.rating,n=excluded.n,ok=excluded.ok,peak=excluded.peak,an=excluded.an,aok=excluded.aok'),
  hist: q('INSERT INTO rating_hist(user_id,game,ts,rating) VALUES(?,?,?,?)'),
  prune: q('DELETE FROM rating_hist WHERE user_id=? AND game=? AND id NOT IN (SELECT id FROM rating_hist WHERE user_id=? AND game=? ORDER BY id DESC LIMIT 120)'),
  histGet: q('SELECT ts,rating FROM rating_hist WHERE user_id=? AND game=? ORDER BY id DESC LIMIT 60'),
  top: q(`SELECT u.display AS username, SUM(r.rating * MIN(r.n,200)) / SUM(MIN(r.n,200)) AS rating, SUM(r.n) AS n
          FROM ratings r JOIN users u ON u.id=r.user_id WHERE r.n > 0 GROUP BY r.user_id HAVING SUM(r.n) >= 30 ORDER BY rating DESC LIMIT 25`),
  topGame: q(`SELECT u.display AS username, r.rating, r.n FROM ratings r JOIN users u ON u.id=r.user_id WHERE r.game=? AND r.n >= 20 ORDER BY r.rating DESC LIMIT 25`),
};

const START = 1200, FLOOR = 400, CEIL = 3000;
const expected = (r, d) => 1 / (1 + Math.pow(10, (d - r) / 400));
const kFor = n => (n < 30 ? 40 : n < 150 ? 24 : 16);

const TIERS = [
  [2200, 'Grandmaster', '👑'], [2000, 'Master', '🏆'], [1800, 'Expert', '💎'], [1600, 'Advanced', '🥇'],
  [1400, 'Skilled', '🥈'], [1200, 'Regular', '🥉'], [1000, 'Novice', '🎯'], [0, 'Rookie', '🌱'],
];
function tier(r) { for (const [min, name, icon] of TIERS) if (r >= min) return { name, icon }; return { name: 'Rookie', icon: '🌱' }; }

// items: [{spot, d, q}] -> returns { before, after, delta, rated, assisted }
function apply(userId, game, items, assisted) {
  if (!items.length) return null;
  let row = st.get.get(userId, game) || { rating: START, n: 0, ok: 0, peak: START, an: 0, aok: 0 };
  const before = row.rating;
  let { rating, n, ok, peak, an, aok } = row;
  let rated = 0;
  for (const it of items) {
    const quality = Math.max(0, Math.min(1, it.q));
    if (assisted) { an++; aok += quality; continue; }
    const E = expected(rating, it.d);
    rating = Math.max(FLOOR, Math.min(CEIL, rating + kFor(n) * (quality - E)));
    n++; ok += quality; rated++;
    if (rating > peak) peak = rating;
  }
  st.upsert.run(userId, game, rating, n, ok, peak, an, aok);
  if (rated) { st.hist.run(userId, game, Date.now(), Math.round(rating * 10) / 10); st.prune.run(userId, game, userId, game); }
  return { before, after: rating, delta: rating - before, rated, assisted: assisted ? items.length : 0, n, provisional: n < 30 };
}

function forUser(userId) {
  const rows = st.all.all(userId);
  const games = {};
  let wsum = 0, wr = 0, total = 0;
  for (const r of rows) {
    games[r.game] = { rating: Math.round(r.rating), n: r.n, accuracy: r.n ? r.ok / r.n : null, peak: Math.round(r.peak), assisted: r.an, assistedAccuracy: r.an ? r.aok / r.an : null, tier: tier(r.rating), provisional: r.n < 30 };
    const w = Math.min(r.n, 200); wsum += w; wr += w * r.rating; total += r.n;
  }
  const overall = wsum ? Math.round(wr / wsum) : null;
  return { overall, tier: overall ? tier(overall) : null, decisions: total, provisional: total < 30, games };
}
const history = (userId, game) => st.histGet.all(userId, game).reverse();

module.exports = { START, apply, forUser, history, tier, TIERS, expected, top: () => st.top.all(), topGame: g => st.topGame.all(g) };
