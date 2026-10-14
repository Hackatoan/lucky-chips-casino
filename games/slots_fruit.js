'use strict';
const { makeGame } = require('../lib/slotkit');
const defs = require('./slotdefs');
let tuned = {}; try { tuned = require('./slots.tuned.json'); } catch {}
module.exports = makeGame(defs.fruit, tuned['fruit']);
