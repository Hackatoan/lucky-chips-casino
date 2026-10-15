'use strict';
// Crawlable pages for search engines. The app itself is a hash-routed SPA (nothing after # is indexable), so every game gets a real
// server-rendered page (/games/<id>) with its rules, strategy, house edge and a play button, plus a hub, two strategy guides,
// sitemap.xml and robots.txt. All text comes from the games' own metadata, so it can't drift from the rules the app actually uses.
const SITE = process.env.SITE_URL || 'https://casino.hackatoa.com';
const NAME = 'Lucky Chips Casino';
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CAT = { cards: ['Card games', 'card game'], table: ['Table games', 'table game'], dice: ['Dice games', 'dice game'], machine: ['Slot machines', 'slot machine'], arcade: ['Arcade games', 'arcade casino game'] };

// A short original overview per game (what it is, what makes it interesting, how it differs from similar games).
const OVERVIEW = {
  blackjack: 'Blackjack is the card game where skill matters most: with basic strategy the house edge drops to about half a percent. Here you play a six-deck shoe with a live Hi-Lo count, all the usual side bets (Perfect Pairs, 21+3, Royal Match, Lucky Ladies, Buster), insurance, surrender and splits. A coach explains every decision, and at shared tables everyone plays against the same dealer hand.',
  roulette: 'Roulette is pure luck with an edge you can choose: the single-zero European wheel costs 2.70%, the American double-zero wheel 5.26%. Place inside bets (straight, split, street, corner) or outside bets (colours, dozens, columns), try the call bets (Voisins, Tiers, Orphelins), and switch on La Partage to halve the edge on even-money bets.',
  baccarat: 'Baccarat is simple to play and one of the best-value bets in any casino: Banker costs only 1.06%, Player 1.24%. You bet on which hand gets closer to nine; the drawing rules are automatic. Twelve bet types are available, including pairs, the Dragon Bonus and Super Six, each with its true edge shown.',
  craps: 'Craps looks busy but the best bets are the simplest: the Pass Line (1.41%) and Don\'t Pass (1.36%), plus free-odds behind them at 0% edge. This version includes every bet on the table — Place, Buy, Lay, Come, Don\'t Come, Hardways, Field and propositions — and a coach that points out which ones to avoid.',
  videopoker: 'Video poker is slot-machine speed with real strategy: hold the cards that give you the best expected value and the 9/6 Jacks or Better game returns over 99%. Five variants are included (Jacks or Better, Deuces Wild and more) with an optimal-hold coach and a double-up gamble.',
  holdem: 'Texas Hold\'em is no-limit poker against other players, not the house. Your two private cards are only ever sent to you, side pots are handled automatically, and the coach shows your equity and pot odds. Not enough players? Start a practice table and choose how many bots (1–7) sit down with you — they use free demo chips.',
  threecard: 'Three Card Poker is a fast casino poker game with one decision: play or fold. The simple Queen-6-4 rule gets you within a hair of perfect strategy (3.37% edge on Ante/Play). Pair Plus and the 6-Card Bonus are optional side bets, shown with their higher edges.',
  letitride: 'Let It Ride lets you pull back two of your three bets as the community cards appear. Every decision has an exact answer, and the coach computes the expected value of riding versus pulling so you can see how close each call really is.',
  war: 'Casino War is the simplest table game there is: you and the dealer each get one card and the higher card wins. On a tie you choose to go to war (about 2.9% edge) or surrender (about 3.7%). The Tie bet pays 10:1 but costs over 18%.',
  reddog: 'Red Dog (also called Acey-Deucey) asks whether a third card will fall between the first two. The spread decides the odds and your raise, and the coach shows when a raise is profitable and when it is not.',
  sicbo: 'Sic Bo is an ancient three-dice game with dozens of bets. Small and Big cost about 2.78%; single numbers, totals and specific triples pay far more but carry much bigger house edges — each one is listed with its exact odds.',
  chuckaluck: 'Chuck-a-Luck (Birdcage) rolls three dice against the number you pick. It looks generous because a match pays on each die, but the edge is still 7.87%. A great way to see how "even-looking" odds hide an edge.',
  sevenup: 'Seven Up is a quick two-dice game: bet that the total will be over seven, under seven, or exactly seven. The 7 pays 4:1, and the coach explains why the over/under bets are better value than they look.',
  crownanchor: 'Crown and Anchor is the classic six-symbol dice game from sailors and fairgrounds: pick symbols, roll three dice, and get paid per matching die. Simple, fast, and a good way to learn how multiple-match payouts work.',
  dice: 'Dice Roll lets you set the odds yourself: choose a target and roll over or under, and the payout adjusts to your win chance. The house edge is configurable, so you can see exactly how risk and reward trade off.',
  keno: 'Keno is a lottery-style game: pick up to ten numbers out of eighty and watch twenty get drawn. Three paytables with different edges are included, and the coach shows the real return for the number of spots you pick.',
  hilo: 'Hi-Lo is a card-guessing streak game: is the next card higher or lower? Each correct guess multiplies your stake and you can cash out any time. The probabilities are shown so you can judge when to stop.',
  plinko: 'Plinko drops balls through a pegboard into multiplier bins. Choose the number of rows and the risk level; low risk gives frequent small returns, high risk gives rare big ones — all at the same expected return.',
  mines: 'Mines is a minesweeper-style gamble: reveal safe tiles to grow your multiplier, but one mine ends the round. You choose how many mines hide on the grid and when to cash out.',
  wheel: 'The Money Wheel (Big Six) has 54 slots with payouts from $1 to 40:1. It is entertaining to watch and one of the highest-edge games in the casino, which is why the coach shows the edge on every bet before you place it.',
  slots_classic: 'Classic 777 is a three-reel slot with the old-school fruit-and-bar symbols and simple matching lines. With a 94.6% return it is a good example of how little control you have: there is no strategy, only bet size and session length.',
  slots_fruit: 'Fruit Frenzy is a five-reel video slot with multiple paylines, wilds and a free-spins bonus. It returns about 94.9% over the long run, and the paytable shows every symbol and how many lines pay.',
  slots_pharaoh: 'Pharaoh\'s Gold is an ancient-Egypt themed slot with expanding wilds and a scatter-triggered free-spins round with multipliers. Long-run return is about 95.5%.',
  slots_dragon: 'Dragon Fortune is a ways-to-win slot: symbols pay on adjacent reels from the left, with no fixed paylines. It returns about 95.2% and includes a free-spins bonus.',
  slots_gems: 'Gem Rush is a cluster-pays slot: match groups of gems anywhere on the grid, winners vanish and new gems fall in for chain reactions. Return is about 95.7%.',
  slots_bubble: 'Bubble Pop is a cascading cluster slot with the highest return in the lobby at about 97.0%. Pops chain together, so a single spin can pay several times.',
  slots_jackpot: 'Mega Jackpot is a progressive slot: a small slice of every bet from every player builds a shared jackpot pool. The base game returns about 87.8% plus the progressive, which is why it feels harder than the other machines.',
};
const GUIDE_BJ_ACTIONS = { H: 'Hit', S: 'Stand', D: 'Double (otherwise hit)', Ds: 'Double (otherwise stand)', P: 'Split', Ph: 'Split (otherwise hit)', R: 'Surrender (otherwise hit)', Rs: 'Surrender (otherwise stand)' };

