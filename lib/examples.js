'use strict';
// Worked example hands for the Learn pages. Every recommendation is computed by the same engines the live coach uses.
const C = require('./cards');
const games = require('../games');

const R = '23456789TJQKA', S = 'SHDC';
const cd = s => R.indexOf(s[0]) + 13 * S.indexOf(s[1]);          // "AS" -> card int
const val = c => { const r = c % 13; return r === 12 ? 11 : r >= 8 ? 10 : r + 2; };
let cache = null;

function blackjack() {
  const bj = games.blackjack._t;
  const mk = (hand, up, note, tc) => {
    const cards = hand.map(cd), upc = cd(up), upv = val(upc);
    const can = { double: true, split: cards.length === 2 && val(cards[0]) === val(cards[1]), surrender: true, hit: true };
    const bp = bj.bestPlay(cards, upv, can);
    let play = bj.PLAY_NAME[bp.code], why = bj.whyBest(bp.code, bp.base, cards, upv), tag = note;
    if (tc !== undefined) {
      tag = `Count ${tc >= 0 ? '+' : ''}${tc}`;
      const dev = bj.deviation(cards, upv, tc, can);
      if (dev) { play = bj.PLAY_NAME[dev.play]; why = `Basic strategy says ${bj.PLAY_NAME[bp.code]}, but at a true count of ${tc >= 0 ? '+' : ''}${tc} the deck is ${dev.dir === '>=' ? 'rich in tens, which changes the maths' : 'poor in tens'}: ${bj.PLAY_NAME[dev.play]} is better.`; tag = `Count ${tc >= 0 ? '+' : ''}${tc}`; }
    }
    return { player: hand, dealer: up, play, why, tag };
  };
  return [
    { title: 'Split these — always', blurb: 'Aces and eights are the two pairs you split against everything.', hands: [mk(['AS', 'AH'], '6D'), mk(['8S', '8H'], 'TD', 'against a ten'), mk(['8C', '8D'], '9S')] },
    { title: 'Never split these', blurb: 'A pair of tens is 20 and fives make a perfect 10 — don\'t break them up.', hands: [mk(['TS', 'TH'], '6D'), mk(['5S', '5H'], '6C'), mk(['5C', '5D'], 'TS')] },
    { title: 'Split… or stand? It depends on the dealer', blurb: 'Same pair of nines, different dealer card.', hands: [mk(['9S', '9H'], '6D', 'dealer weak'), mk(['9C', '9D'], '7S', 'dealer has 7'), mk(['9S', '9D'], 'AS', 'dealer has Ace')] },
    { title: 'Double down', blurb: 'Put more money out when the odds favour you.', hands: [mk(['6S', '5H'], '6D'), mk(['5S', '4H'], '4D'), mk(['6C', '4D'], '9S', '10 vs a 9'), mk(['AS', '6H'], '5D', 'soft hand')] },
    { title: 'Same hand, different play', blurb: 'The dealer\'s upcard changes everything. Compare these pairs of examples.', hands: [mk(['9S', '4H'], '3D', '13 vs weak dealer'), mk(['9C', '4D'], '9S', '13 vs strong dealer'), mk(['TS', '2H'], '6D', '12 vs a 6'), mk(['TC', '2D'], '3S', '12 vs a 3')] },
    { title: 'Stiff hands', blurb: '12–16 are the worst hands: each one is a loser either way, so choose the lesser loss.', hands: [mk(['TS', '6H'], '6D'), mk(['TC', '6D'], '9S'), mk(['TS', '5H'], 'TD'), mk(['9S', '8H'], 'AS')] },
    { title: 'Surrender', blurb: 'Giving up half is the cheapest loss against a strong dealer card.', hands: [mk(['TS', '6H'], 'TD'), mk(['9S', '7H'], '9D'), mk(['TC', '5D'], 'TS'), mk(['8S', '7H'], 'AS', '15 vs Ace: just hit')] },
    { title: 'Soft hands (with an Ace)', blurb: 'An Ace counted as 11 means you can\'t bust on one card.', hands: [mk(['AS', '7H'], '3D', 'soft 18'), mk(['AC', '7D'], '9S', 'soft 18'), mk(['AS', '8H'], '6D', 'soft 19'), mk(['AS', '2H'], '5D', 'soft 13')] },
    { title: 'Card counting: when the count changes the play', blurb: 'Same hand, same dealer card — only the true count differs.', hands: [mk(['TS', '6H'], 'TD', undefined, -1), mk(['TC', '6D'], 'TS', undefined, 1), mk(['TS', '4H'], 'TD', undefined, 1), mk(['TC', '4D'], 'TS', undefined, 5), mk(['TS', '2H'], '3D', undefined, 3)] },
  ];
}

