'use strict';
const TZ = process.env.CASINO_TZ || 'America/Los_Angeles';
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: TZ });
module.exports = { TZ, dayKey };
