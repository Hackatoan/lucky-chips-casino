// Learn centre: per-game guides, basic strategy charts, card counting, house edge, bankroll & fallacies.
import { api, state } from './api.js';
import { h, fmt, badge, cardsRow, card } from './ui.js';

const TOPICS = [
  ['strategy', '🃏', 'Blackjack basic strategy', 'The full chart — what to do with every hand against every dealer upcard, and why.'],
  ['counting', '🧮', 'Card counting (Hi-Lo)', 'Running count, true count, bet ramps and index plays — the real technique, step by step.'],
  ['examples', '🖼', 'Hand examples (pictures)', 'See real hands for every decision: when to split, double, surrender, hold, ride or fold — with the reason.'],
  ['edge', '📉', 'House edge & return', 'What “edge” means and where every game on this site ranks, cheapest to costliest.'],
  ['bankroll', '💼', 'Bankroll & variance', 'Why short sessions are wild, how big a stake you need, and how fast edges grind you down.'],
  ['fallacies', '🧠', 'Gambling fallacies', 'Gambler’s fallacy, hot hands, near misses, betting systems — and why none of them work.'],
  ['odds', '🎲', 'Odds cheat-sheet', 'Dice totals, card probabilities and payout maths you can use at any table.'],
];
const CODE_CLS = { H: 'c-h', S: 'c-s', D: 'c-d', Ds: 'c-d', P: 'c-p', R: 'c-r' };
const CODE_LABEL = { H: 'H', S: 'S', D: 'D', Ds: 'Ds', P: 'P', R: 'R' };

export async function learnPage(topic, shell) {
  const crumb = h('a', { class: 'btn sm ghost', href: '#/learn' }, '← Learn');
  if (!topic) {
    const games = state.games;
    return shell(h('div', null, h('div', { class: 'sec-title' }, h('h1', null, '📖 Learn')),
      h('p', { class: 'muted' }, 'Everything is explained in plain language — and the same numbers power the live coach at every table.'),
      h('div', { class: 'grid' }, TOPICS.map(([id, ico, t, d]) => h('a', { class: 'tile cat-cards', href: '#/learn/' + id }, h('div', { class: 'tile-art', style: { height: '64px' } }, h('span', { class: 'ico' }, ico)), h('div', { class: 'tile-body' }, h('h3', null, t), h('p', null, d))))),
      h('div', { class: 'sec-title' }, h('h2', null, 'Game guides')),
      h('div', { class: 'grid' }, games.map(g => h('a', { class: 'tile cat-' + g.category, href: '#/learn/game/' + g.id }, h('div', { class: 'tile-art', style: { height: '56px' } }, h('span', { class: 'ico' }, g.icon)), h('div', { class: 'tile-body' }, h('h3', null, g.name), h('p', null, 'Rules, payouts and strategy tips')))))), 'learn');
  }
  if (topic === 'game') {
    const id = location.hash.split('/')[3]; const g = state.byId[id];
    if (!g) return shell(h('div', null, crumb, h('p', null, 'Unknown game.')), 'learn');
    const m = g.meta || {};
    return shell(h('div', { class: 'article' }, crumb, h('h1', null, g.icon + ' ' + g.name), h('div', { class: 'row' }, badge('Edge ' + g.edge), g.shared ? badge('👥 Multiplayer', 'green') : null),
      h('h2', null, 'How to play'), (m.rules || []).map(p => h('p', null, p)),
      m.tips && m.tips.length ? [h('h2', null, 'Strategy & tips'), h('ul', null, m.tips.map(t => h('li', null, t)))] : null,
      m.bets ? [h('h2', null, 'Every bet'), h('div', { style: { overflowX: 'auto' } }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['Bet', 'Pays', 'House edge'].map((c, i) => h('th', { class: i ? 'num' : '' }, c)))), h('tbody', null, Object.values(m.bets).slice(0, 80).map(b => h('tr', null, h('td', null, b.name || '—'), h('td', { class: 'num' }, b.pays || ''), h('td', { class: 'num' }, b.edge !== undefined ? (b.edge * 100).toFixed(2) + '%' : ''))))))] : null,
      h('p', null, h('a', { class: 'btn gold', href: '#/g/' + g.id }, 'Play ' + g.name))), 'learn');
  }
  const t = TOPICS.find(x => x[0] === topic);
  if (!t) return shell(h('div', null, crumb, h('p', null, 'Topic not found.')), 'learn');
  const body = await ARTICLES[topic]();
  shell(h('div', { class: 'article' }, crumb, h('h1', null, t[1] + ' ' + t[2]), body), 'learn');
}