const css = `body{margin:0;background:#06241c;color:#e3f0ea;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:#f3c253}a:hover{color:#ffe08a}.wrap{max-width:900px;margin:0 auto;padding:22px 18px 70px}
header.top{background:#0b3d2e;border-bottom:1px solid rgba(255,255,255,.12)}header.top .in{max-width:900px;margin:0 auto;padding:12px 18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header.top .logo{font-weight:800;font-size:1.15rem;text-decoration:none;color:#f3c253}header.top nav a{text-decoration:none;color:#cfe4d8;margin-right:14px;font-size:.95rem}
h1{font-size:2rem;margin:.4rem 0 .3rem;color:#f3c253}h2{font-size:1.25rem;margin:1.9rem 0 .5rem;color:#f3c253;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:.3rem}
.lead{font-size:1.1rem;color:#d6e6de}.crumbs{font-size:.85rem;color:#9db9ad}.crumbs a{color:#9db9ad}
.cta{display:flex;gap:10px;flex-wrap:wrap;margin:1.1rem 0}.btn{display:inline-block;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:700;border:1px solid rgba(255,255,255,.25);color:#e3f0ea}.btn.gold{background:#f3c253;color:#2b1d00;border-color:#f3c253}
.badge{display:inline-block;background:rgba(243,194,83,.14);border:1px solid rgba(243,194,83,.4);border-radius:99px;padding:2px 12px;margin:0 6px 6px 0;font-size:.85rem;color:#f3d68a}
ul,ol{padding-left:1.3rem}li{margin:.3rem 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;padding:0;list-style:none}
.card{display:block;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px 14px;text-decoration:none;color:#e3f0ea;height:100%;box-sizing:border-box}.card b{color:#f3c253;font-size:1.05rem}.card span{display:block;font-size:.88rem;color:#b8d0c4;margin-top:4px}
details{background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 14px;margin:8px 0}summary{cursor:pointer;font-weight:700}
table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{border:1px solid rgba(255,255,255,.14);padding:5px 7px;text-align:center}th{background:rgba(0,0,0,.3);color:#f3c253}td.S{background:#7d2a2a}td.H{background:#1d3d32}td.D,td.Ds{background:#1d4f7d}td.P,td.Ph{background:#2a7d4a}td.R,td.Rs{background:#6b5a1d}
footer{margin-top:2.5rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,.12);font-size:.85rem;color:#9db9ad;display:flex;gap:1.1rem;flex-wrap:wrap}.note{background:rgba(243,194,83,.1);border:1px solid rgba(243,194,83,.35);border-radius:10px;padding:.7rem 1rem;margin:1rem 0}`;

