'use strict';
// Card = integer 0..51. rank = c % 13 (0='2' ... 12='A'), suit = floor(c/13) (0=S 1=H 2=D 3=C)
const R = require('./rng');
const RANKS = '23456789TJQKA';
const SUITS = 'SHDC';
const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const SUIT_NAMES = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
const SUIT_SYM = ['♠', '♥', '♦', '♣'];

const rank = c => c % 13;
const suit = c => (c / 13) | 0;
const str = c => RANKS[c % 13] + SUITS[(c / 13) | 0];
const strs = cs => cs.map(str);
const isRed = c => { const s = suit(c); return s === 1 || s === 2; };
const name = c => `${RANK_NAMES[rank(c)]} of ${SUIT_NAMES[suit(c)]}`;
// short, readable: "A♠", "10♥"
const short = c => (rank(c) === 8 ? '10' : RANKS[rank(c)]) + SUIT_SYM[suit(c)];
const shorts = cs => cs.map(short).join(' ');

function newDeck() { return Array.from({ length: 52 }, (_, i) => i); }
function newShoe(decks) {
  const s = [];
  for (let d = 0; d < decks; d++) for (let i = 0; i < 52; i++) s.push(i);
  return R.shuffle(s);
}
// Draw from state.shoe, reshuffling a fresh shoe if it runs dry (returns [card, reshuffled])
function draw(st, decks) {
  if (!st.shoe || st.shoe.length === 0) { st.shoe = newShoe(decks || 6); st.reshuffled = true; }
  return st.shoe.pop();
}

module.exports = { RANKS, SUITS, RANK_NAMES, SUIT_NAMES, SUIT_SYM, rank, suit, str, strs, isRed, name, short, shorts, newDeck, newShoe, draw };
