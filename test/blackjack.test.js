const { newUser, play, balance, stmt, games } = require('./harness');
const rating = require('../lib/rating');
const u = newUser(1e9);
const S = (o) => stmt.setSettings.run(JSON.stringify(o), u.id);
const bj = games.blackjack._t;

// Simulate a player following basic strategy exactly (coach off => rated) and measure RTP
S({ coach: false });
let staked = 0, start = balance(u), rounds = 0, mistakes = 0;
function view() { return require('../lib/engine').peek(stmt.userById.get(u.id), 'blackjack', games.blackjack).view; }
for (let i = 0; i < 6000; i++) {
  let r = play(u, 'blackjack', 'deal', { bet: 10 }); staked += 10; rounds++;
  let v = r.view, guard = 0;
  while (v.phase === 'insurance') { r = play(u, 'blackjack', 'insurance', { take: false }); v = r.view; }
  while (v.phase === 'player' && guard++ < 40) {
    const h = v.hands[v.cur];
    const cards = h.cards.map(c => 'AKQJT98765432'.length && (['2','3','4','5','6','7','8','9','T','J','Q','K','A'].indexOf(c[0]) + ['S','H','D','C'].indexOf(c[1]) * 13));
    const up = bj.val(['2','3','4','5','6','7','8','9','T','J','Q','K','A'].indexOf(v.dealer.cards[0][0]) );
    const a = v.allowed;
    const bp = bj.bestPlay(cards, up, { double: a.double, split: a.split, surrender: a.surrender });
    const act = { H: 'hit', S: 'stand', D: 'double', P: 'split', R: 'surrender' }[bp.code];
    staked += (bp.code === 'D' || bp.code === 'P') ? 10 : 0;
    r = play(u, 'blackjack', act, {}); v = r.view;
  }
  if (r.analysis && r.analysis.sections.some(s => s.title === 'Your decisions' && s.items.some(x => x.k === 'bad'))) mistakes++;
}
const rtp = 1 + (balance(u) - start) / staked;
console.log('basic-strategy RTP over', rounds, 'hands:', (rtp * 100).toFixed(2) + '% (theory ~99.5%)', '| graded mistakes (vs insurance-count devs):', mistakes);
const rf = rating.forUser(u.id);
console.log('rating after perfect basic play:', rf.games.blackjack.rating, rf.games.blackjack.tier.name, 'accuracy', (rf.games.blackjack.accuracy * 100).toFixed(1) + '%', 'n', rf.games.blackjack.n);

// coach off => view carries no advice; coach on => carries advice but doesn't rate
let r = play(u, 'blackjack', 'deal', { bet: 10 });
console.log('coach OFF view.coach:', r.view.coach, '(must be null/undefined in a live hand)');
while (r.view.phase !== 'done') r = play(u, 'blackjack', r.view.phase === 'insurance' ? 'insurance' : 'stand', r.view.phase === 'insurance' ? { take: false } : {});
S({ coach: true });
const before = rating.forUser(u.id).games.blackjack.rating;
r = play(u, 'blackjack', 'deal', { bet: 10 });
console.log('coach ON live hand has coach:', !!r.view.coach || r.view.phase !== 'player');
while (r.view.phase !== 'done') r = play(u, 'blackjack', r.view.phase === 'insurance' ? 'insurance' : 'stand', r.view.phase === 'insurance' ? { take: false } : {});
console.log('rating unchanged while assisted:', rating.forUser(u.id).games.blackjack.rating === before);