const P = (...x) => h('p', null, ...x);

// ---- visual hand examples (cards drawn with the same renderer as the tables) ----
const exCard = (c, o = {}) => card(c, { small: true, ...o });
function bjExample(e) {
  return h('div', { class: 'ex' },
    h('div', { class: 'ex-cards' }, h('div', { class: 'ex-side' }, h('div', { class: 'ex-lbl' }, 'Dealer'), exCard(e.dealer)), h('div', { class: 'ex-side' }, h('div', { class: 'ex-lbl' }, 'You'), h('div', { class: 'cards' }, e.player.map(c => exCard(c))))),
    h('div', { class: 'ex-play' }, h('b', null, '★ ' + e.play), e.tag ? h('span', { class: 'badge' }, e.tag) : null), h('div', { class: 'ex-why' }, e.why));
}
function holdExample(e) {
  return h('div', { class: 'ex' }, h('div', { class: 'ex-cards' }, h('div', { class: 'cards ex-hold' }, e.cards.map((c, i) => h('div', { class: 'ex-h' + (e.hold[i] ? ' on' : '') }, exCard(c), e.hold[i] ? h('span', null, 'HOLD') : null)))),
    h('div', { class: 'ex-play' }, h('b', null, '★ ' + e.name), h('span', { class: 'badge gold' }, 'EV ' + (e.ev * 100).toFixed(0) + '%'), e.tag ? h('span', { class: 'badge' }, e.tag) : null),
    h('div', { class: 'ex-why' }, `Next best idea: ${e.alt.name} (EV ${(e.alt.ev * 100).toFixed(0)}%).`));
}
function simpleExample(e, extra) {
  return h('div', { class: 'ex' }, h('div', { class: 'ex-cards' }, h('div', { class: 'cards' }, e.cards.map(c => exCard(c)))), h('div', { class: 'ex-play' }, h('b', null, '★ ' + e.play), e.tag ? h('span', { class: 'badge' }, e.tag) : null), extra ? h('div', { class: 'ex-why' }, extra) : null);
}
const exGroup = (g, render) => h('div', { class: 'ex-group' }, h('h3', null, g.title), g.blurb ? h('p', { class: 'muted small' }, g.blurb) : null, h('div', { class: 'ex-grid' }, g.hands.map(render)));
const ARTICLES = {
  async examples() {
    const e = await api('/learn/examples');
    const tabsBar = h('div', { class: 'filters' });
    const sections = {
      blackjack: () => e.blackjack.map(g => exGroup(g, bjExample)),
      videopoker: () => [P('Video poker examples use the 9/6 Jacks or Better paytable. “EV” is the exact expected return of the best hold, as a % of your bet.'), ...e.videopoker.map(g => exGroup(g, holdExample))],
      letitride: () => [exGroup(e.cards.letitride, x => simpleExample(x, `Exact EV — let it ride: ${x.evRide.toFixed(2)} bets · pull back: ${x.evPull.toFixed(2)} bets.`))],
      threecard: () => [exGroup(e.cards.threecard, x => simpleExample(x, `${x.name} — the dealer qualifies only ~66% of the time, and Q-6-4 is the break-even line.`))],
    };
    const host = h('div'), names = { blackjack: '🃏 Blackjack', videopoker: '🂡 Video poker', letitride: '🏇 Let It Ride', threecard: '🂭 Three Card Poker' };
    let cur = 'blackjack';
    const show = k => { cur = k; host.replaceChildren(...sections[k]()); [...tabsBar.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); };
    Object.keys(sections).forEach(k => tabsBar.append(h('button', { class: 'pill', dataset: { k }, onclick: () => show(k) }, names[k])));
    show(cur);
    return h('div', null, P('Every picture below is produced by the same engine that powers the live coach, so the advice always matches what you see at the tables.'), tabsBar, host);
  },
  async strategy() {
    const c = await api('/learn/bj-chart');
    const grid = (title, rows, lbl) => h('div', { style: { overflowX: 'auto', marginBottom: '14px' } }, h('h3', null, title),
      h('table', { class: 'chart' }, h('thead', null, h('tr', null, h('th', null, 'Your hand'), c.ups.map(u => h('th', null, u === 11 ? 'A' : u)))),
        h('tbody', null, Object.entries(rows).reverse().map(([k, arr]) => h('tr', null, h('th', null, (lbl || '') + k), arr.map(code => h('td', { class: CODE_CLS[code] || '' }, CODE_LABEL[code] || code)))))));
    return h('div', null,
      P('This chart is for the rules at our blackjack table: 6 decks, dealer stands on all 17s, double after split allowed, late surrender, blackjack pays 3:2. Played perfectly it leaves the house a ~0.5% edge — the lowest of any table game.'),
      h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'chart-key c-h' }, 'H Hit'), h('span', { class: 'chart-key c-s' }, 'S Stand'), h('span', { class: 'chart-key c-d' }, 'D Double (Ds: else stand)'), h('span', { class: 'chart-key c-p' }, 'P Split'), h('span', { class: 'chart-key c-r' }, 'R Surrender (else hit)')),
      grid('Hard totals', c.hard, 'Hard '), grid('Soft totals (hand contains an Ace counted as 11)', c.soft), grid('Pairs', c.pairs),
      h('h2', null, 'Why the chart looks the way it does'),
      h('ul', null,
        h('li', null, h('b', null, 'Dealer 2–6 are "bust cards".'), ' The dealer must draw to 17 and busts 35–42% of the time showing these. You stand on stiff hands (12–16) and let them bust.'),
        h('li', null, h('b', null, 'Dealer 7–A are strong.'), ' They finish with 17+ about 74–88% of the time, so stiff hands must hit — standing on 16 against a 10 loses more often than hitting.'),
        h('li', null, h('b', null, 'Double when you are the favourite.'), ' 11 against anything but an Ace, 10 against 2–9: the extra bet goes out when the odds are on your side.'),
        h('li', null, h('b', null, 'Always split Aces and 8s; never split 10s, 5s or 4s.'), ' Two 8s are better than one 16 (the worst total); a pair of tens is 20 already.'),
        h('li', null, h('b', null, 'Soft hands can\'t bust on one card'), ', so they double and hit more aggressively than hard totals.'),
        h('li', null, h('b', null, 'Never take insurance'), ' without a count: it is a 7.7% edge side bet.')),
      h('h2', null, 'See it with real hands'),
      await (async () => { const e = await api('/learn/examples'); return h('div', null, e.blackjack.slice(0, 4).map(g => exGroup(g, bjExample)), P(h('a', { href: '#/learn/examples' }, 'More hand examples →'))); })(),
      P('The coach at the table explains the reason for every single decision — and flags when a card counter would deviate from this chart.'));
  },
  async counting() {
    const c = await api('/learn/bj-chart');
    const cards = [['2 3 4 5 6', '+1', 'low cards leaving the shoe help you'], ['7 8 9', '0', 'neutral'], ['10 J Q K A', '−1', 'high cards leaving the shoe hurt you']];
    return h('div', null,
      P('Card counting is a legal, purely mental technique: tens and aces help the player (more blackjacks, better doubles, more dealer busts), low cards help the dealer. By tracking the ratio of high to low cards left in the shoe you know when the odds tilt in your favour — and bet more then.'),
      h('div', { class: 'callout' }, h('b', null, 'Play-money note: '), 'counting here is just practice — it can\'t win real money or get you banned. In real casinos counting isn\'t illegal, but casinos may ask you to leave. Use the Counting Trainer to build speed and accuracy.'),
      h('h2', null, '1. Hi-Lo card values'),
      h('table', { class: 't' }, h('thead', null, h('tr', null, ['Cards', 'Count', 'Meaning'].map(x => h('th', null, x)))), h('tbody', null, cards.map(([a, b, d]) => h('tr', null, h('td', null, h('b', null, a)), h('td', null, h('b', { class: b.startsWith('+') ? 'win' : b === '0' ? '' : 'lose' }, b)), h('td', null, d))))),
      h('h2', null, '2. Running count'),
      P('Start at 0 on a freshly shuffled shoe. Add the value of every card you see — including every player\'s cards and the dealer\'s up card (and the hole card when it\'s revealed). Our blackjack table shows the running count HUD so you can check your own count against it (switch it off to test yourself).'),
      h('h2', null, '3. True count'),
      P('A running count of +6 means little with 5 decks left but a lot with 1 deck left. Divide by the decks remaining: ', h('b', null, 'true count = running count ÷ decks left'), '. With 6 decks and a cut card at ~75%, you can estimate decks left from the discard tray (our HUD shows it).'),
      h('h2', null, '4. Bet more when the count is high'),
      P('Each +1 of true count is worth roughly +0.5% to the player. The house edge (~0.5%) is gone at about +1. A simple ramp:'),
      h('table', { class: 't' }, h('thead', null, h('tr', null, ['True count', 'Bet', 'Player edge (approx.)'].map(x => h('th', null, x)))), h('tbody', null, [['≤ +1', '1 unit (minimum)', '−0.5% to 0%'], ['+2', '2 units', '+0.5%'], ['+3', '4 units', '+1.0%'], ['+4', '6 units', '+1.5%'], ['+5 or more', '8 units', '+2.0%+']].map(r => h('tr', null, r.map(x => h('td', null, x)))))),
      h('h2', null, '5. Index plays: change the chart when the count says so'),
      P('At high or low counts a few basic-strategy plays flip. The most valuable are insurance (take it at +3 or higher) and 16 vs 10 (stand at 0 or higher). The coach shows a blue "Count says…" note whenever one applies, and will never penalise you for ignoring it — those plays are bonus skill:'),
      h('div', { style: { overflowX: 'auto' } }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['Your hand', 'Dealer', 'Play', 'When'].map(x => h('th', null, x)))), h('tbody', null, c.devs.map(d => h('tr', null, h('td', null, d.hand), h('td', null, d.up), h('td', null, h('b', null, d.play)), h('td', null, d.when)))))),
      h('h2', null, '6. Why it\'s hard in real life'),
      h('ul', null, h('li', null, 'Continuous shuffling machines destroy the count; deep penetration (dealing most of the shoe) is what makes counting work.'), h('li', null, 'You must keep an accurate count while playing, talking and looking relaxed.'), h('li', null, 'Bet ramps are visible — casinos watch for big bet jumps — and counting has a long-run edge of only ~1%, with huge swings.')),
      h('h2', null, 'Index plays with real hands'),
      await (async () => { const e = await api('/learn/examples'); const g = e.blackjack[e.blackjack.length - 1]; return exGroup(g, bjExample); })(),
      P('Practise with the ', h('a', { href: '#/trainer' }, 'Counting Trainer'), ': flash cards, deck runs, true-count conversion, bet sizing and index-play drills.'));
  },
  async edge() {
    const rows = state.games.map(g => [g.icon + ' ' + g.name, g.edge, g.skill]);
    return h('div', null,
      P('The house edge is the share of every bet the casino expects to keep in the long run. A 2.7% edge on roulette means that, on average, you lose 2.7 chips for every 100 you bet — but a single session can swing far above or below that.'),
      h('table', { class: 't' }, h('thead', null, h('tr', null, ['Game', 'House edge', 'Skill matters?'].map(x => h('th', null, x)))), h('tbody', null, rows.map(([n, e, s]) => h('tr', null, h('td', null, n), h('td', null, e), h('td', null, s === 'high' ? 'Yes — a lot' : s === 'medium' ? 'Somewhat' : 'No'))))),
      h('h2', null, 'Rule of thumb for choosing bets'),
      h('ul', null, h('li', null, 'Cheapest: blackjack (basic strategy), craps pass/don\'t pass with max odds, baccarat banker, 9/6 Jacks or Better.'), h('li', null, 'Middle: roulette (single zero), Three Card Poker ante/play, Casino War, Let It Ride.'), h('li', null, 'Costly: side bets almost everywhere (7–25%), keno, money wheel, Seven Up, craps proposition bets.')),
      P('You can change a table\'s edge yourself: use the Rules tab for rule variations (payouts, paytables, commissions) or add a hand fee under Table settings — and watch the realized edge on ', h('a', { href: '#/house' }, 'The House'), ' page.'));
  },
  async bankroll() {
    const rows = [['Blackjack', 0.005, 1.15], ['Craps pass line', 0.014, 1.0], ['Roulette (straight-up bets)', 0.027, 5.7], ['Baccarat banker', 0.0106, 0.93], ['Slots (95% return, typical)', 0.05, 3.5]];
    return h('div', null,
      P('Variance is how far results swing around the average. Your expected loss grows with the number of bets, but your random swing grows with the square root — so over short sessions luck dominates and over long ones the edge wins.'),
      h('h2', null, 'How fast does an edge grind you down?'),
      h('table', { class: 't' }, h('thead', null, h('tr', null, ['Game', 'Edge', 'Typical swing per bet', 'Expected loss after 500 bets of 10', 'Random swing (1σ)'].map(x => h('th', null, x)))),
        h('tbody', null, rows.map(([n, e, sd]) => h('tr', null, h('td', null, n), h('td', null, (e * 100).toFixed(2) + '%'), h('td', null, '≈ ' + sd.toFixed(2) + ' bets'), h('td', null, '−' + fmt(500 * 10 * e)), h('td', null, '± ' + fmt(Math.sqrt(500) * 10 * sd)))))),
      P('Read the last two columns together: straight-up roulette\'s expected loss after 500 spins is 135 chips, but the luck factor is ±~1,270 — so many sessions end ahead and many end far behind.'),
      h('h2', null, 'Practical rules'),
      h('ul', null, h('li', null, 'Decide your session budget first and never chase losses.'), h('li', null, 'Smaller bets relative to your bankroll = longer play for the same expected loss.'), h('li', null, 'Bet sizing never changes the edge — only the speed and swing. (Except when counting cards, where it matters a lot.)'), h('li', null, 'The daily 1,000 free chips are a play budget, not an income. Treat chips as entertainment — and remember they are never worth real money.')),
      h('h2', null, 'Kelly in one paragraph'),
      P('If you ever have a true edge (e.g. counting at +4 for a +1.5% edge), the Kelly fraction ≈ edge ÷ variance suggests betting about 1.5%/1.3 ≈ 1% of your bankroll. Betting more than ~2× Kelly makes ruin likely; betting less than Kelly just grows slower.'));
  },
  async fallacies() {
    return h('div', null,
      h('h2', null, 'The gambler\'s fallacy'), P('"Red hasn\'t come up in 8 spins — it\'s due!" No: the wheel has no memory. The next spin is independent. Long streaks happen far more often than people expect: in 400 spins there is a 47.5% chance of seeing a run of 8 reds or more somewhere.'),
      h('h2', null, 'The hot hand'), P('The opposite error: "Slot 3 is paying — stay on it." Outcomes are independent; machines don\'t run hot or cold.'),
      h('h2', null, 'Near misses'), P('Two jackpot symbols and a third just above the line feels close — but reels are independent and digitally weighted. A near miss is exactly as likely as any other non-winning combination, and it\'s designed to feel exciting.'),
      h('h2', null, 'Betting systems (Martingale, Fibonacci, D\'Alembert…)'), P('Doubling after every loss "always" wins one unit — until you hit the table limit or run out of chips. The expected value of every bet is unchanged, so no system changes the long-run edge; they just trade many small wins for rare large losses.'),
      h('table', { class: 't' }, h('thead', null, h('tr', null, ['Martingale on red (European wheel)', 'Result (simulated, 200,000 runs)'].map(x => h('th', null, x)))), h('tbody', null, [
        ['Bet 10, double after each loss, goal +100, bankroll 1,000', 'Reaches +100 in 83.1% of runs…'],
        ['…and the other 16.9% of runs', 'end around −587 on average (the bankroll can\'t cover the next doubled bet)'],
        ['Net of both', 'about −16 chips per attempt — the 2.7% edge, exactly as maths predicts'],
        ['Over 500 spins', '90.5% chance of at least one 7-loss streak, which needs a 640-chip bet to keep the system going']].map(r => h('tr', null, r.map(x => h('td', null, x)))))),
      h('h2', null, 'Sunk cost & chasing'), P('Chips already lost are gone whatever you do next; every new bet should be judged only on its own odds.'),
      h('h2', null, 'What does work'), P('Choosing low-edge bets, learning real strategy (blackjack, video poker, Let It Ride), taking odds in craps, avoiding side bets, and setting a budget. The Review panel after every round tells you which of those you did.'));
  },
  async odds() {
    const ways = [[2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [7, 6], [8, 5], [9, 4], [10, 3], [11, 2], [12, 1]];
    return h('div', null,
      h('h2', null, 'Two dice'), h('table', { class: 't' }, h('thead', null, h('tr', null, ['Total', 'Ways (of 36)', 'Chance', 'True odds against'].map(x => h('th', null, x)))), h('tbody', null, ways.map(([t, w]) => h('tr', null, h('td', null, t), h('td', null, w), h('td', null, (w / 36 * 100).toFixed(1) + '%'), h('td', null, ((36 - w) / w).toFixed(2) + ' : 1'))))),
      h('h2', null, 'Cards'), h('ul', null, h('li', null, 'Chance a random card is a ten-value: 16/52 = 30.8%.'), h('li', null, 'Dealing a pair to a given hand in blackjack: ≈ 7.5% (6 decks).'), h('li', null, 'Blackjack on the first two cards: 4.8%.'), h('li', null, 'Video poker: a royal flush ≈ 1 in 40,000 hands; Jacks or better pair ≈ 21%.'), h('li', null, 'Baccarat: Banker wins 45.9%, Player 44.6%, Tie 9.5%.')),
      h('h2', null, 'Roulette (single zero)'), h('ul', null, h('li', null, 'Any single number: 1/37 = 2.7%, pays 35:1 (fair would be 36:1).'), h('li', null, 'Red/black: 18/37 = 48.65%, pays 1:1.'), h('li', null, 'Chance of at least one hit of a given number in 37 spins: 63.7%.')),
      h('h2', null, 'Converting odds'), P('Odds "a : b against" mean a/(a+b) chance of NOT happening. A 5:1 payout needs the event to occur more than 1 in 6 times to break even; compare the payout with the true odds to see the edge.'));
  },
};
