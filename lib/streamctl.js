'use strict';
// Control for the 24/7 /stream scene: a chat-picked game that overrides the timed rotation for a while, and a tiny event bus
// (server-sent events) the scene listens to for follow/sub alerts and instant table switches.
const clients = new Set();
const MAX_CLIENTS = 20;                 // the broadcast browser plus a few previews; it's public, so keep it bounded
const state = { override: null, lastSwitch: 0 };

function listen(req, res) {
  if (clients.size >= MAX_CLIENTS) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end('busy'); }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  clients.add(res);
  const ka = setInterval(() => res.write(': ka\n\n'), 25000);
  req.on('close', () => { clearInterval(ka); clients.delete(res); });
}
function emit(event, data) {
  const s = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const r of clients) { try { r.write(s); } catch {} }
}
function setOverride(game, mins) {
  state.override = { game, until: Date.now() + mins * 60e3 };
  state.lastSwitch = Date.now();
  emit('switch', { game });
}
function override() {
  if (state.override && state.override.until <= Date.now()) state.override = null;
  return state.override;
}
module.exports = { listen, emit, setOverride, override, state };