function layout({ path, title, description, body, ld = [], noindex = false }) {
  const url = SITE + path;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
<meta property="og:type" content="website"><meta property="og:site_name" content="${NAME}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${SITE}/og.png">
<meta name="theme-color" content="#0b3d2e"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-192.png"><link rel="manifest" href="/manifest.webmanifest">
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
<style>${css}</style></head><body>
<header class="top"><div class="in"><a class="logo" href="/">🎰 Lucky Chips</a><nav aria-label="Main"><a href="/games/">All games</a><a href="/guides/blackjack-basic-strategy">Blackjack strategy</a><a href="/guides/hi-lo-card-counting">Card counting</a><a href="/#/">Play now</a></nav></div></header>
<div class="wrap">${body}
<footer><a href="/">Home</a><a href="/games/">All games</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/cookies">Cookies</a><a href="/responsible">Play-money &amp; responsible play</a><a href="https://github.com/Hackatoan/lucky-chips-casino">GitHub</a><a href="https://hackatoa.com">hackatoa.com</a></footer></div></body></html>`;
}
const crumbsLd = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })) });
const trim = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

function gamePage(g, all) {
  const [catName, noun] = CAT[g.category] || ['Games', 'casino game'];
  const path = `/games/${g.id}`, rules = (g.meta && g.meta.rules) || [], tips = (g.meta && g.meta.tips) || [];
  const title = trim(`${g.name} — Free Play-Money ${noun.replace(/^./, c => c.toUpperCase())} | ${NAME}`, 70);
  const description = trim(`Play ${g.name} free online: ${g.blurb} House edge ${g.edge}. No deposit, no real money.`, 158);
  const related = all.filter(x => x.category === g.category && x.id !== g.id).slice(0, 6);
  const faq = [
    [`Is ${g.name} free to play here?`, `Yes. ${g.name} at ${NAME} uses play-money chips only. You get 1,000 free chips every day, chips have no cash value, and nothing can be bought or cashed out.`],
    [`What is the house edge in ${g.name}?`, `${g.edge}. ${tips[0] ? tips[0] : 'The coach shows the edge of every bet before you place it.'}`],
    [`Can I learn strategy while I play ${g.name}?`, `Yes. A built-in coach explains the odds and the best choice, and after every round a review shows what happened and why. ${g.skill === 'high' ? 'This is a skill game, so good decisions really change your results.' : g.skill === 'medium' ? 'There is some skill involved, so the coach tips matter.' : 'It is mostly luck, so the coach focuses on odds and bet sizing.'}`],
    [`Can I play ${g.name} with friends or against bots?`, g.shared ? `Yes. Open a public table to be seated with other players, create a private table and share the link or six-letter code, or watch bots play ${g.name} in the bot arena. ${g.id === 'holdem' ? 'Practice tables let you pick how many bots (1–7) play with you.' : ''}` : `${g.name} is a solo game, but you can watch the bot arena and compare results on the leaderboards.`],
  ];
  const ld = [
    crumbsLd([['Home', '/'], ['Games', '/games/'], [g.name, path]]),
    { '@context': 'https://schema.org', '@type': 'VideoGame', name: `${g.name} — ${NAME}`, description: g.blurb, url: SITE + path, genre: catName, gamePlatform: 'Web browser', applicationCategory: 'Game', operatingSystem: 'Any', inLanguage: 'en', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: { '@type': 'Organization', name: 'Hackatoa', url: 'https://hackatoa.com' }, image: `${SITE}/og.png` },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
  const body = `<p class="crumbs"><a href="/">Home</a> › <a href="/games/">Games</a> › ${esc(g.name)}</p>
<h1>${g.icon} ${esc(g.name)} — free play-money ${esc(noun)}</h1>
<p class="lead">${esc(g.blurb)}</p>
<p><span class="badge">House edge: ${esc(g.edge)}</span><span class="badge">${esc(catName)}</span><span class="badge">${g.skill === 'high' ? 'Skill game' : g.skill === 'medium' ? 'Some skill' : 'Pure luck'}</span><span class="badge">Free · no real money</span>${g.shared ? '<span class="badge">Play with friends or bots</span>' : ''}</p>
<div class="cta"><a class="btn gold" href="/#/g/${g.id}">▶ Play ${esc(g.name)} free</a>${g.shared ? `<a class="btn" href="/#/lobby">👥 Join a live table</a><a class="btn" href="/#/arena">🤖 Watch the bots</a>` : ''}</div>
<h2>About ${esc(g.name)}</h2><p>${esc(OVERVIEW[g.id] || g.blurb)}</p>
${rules.length ? `<h2>How to play ${esc(g.name)}</h2><ol>${rules.map(r => `<li>${esc(r)}</li>`).join('')}</ol>` : ''}
${tips.length ? `<h2>${esc(g.name)} strategy tips</h2><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
${g.id === 'blackjack' ? '<p>Want the full chart? See the <a href="/guides/blackjack-basic-strategy">blackjack basic strategy chart</a> and learn <a href="/guides/hi-lo-card-counting">Hi-Lo card counting</a>.</p>' : ''}
<h2>The house edge, explained</h2><p>${esc(g.name)} has a house edge of <b>${esc(g.edge)}</b>. The edge is the share of every wager the casino expects to keep over a very long run — it never promises what happens in one session. ${g.skill === 'high' ? 'Because this is a skill game, correct decisions lower the edge; the coach tells you the best play on every hand.' : 'Nothing you do changes the odds of the game itself, but choosing the lower-edge bets and sizing them sensibly does change how fast a bankroll drains.'} At ${NAME} the edge shown here is the one the game really uses, measured by simulation or exact enumeration.</p>
<h2>What you get at ${esc(NAME)}</h2><ul><li><b>Free chips every day</b> — 1,000 play-money chips, no deposit, no cash value.</li><li><b>A coach</b> that explains the odds and the best move, and a review after each round.</li><li><b>Fair, tested games</b> — payouts and edges are verified in the project's open test-suite.</li>${g.shared ? '<li><b>Shared tables</b> — public tables, private tables with a link or code, queues, spectators and a bot arena.</li>' : ''}<li><b>Works anywhere</b> — in your browser on desktop and phone, installable as an app.</li></ul>
<h2>Frequently asked questions</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
${related.length ? `<h2>More ${esc(catName.toLowerCase())}</h2><ul class="grid">${related.map(r => `<li><a class="card" href="/games/${r.id}"><b>${r.icon} ${esc(r.name)}</b><span>${esc(trim(r.blurb, 90))}</span></a></li>`).join('')}</ul>` : ''}
<p class="note">${esc(NAME)} is a free play-money game for entertainment and learning. Chips have no cash value and can never be cashed out. You must be 18 or older. <a href="/responsible">Responsible play</a> · <a href="/terms">Terms</a></p>`;
  return { path, html: layout({ path, title, description, body, ld }) };
}

function hubPage(all) {
  const groups = {}; for (const g of all) (groups[g.category] = groups[g.category] || []).push(g);
  const title = `${all.length} Free Casino Games with a Strategy Coach | ${NAME}`;
  const description = trim(`Play ${all.length} free casino games online — blackjack, roulette, baccarat, craps, Texas Hold'em, poker, slots and more. Play money only, with a coach that teaches strategy.`, 158);
  const body = `<p class="crumbs"><a href="/">Home</a> › Games</p><h1>${all.length} free play-money casino games</h1>
<p class="lead">Blackjack, roulette, baccarat, craps, Texas Hold'em, video poker, slots and more — all with play-money chips, a strategy coach that explains every move, and live tables you can share with friends. No deposit, no real money, nothing to cash out.</p>
<div class="cta"><a class="btn gold" href="/#/">▶ Start playing</a><a class="btn" href="/#/arena">🤖 Watch the bots</a></div>
${Object.entries(CAT).filter(([k]) => groups[k]).map(([k, [name]]) => `<h2>${esc(name)}</h2><ul class="grid">${groups[k].map(g => `<li><a class="card" href="/games/${g.id}"><b>${g.icon} ${esc(g.name)}</b><span>${esc(trim(g.blurb, 110))}</span><span>House edge: ${esc(g.edge)}</span></a></li>`).join('')}</ul>`).join('')}
<h2>Learn the games</h2><ul><li><a href="/guides/blackjack-basic-strategy">Blackjack basic strategy chart</a> — the right play for every hand against every dealer card.</li><li><a href="/guides/hi-lo-card-counting">Hi-Lo card counting for beginners</a> — the running count, the true count and bet sizing.</li></ul>
<p class="note">Free play-money games for entertainment and learning. Chips have no cash value. 18+. <a href="/responsible">Responsible play</a></p>`;
  const ld = [crumbsLd([['Home', '/'], ['Games', '/games/']]), { '@context': 'https://schema.org', '@type': 'ItemList', name: `${NAME} games`, itemListElement: all.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/games/${g.id}`, name: g.name })) }];
  return { path: '/games/', html: layout({ path: '/games/', title, description, body, ld }) };
}

function bjChartPage(games) {
  const c = games.blackjack._t.chartData(), ups = c.ups, up = u => (u === 11 ? 'A' : u);
  const row = (label, cells) => `<tr><th scope="row">${esc(label)}</th>${cells.map(a => `<td class="${esc(a)}">${esc(a)}</td>`).join('')}</tr>`;
  const table = (cap, rows) => `<table><caption style="text-align:left;margin:.4rem 0;color:#cfe4d8">${esc(cap)}</caption><thead><tr><th>You</th>${ups.map(u => `<th>${up(u)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  const hard = Object.entries(c.hard).sort((a, b) => a[0] - b[0]).map(([k, v]) => row(`Hard ${k}`, v));
  const soft = Object.entries(c.soft).sort((a, b) => a[0] - b[0]).map(([k, v]) => row(`Soft ${k}`, v));
  const pairs = Object.entries(c.pairs).sort((a, b) => a[0] - b[0]).map(([k, v]) => row(`Pair of ${k === '11' ? 'Aces' : k + 's'}`, v));
  const title = `Blackjack Basic Strategy Chart (6 Decks) | ${NAME}`;
  const description = 'Free blackjack basic strategy chart for six decks: when to hit, stand, double, split and surrender against every dealer upcard, plus the reasons behind the plays.';
  const body = `<p class="crumbs"><a href="/">Home</a> › Guides › Blackjack basic strategy</p><h1>Blackjack basic strategy chart</h1>
<p class="lead">Basic strategy is the mathematically best play for every hand against every dealer upcard. Using it cuts the house edge on this six-deck, dealer-stands-on-17 game to about 0.5%.</p>
<div class="cta"><a class="btn gold" href="/#/g/blackjack">▶ Practice with the live coach</a><a class="btn" href="/guides/hi-lo-card-counting">Learn card counting</a></div>
<p>Legend: <b>H</b> hit · <b>S</b> stand · <b>D</b> double (hit if not allowed) · <b>Ds</b> double (stand if not allowed) · <b>P</b> split · <b>Ph</b> split if double after split is allowed, otherwise hit · <b>R</b> surrender if allowed, otherwise hit. Columns are the dealer's upcard (A = Ace).</p>
${table('Hard totals', hard)}<br>${table('Soft totals (hand contains an Ace counted as 11)', soft)}<br>${table('Pairs', pairs)}
<h2>The ideas behind the chart</h2><ul><li><b>Dealer bust cards (2–6):</b> when the dealer shows a weak card, stand on stiff totals (12–16) and double or split more — let them take the risk.</li><li><b>Dealer strong cards (7–A):</b> assume the dealer makes a hand, so hit stiff totals until you reach 17.</li><li><b>Always split Aces and 8s; never split 10s or 5s.</b> Two hands starting on an Ace are valuable; 16 is the worst total, and splitting 8s turns it into two decent starts.</li><li><b>Double with 11 and usually 10</b> — you are the favourite and the extra money is well spent.</li><li><b>Never take insurance</b> unless you are counting cards and the true count is +3 or higher.</li></ul>
<h2>Frequently asked questions</h2>
<details><summary>Is basic strategy the same in every game?</summary><p>Close but not identical. This chart is for six decks, dealer stands on all 17s, double after split allowed and late surrender. Rules like dealer hits soft 17 or fewer decks change a handful of plays.</p></details>
<details><summary>Does basic strategy guarantee I will win?</summary><p>No. It minimises the house edge (about 0.5%) but individual sessions swing wildly. The coach in the game grades every decision and explains the reasoning.</p></details>
<details><summary>What about card counting?</summary><p>Counting uses the same chart plus a few "index" deviations. Start with the <a href="/guides/hi-lo-card-counting">Hi-Lo counting guide</a> and the free counting trainer.</p></details>
<p class="note">Play-money learning tool. <a href="/responsible">Responsible play</a> · 18+.</p>`;
  const ld = [crumbsLd([['Home', '/'], ['Guides', '/games/'], ['Blackjack basic strategy', '/guides/blackjack-basic-strategy']]), { '@context': 'https://schema.org', '@type': 'Article', headline: 'Blackjack basic strategy chart', description, url: SITE + '/guides/blackjack-basic-strategy', author: { '@type': 'Organization', name: 'Hackatoa' }, publisher: { '@type': 'Organization', name: 'Hackatoa', url: 'https://hackatoa.com' }, dateModified: new Date().toISOString().slice(0, 10) }];
  return { path: '/guides/blackjack-basic-strategy', html: layout({ path: '/guides/blackjack-basic-strategy', title, description, body, ld }) };
}

function countingPage() {
  const title = `Hi-Lo Card Counting for Beginners | ${NAME}`;
  const description = 'Learn Hi-Lo card counting step by step: card values, the running count, converting to the true count, betting ramps and index plays — with a free trainer.';
  const body = `<p class="crumbs"><a href="/">Home</a> › Guides › Hi-Lo card counting</p><h1>Hi-Lo card counting for beginners</h1>
<p class="lead">Hi-Lo is the most popular blackjack counting system. You keep one number in your head that tells you whether the remaining cards favour you or the dealer — then you bet more when they favour you.</p>
<div class="cta"><a class="btn gold" href="/#/trainer">▶ Open the free counting trainer</a><a class="btn" href="/games/blackjack">Play blackjack with the count shown</a></div>
<h2>1. Card values</h2><table><thead><tr><th>Cards</th><th>Value</th><th>Why</th></tr></thead><tbody><tr><td>2 · 3 · 4 · 5 · 6</td><td>+1</td><td>Low cards leaving the shoe help the player</td></tr><tr><td>7 · 8 · 9</td><td>0</td><td>Neutral</td></tr><tr><td>10 · J · Q · K · A</td><td>−1</td><td>High cards left in the shoe help the player</td></tr></tbody></table>
<h2>2. The running count</h2><p>Start at 0 with a fresh shoe. Add or subtract each card as it is dealt. A full deck always ends at 0, which is a great way to check yourself — the trainer's "deck run" does exactly this.</p>
<h2>3. The true count</h2><p>Divide the running count by the number of decks left. A running count of +6 with three decks remaining is a true count of +2. The true count is what matters, because the same running count is stronger when fewer cards remain.</p>
<h2>4. Bet sizing</h2><p>Bet one unit at a true count of +1 or lower, then ramp up: 2 units at +2, 4 at +3, 6 at +4, up to 8 at +5 and above. Never bet more when the count is negative.</p>
<h2>5. Index plays</h2><p>The count also changes a few decisions: take insurance at +3 or higher, stand on 16 against a 10 at 0 or higher, double 11 against an Ace at +1 or higher, and so on. The blackjack coach flags when an index play applies.</p>
<h2>Frequently asked questions</h2>
<details><summary>Is card counting legal?</summary><p>Counting in your head is legal in most places, but casinos can ask counters to leave. Here it is all play money, so it is a pure learning exercise.</p></details>
<details><summary>How long does it take to learn Hi-Lo?</summary><p>Most people can keep an accurate count in a few weeks of short daily practice. Start with single cards, then pairs, then full deck runs against the clock.</p></details>
<details><summary>Does counting work in this game?</summary><p>Yes — the six-deck shoe is real, penetration is 75%, and the live count, true count and bet-sizing hints are shown so you can compare your count against the true one.</p></details>
<p class="note">Educational play-money content. <a href="/responsible">Responsible play</a> · 18+.</p>`;
  const ld = [crumbsLd([['Home', '/'], ['Guides', '/games/'], ['Hi-Lo card counting', '/guides/hi-lo-card-counting']]), { '@context': 'https://schema.org', '@type': 'HowTo', name: 'How to count cards with Hi-Lo', description, step: [{ '@type': 'HowToStep', name: 'Learn the card values', text: '2–6 are +1, 7–9 are 0, 10 through Ace are −1.' }, { '@type': 'HowToStep', name: 'Keep a running count', text: 'Start at 0 and add each dealt card’s value.' }, { '@type': 'HowToStep', name: 'Convert to the true count', text: 'Divide the running count by the decks remaining.' }, { '@type': 'HowToStep', name: 'Size your bets', text: 'Bet one unit at +1 or lower and ramp up as the true count rises.' }] }];
  return { path: '/guides/hi-lo-card-counting', html: layout({ path: '/guides/hi-lo-card-counting', title, description, body, ld }) };
}

function build(games) {
  const all = Object.values(games).sort((a, b) => 0).map(g => ({ id: g.id, name: g.name, icon: g.icon, category: g.category, skill: g.skill, blurb: g.blurb, edge: g.edge, meta: g.meta, shared: g.shared }));
  const pages = new Map();
  for (const p of [hubPage(all), bjChartPage(games), countingPage(), ...all.map(g => gamePage(g, all))]) pages.set(p.path, p.html);
  const urls = [['/', 1.0, 'weekly'], ['/games/', 0.9, 'weekly'], ['/guides/blackjack-basic-strategy', 0.8, 'monthly'], ['/guides/hi-lo-card-counting', 0.8, 'monthly'], ...all.map(g => ['/games/' + g.id, 0.7, 'monthly']), ['/terms', 0.2, 'yearly'], ['/privacy', 0.2, 'yearly'], ['/cookies', 0.2, 'yearly'], ['/responsible', 0.3, 'yearly']];
  const day = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, pr, f]) => `  <url><loc>${SITE}${u}</loc><lastmod>${day}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`;
  const robots = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /embed/\nDisallow: /stream\n\nSitemap: ${SITE}/sitemap.xml\n`;
  return { pages, sitemap, robots, urls: urls.map(u => SITE + u[0]) };
}
module.exports = { build, SITE };
