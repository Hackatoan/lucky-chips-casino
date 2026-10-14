'use strict';
// Helpers for declaring how a game behaves at shared tables.
//  parallel(): everyone plays their own rounds in a social room (chat, live feed, spectators can watch a player).
// (Games with a shared outcome declare their own `shared` object with mode:'simul'.)
const parallel = (max = 6, extra = {}) => ({ mode: 'parallel', max, secs: 0, primary: [], init: () => ({}), ...extra });
module.exports = { parallel };
