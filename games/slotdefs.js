'use strict';
// Slot machine definitions. `weights` = stops per symbol on each reel strip; the tuner pads blanks to reach targetRtp.
const L10 = [[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[1,0,1,2,1]];
const L20 = L10.concat([[0,1,0,1,0],[2,1,2,1,2],[1,1,0,1,1],[1,1,2,1,1],[0,1,1,1,0],[2,1,1,1,2],[0,0,1,0,0],[2,2,1,2,2],[1,0,1,0,1],[1,2,1,2,1]]);
const S = (id, emoji, name, extra = {}) => ({ id, emoji, name, ...extra });
const mulPays = (pays, f) => Object.fromEntries(Object.entries(pays).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([n, x]) => [n, Math.round(x * f * 10) / 10]))]));

module.exports = {
  classic: {
    id: 'slots_classic', name: 'Classic 777', icon: '🍒', theme: 'classic', mode: 'classic', reels: 3, rows: 3, units: 1, targetRtp: 0.94,
    blurb: 'Old-school three reels and one payline. Sevens, bars, bells and cherries.',
    symbols: [S('SEVEN', '7️⃣', 'Lucky Seven'), S('BAR', '🟥', 'BAR'), S('BELL', '🔔', 'Bell'), S('LEMON', '🍋', 'Lemon'), S('CHERRY', '🍒', 'Cherry')],
    weights: [{ SEVEN: 1, BAR: 2, BELL: 3, LEMON: 5, CHERRY: 6 }], cherry: 'CHERRY',
    pays: { SEVEN: { 3: 150 }, BAR: { 3: 40 }, BELL: { 3: 20 }, LEMON: { 3: 10 }, CHERRY: { 1: 1, 2: 4, 3: 12 } },
    rules: ['Three reels, one payline across the middle. Match three symbols to win; cherries pay from the left (one cherry on reel 1 returns your bet).', 'The exact payouts are in the paytable on the machine.'],
    tips: ['Low volatility: lots of small wins, rare big ones.'], volTip: 'Classic slots are low-volatility: frequent small wins keep your balance gently moving.',
  },
  fruit: {
    id: 'slots_fruit', name: 'Fruit Fiesta', icon: '🍉', theme: 'fruit', mode: 'lines', reels: 5, rows: 3, units: 10, lines: L10, targetRtp: 0.95, wild: 'WILD', scatter: 'SCAT',
    blurb: '5 reels, 10 lines, wilds and a free-spin bonus with a 2× multiplier.',
    symbols: [S('CHERRY', '🍒', 'Cherry'), S('LEMON', '🍋', 'Lemon'), S('ORANGE', '🍊', 'Orange'), S('PLUM', '🍑', 'Plum'), S('GRAPE', '🍇', 'Grapes'), S('BELL', '🔔', 'Bell'), S('SEVEN', '7️⃣', 'Seven'), S('WILD', '🃏', 'Wild'), S('SCAT', '🎁', 'Bonus')],
    weights: [{ CHERRY: 7, LEMON: 7, ORANGE: 6, PLUM: 5, GRAPE: 4, BELL: 3, SEVEN: 2, WILD: 0, SCAT: 1 }, { CHERRY: 7, LEMON: 7, ORANGE: 6, PLUM: 5, GRAPE: 4, BELL: 3, SEVEN: 2, WILD: 2, SCAT: 0 }, { CHERRY: 7, LEMON: 7, ORANGE: 6, PLUM: 5, GRAPE: 4, BELL: 3, SEVEN: 2, WILD: 2, SCAT: 1 }, { CHERRY: 7, LEMON: 7, ORANGE: 6, PLUM: 5, GRAPE: 4, BELL: 3, SEVEN: 2, WILD: 2, SCAT: 0 }, { CHERRY: 7, LEMON: 7, ORANGE: 6, PLUM: 5, GRAPE: 4, BELL: 3, SEVEN: 2, WILD: 0, SCAT: 1 }],
    pays: mulPays({ CHERRY: { 3: 2, 4: 6, 5: 20 }, LEMON: { 3: 2, 4: 6, 5: 20 }, ORANGE: { 3: 3, 4: 8, 5: 30 }, PLUM: { 3: 4, 4: 12, 5: 40 }, GRAPE: { 3: 5, 4: 18, 5: 60 }, BELL: { 3: 8, 4: 30, 5: 120 }, SEVEN: { 3: 15, 4: 60, 5: 300 }, WILD: { 3: 15, 4: 60, 5: 300 } }, 4),
    fs: { trigger: 3, spins: 8, mult: 2, extra: 4, retrigger: true },
    rules: ['10 paylines, wins pay left to right from reel 1. Wild substitutes for every symbol except the Bonus.', '3 or more 🎁 Bonus symbols anywhere trigger 8 free spins with every win doubled.', 'Your bet is per line × 10 lines.'],
    tips: ['Free spins carry most of the volatility — expect long dry stretches and occasional big bonus rounds.'], volTip: 'Medium volatility: the bonus round is where the big wins live.',
  },
  pharaoh: {
    id: 'slots_pharaoh', name: "Pharaoh's Gold", icon: '🏺', theme: 'egypt', mode: 'lines', reels: 5, rows: 3, units: 20, lines: L20, targetRtp: 0.95, wild: 'WILD', scatter: 'SCAT', expandWild: true,
    blurb: '20 lines, expanding wilds and a 10-spin pyramid bonus with a 3× multiplier. High volatility.',
    symbols: [S('VASE', '🏺', 'Vase'), S('SNAKE', '🐍', 'Cobra'), S('SCARAB', '🪲', 'Scarab'), S('EYE', '👁️', 'Eye of Ra'), S('BIRD', '🦅', 'Falcon'), S('KING', '👑', 'Pharaoh'), S('WILD', '☥', 'Ankh Wild'), S('SCAT', '🔺', 'Pyramid')],
    weights: [{ VASE: 8, SNAKE: 7, SCARAB: 6, EYE: 5, BIRD: 4, KING: 2, WILD: 0, SCAT: 1 }, { VASE: 8, SNAKE: 7, SCARAB: 6, EYE: 5, BIRD: 4, KING: 2, WILD: 2, SCAT: 1 }, { VASE: 8, SNAKE: 7, SCARAB: 6, EYE: 5, BIRD: 4, KING: 2, WILD: 2, SCAT: 1 }, { VASE: 8, SNAKE: 7, SCARAB: 6, EYE: 5, BIRD: 4, KING: 2, WILD: 2, SCAT: 1 }, { VASE: 8, SNAKE: 7, SCARAB: 6, EYE: 5, BIRD: 4, KING: 2, WILD: 0, SCAT: 1 }],
    pays: { VASE: { 3: 3, 4: 8, 5: 25 }, SNAKE: { 3: 3, 4: 10, 5: 30 }, SCARAB: { 3: 4, 4: 15, 5: 50 }, EYE: { 3: 6, 4: 25, 5: 100 }, BIRD: { 3: 10, 4: 40, 5: 200 }, KING: { 3: 20, 4: 100, 5: 750 }, WILD: { 3: 20, 4: 100, 5: 750 } },
    fs: { trigger: 3, spins: 10, mult: 3, extra: 4, retrigger: true },
    rules: ['20 paylines. Wilds on reels 2–4 expand to fill the whole reel during the pyramid bonus.', '3+ 🔺 Pyramids anywhere trigger 10 free spins with all wins tripled.'],
    tips: ['High volatility: bigger swings than Fruit Fiesta for the same return.'], volTip: 'High volatility: long quiet stretches, then occasional large bonus hits.',
  },
  dragon: {
    id: 'slots_dragon', name: 'Dragon Ways', icon: '🐉', theme: 'dragon', mode: 'ways', reels: 5, rows: 3, units: 20, targetRtp: 0.95, wild: 'WILD', scatter: 'SCAT',
    blurb: '243 ways to win — symbols pay left to right on adjacent reels, no paylines. Free spins with 2× wins.',
    symbols: [S('DRAGON', '🐉', 'Dragon'), S('LANTERN', '🏮', 'Lantern'), S('COIN', '🪙', 'Gold coin'), S('FAN', '🪭', 'Fan'), S('TEA', '🍵', 'Tea'), S('JADE', '💚', 'Jade'), S('WILD', '🌟', 'Wild'), S('SCAT', '🎆', 'Fireworks')],
    weights: [{ DRAGON: 2, LANTERN: 3, COIN: 4, FAN: 5, TEA: 6, JADE: 6, WILD: 0, SCAT: 1 }, { DRAGON: 2, LANTERN: 3, COIN: 4, FAN: 5, TEA: 6, JADE: 6, WILD: 2, SCAT: 1 }, { DRAGON: 2, LANTERN: 3, COIN: 4, FAN: 5, TEA: 6, JADE: 6, WILD: 2, SCAT: 1 }, { DRAGON: 2, LANTERN: 3, COIN: 4, FAN: 5, TEA: 6, JADE: 6, WILD: 2, SCAT: 1 }, { DRAGON: 2, LANTERN: 3, COIN: 4, FAN: 5, TEA: 6, JADE: 6, WILD: 1, SCAT: 1 }],
    pays: mulPays({ DRAGON: { 3: 2, 4: 6, 5: 20 }, LANTERN: { 3: 1, 4: 3, 5: 10 }, COIN: { 3: 1, 4: 2.5, 5: 8 }, FAN: { 3: 0.5, 4: 1.5, 5: 5 }, TEA: { 3: 0.4, 4: 1, 5: 3 }, JADE: { 3: 0.4, 4: 1, 5: 3 } }, 4),
    fs: { trigger: 3, spins: 8, mult: 2, extra: 3, retrigger: true },
    rules: ['No paylines: a symbol wins when it appears on adjacent reels starting from reel 1. Multiple matching symbols on a reel multiply your ways (3 × 2 × 1 × … = more ways).', '3+ 🎆 Fireworks trigger 8 free spins with wins doubled.'],
    tips: ['Ways-to-win slots hit often but pay small; free spins are where multiple ways stack.'], volTip: 'Medium-high volatility: ways multiply quickly when a reel is full of the same symbol.',
  },
  gems: {
    id: 'slots_gems', name: 'Gem Cascade', icon: '💎', theme: 'gems', mode: 'cluster', reels: 6, rows: 5, units: 1, targetRtp: 0.96, scatter: 'SCAT',
    blurb: 'Pays anywhere on a 6×5 grid: 8+ matching gems win, winners vanish and new gems fall. Free spins grow a multiplier.',
    symbols: [S('DIAMOND', '💎', 'Diamond'), S('TOPAZ', '🔶', 'Topaz'), S('SAPPH', '🔷', 'Sapphire'), S('EMER', '🟩', 'Emerald'), S('AMETH', '🟪', 'Amethyst'), S('SCAT', '🔮', 'Crystal ball')],
    weights: [{ DIAMOND: 3, TOPAZ: 5, SAPPH: 6, EMER: 7, AMETH: 8, SCAT: 1 }],
    pays: { DIAMOND: { 8: 1.5, 10: 5, 12: 20, 15: 100 }, TOPAZ: { 8: 0.8, 10: 2.5, 12: 10, 15: 50 }, SAPPH: { 8: 0.5, 10: 1.5, 12: 6, 15: 30 }, EMER: { 8: 0.3, 10: 1, 12: 4, 15: 20 }, AMETH: { 8: 0.2, 10: 0.8, 12: 3, 15: 15 } },
    fs: { trigger: 4, spins: 10, mult: 1, extra: 3, retrigger: true },
    rules: ['A 6×5 grid. Eight or more of the same gem ANYWHERE pay (more gems = more). Winning gems vanish and new ones drop in — the chain continues until nothing wins.', '4+ 🔮 Crystal balls trigger 10 free spins in which the multiplier grows by +1 on every cascade.'],
    tips: ['Volatile: chains of cascades make the screen explode, but most spins are small.'], volTip: 'High volatility: cascades and free-spin multipliers create big swings.',
  },
  bubble: {
    id: 'slots_bubble', name: 'Bubble Pop', icon: '🫧', theme: 'bubble', mode: 'cluster', reels: 6, rows: 5, units: 1, targetRtp: 0.965, scatter: 'SCAT',
    blurb: 'Pop bubbles! 6+ matching bubbles anywhere burst and new ones float up. Free spins grow a pop multiplier.',
    symbols: [S('RED', '🔴', 'Red bubble'), S('ORANGE', '🟠', 'Orange bubble'), S('YELLOW', '🟡', 'Yellow bubble'), S('GREEN', '🟢', 'Green bubble'), S('BLUE', '🔵', 'Blue bubble'), S('PURPLE', '🟣', 'Purple bubble'), S('SCAT', '⭐', 'Star bubble')],
    weights: [{ RED: 3, ORANGE: 4, YELLOW: 5, GREEN: 6, BLUE: 7, PURPLE: 7, SCAT: 1 }],
    pays: { RED: { 6: 0.8, 8: 3, 10: 12, 13: 80 }, ORANGE: { 6: 0.5, 8: 2, 10: 8, 13: 50 }, YELLOW: { 6: 0.4, 8: 1.5, 10: 6, 13: 30 }, GREEN: { 6: 0.3, 8: 1, 10: 4, 13: 20 }, BLUE: { 6: 0.2, 8: 0.8, 10: 3, 13: 15 }, PURPLE: { 6: 0.2, 8: 0.8, 10: 3, 13: 15 } },
    fs: { trigger: 4, spins: 10, mult: 1, extra: 3, retrigger: true },
    rules: ['A 6×5 grid of bubbles. Six or more of the same colour ANYWHERE pop and pay. Popped bubbles are replaced by new ones floating up, and the chain continues.', '4+ ⭐ Star bubbles trigger 10 free spins; during free spins each pop chain raises the multiplier.'],
    tips: ['Lower win threshold than Gem Cascade (6 vs 8), so wins are more frequent but smaller.'], volTip: 'Medium volatility: frequent pops with a free-spin multiplier for the big hits.',
  },
  jackpot: {
    id: 'slots_jackpot', name: 'Jackpot Sevens', icon: '💰', theme: 'jackpot', mode: 'classic', reels: 3, rows: 3, units: 1, targetRtp: 0.88, jackpot: { symbol: 'JP', seed: 2000, rate: 0.03, minBet: 10 },
    blurb: 'A shared progressive jackpot grows with every spin by every player. Hit 💰💰💰 with a 10+ bet to win the pot.',
    symbols: [S('JP', '💰', 'Jackpot'), S('SEVEN', '7️⃣', 'Lucky Seven'), S('BAR', '🟥', 'BAR'), S('BELL', '🔔', 'Bell'), S('CHERRY', '🍒', 'Cherry')],
    weights: [{ JP: 1, SEVEN: 2, BAR: 3, BELL: 4, CHERRY: 6 }], cherry: 'CHERRY',
    pays: { SEVEN: { 3: 100 }, BAR: { 3: 30 }, BELL: { 3: 15 }, CHERRY: { 1: 1, 2: 4, 3: 10 } },
    rules: ['Classic three reels, one payline. 3% of every bet on this machine (by any player) feeds the shared progressive jackpot.', 'Land 💰💰💰 on the payline with a bet of 10 or more to win the entire jackpot pool; it then resets to 2,000.'],
    tips: ['The base return is lower than other machines because 3% of each bet goes into the pool — over time that comes back out to whoever hits it.'], volTip: 'The jackpot is shared by all players, so it can grow very large.',
  },
};
