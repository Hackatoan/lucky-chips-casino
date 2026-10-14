'use strict';
// Helpers for building the post-round "review" payload every game returns.
// Item kinds: good | bad | info | tip | warn
const item = k => t => ({ k, t });
const good = item('good'), bad = item('bad'), info = item('info'), tip = item('tip'), warn = item('warn');

function fmt(n) { return Math.abs(Math.round(n)).toLocaleString('en-US'); }
function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(n); }
function tone(net) { return net > 0 ? 'win' : net < 0 ? 'lose' : 'push'; }
function pct(x, d = 1) { return (x * 100).toFixed(d) + '%'; }

// make a review. sections: [[title, [items]]...]  (empty sections dropped)
function review(headline, net, sections) {
  return {
    headline, net, tone: tone(net),
    sections: sections.filter(s => s && s[1] && s[1].length).map(([title, items]) => ({ title, items })),
  };
}

// Expected-loss line used by almost every game
function edgeLine(wagered, edge, label) {
  const loss = wagered * edge;
  return info(`${label ? label + ': ' : ''}house edge ${(edge * 100).toFixed(2)}% → on ${fmt(wagered)} wagered you should expect to lose about ${loss < 0.05 ? '0' : loss.toFixed(loss < 10 ? 2 : 1)} chips per round on average.`);
}

module.exports = { good, bad, info, tip, warn, fmt, signed, tone, pct, review, edgeLine };