function videoPoker() {
  const vp = games.videopoker._t, V = vp.VARIANTS['jacks-96'];
  const mk = (hand, note) => {
    const cards = hand.map(cd), rest = []; for (let c = 0; c < 52; c++) if (!cards.includes(c)) rest.push(c);
    const evs = vp.evAll(cards, rest, V);
    const order = evs.map((ev, m) => ({ m, ev })).sort((a, b) => b.ev - a.ev);
    const best = order[0], bestName = vp.holdName(cards, best.m, V);
    const second = order.find(x => x.m !== best.m && vp.holdName(cards, x.m, V) !== bestName) || order[1];   // best hold with a DIFFERENT idea
    return { cards: hand, hold: [0, 1, 2, 3, 4].map(i => !!(best.m >> i & 1)), name: vp.holdName(cards, best.m, V), ev: best.ev, alt: { name: vp.holdName(cards, second.m, V), ev: second.ev }, tag: note };
  };
  return [
    { title: 'A paying pair beats most draws', blurb: 'Jacks or Better 9/6: keep the pair and throw everything else away.', hands: [mk(['JS', 'JH', '4D', '7C', '9H']), mk(['KS', 'KC', 'QD', 'JD', '2H'], 'pair beats the inside draw'), mk(['AS', 'AD', '5S', '6S', '7S'], 'pair of aces vs 3 suited')] },
    { title: 'Four to a royal beats a pair', blurb: 'The royal pays 800× — even a one-in-47 chance is worth breaking a high pair.', hands: [mk(['AS', 'KS', 'QS', 'JS', '9D'], '4 to a royal'), mk(['AS', 'KS', 'QS', 'JS', 'JD'], 'royal draw beats the jacks pair'), mk(['KH', 'QH', 'JH', 'TH', '2C'])] },
    { title: 'Low pair or flush draw?', blurb: 'The exact EV decides — and the answer surprises many people.', hands: [mk(['5S', '5H', 'AD', '9D', '2D'], 'a low pair is still worth keeping'), mk(['4S', '4H', '9H', 'JH', 'QH'], 'four to a flush beats a low pair'), mk(['7S', '7D', '8H', 'JH', 'AH'], 'low pair beats three suited cards')] },
    { title: 'Don\'t break a made flush or straight', blurb: 'A made flush pays 6× — never throw it away to chase a royal.', hands: [mk(['AH', 'KH', 'QH', '9H', '3H'], 'made flush'), mk(['5S', '6D', '7H', '8C', '9S'], 'made straight')] },
    { title: 'Nothing to keep?', blurb: 'Sometimes the best hold is none of them — discard all five.', hands: [mk(['2S', '5D', '8H', 'TC', '3H'], 'no pair, no draw'), mk(['3S', '7D', '9H', 'QC', '2H'], 'one high card alone: keep it')] },
  ];
}

function cardGames() {
  const l = games.letitride._t, t = games.threecard._t;
  const lir = (hand, note) => { const e = l.ev3(hand.map(cd)); return { cards: hand, play: e.ride >= e.pull ? 'Let it ride' : 'Pull the bet back', evRide: e.ride, evPull: e.pull, tag: note }; };
  const tcp = (hand, note) => { const s = t.score3(hand.map(cd)); const play = s.v >= t.Q64; return { cards: hand, play: play ? 'Play' : 'Fold', name: s.name, tag: note }; };
  return {
    letitride: { title: 'Let It Ride — bet 1', blurb: 'Exact expected values: ride only when you already have a paying hand or a monster draw.', hands: [lir(['TS', 'TH', '4D'], 'pair of tens'), lir(['KS', 'QS', 'JS'], '3 to a royal'), lir(['AS', 'KH', '9D'], 'two high cards'), lir(['8S', '8H', 'AD'], 'low pair'), lir(['7S', '8S', '9S'], '3 to a straight flush'), lir(['2S', '7D', 'JH'], 'junk')] },
    threecard: { title: 'Three Card Poker — Q-6-4 rule', blurb: 'Play Queen-6-4 or better; fold anything lower. Pairs and better always play.', hands: [tcp(['QS', '6H', '4D'], 'exactly Q-6-4: play'), tcp(['QC', '6D', '3S'], 'one pip lower: fold'), tcp(['KS', '2H', '3D'], 'king high but low kickers'), tcp(['4S', '4H', '2D'], 'any pair plays'), tcp(['JS', 'TH', '9D'], 'straight plays')] },
  };
}

module.exports = { all() { if (!cache) cache = { blackjack: blackjack(), videopoker: videoPoker(), cards: cardGames() }; return cache; } };
