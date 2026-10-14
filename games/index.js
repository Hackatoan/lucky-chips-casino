'use strict';
// Registry. Order here = order in the lobby.
const ids = [
  'blackjack', 'roulette', 'baccarat', 'craps', 'videopoker', 'threecard', 'letitride', 'war', 'reddog',
  'sicbo', 'chuckaluck', 'sevenup', 'crownanchor', 'dice',
  'keno', 'hilo', 'plinko', 'mines', 'wheel',
  // slots live at the bottom of the lobby
  'slots_classic', 'slots_fruit', 'slots_pharaoh', 'slots_dragon', 'slots_gems', 'slots_bubble', 'slots_jackpot',
];
const games = {};
for (const id of ids) {
  try { games[id] = require('./' + id); }
  catch (e) {
    // skip only when the game file itself is absent; real errors inside a game must surface
    if (e.code === 'MODULE_NOT_FOUND' && String(e.message).split('\n')[0].includes(`'./${id}'`)) continue;
    throw e;
  }
}
module.exports = games;
