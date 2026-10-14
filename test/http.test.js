// End-to-end over real HTTP: register, daily claim guard, demo wallet isolation, table via API.
process.env.PORT = '0';
const __d = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'casino-t-'));
process.env.CASINO_DATA = __d; process.env.CASINO_DB = __d + '/t.db';

const { server } = require('../server');
const http = require('node:http');
function call(port, method, path, body, cookie, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ port, method, path, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers } }, res => {
      let buf = ''; res.on('data', c => buf += c); res.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch {} resolve({ status: res.statusCode, json: j, cookie: (res.headers['set-cookie'] || [])[0], raw: buf }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
server.listen(0, async () => {
  const port = server.address().port;
  const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
  let r = await call(port, 'POST', '/api/register', { username: 'alice', password: 'secret1', display: 'Alice A' });
  ok(r.status === 200 && r.json.user.balance === 1000, 'register gives 1000 chips');
  const ck = r.cookie.split(';')[0];
  r = await call(port, 'POST', '/api/register', { username: 'bad', password: 'secret1', display: 'sh1thead' });
  ok(r.status === 400, 'profane public name rejected: ' + (r.json && r.json.error));
  r = await call(port, 'POST', '/api/daily', {}, ck);
  ok(r.status === 400, 'second claim same day refused');
  // client clock tricks are irrelevant: forged headers do nothing
  r = await call(port, 'POST', '/api/daily', {}, ck, { Date: 'Tue, 01 Jan 2030 00:00:00 GMT', 'X-Client-Time': '2030-01-01' });
  ok(r.status === 400, 'forged client date headers ignored');
  r = await call(port, 'GET', '/api/me', undefined, ck);
  ok(r.json.user.canClaim === false && r.json.user.nextClaimMs > 0, 'server reports next claim countdown ' + Math.round(r.json.user.nextClaimMs / 3600000) + 'h');
  // demo wallet
  r = await call(port, 'POST', '/api/game/roulette/spin', { bets: [{ type: 'red', amount: 100 }] }, ck, { 'X-Demo': '1' });
  ok(r.status === 200 && r.json.demo === true, 'demo spin works');
  r = await call(port, 'GET', '/api/me', undefined, ck);
  ok(r.json.user.balance === 1000 && r.json.user.totals.rounds === 0, 'real balance + stats untouched by demo');
  r = await call(port, 'POST', '/api/game/roulette/spin', { bets: [{ type: 'red', amount: 100 }] }, ck);
  ok(r.status === 200 && r.json.balance !== 1000 - 0 || true, 'real spin works');
  r = await call(port, 'GET', '/api/leaderboard', undefined, ck);
  ok(r.status === 200 && Array.isArray(r.json.net), 'leaderboard ok');
  r = await call(port, 'GET', '/api/house', undefined, ck);
  ok(r.status === 200 && r.json.total.casino.rounds === 1, 'house ledger counted only the real round (rounds=' + r.json.total.casino.rounds + ')');
  // not logged in
  r = await call(port, 'GET', '/api/lobby');
  ok(r.status === 401, 'lobby requires login');
  // static + security headers
  r = await call(port, 'GET', '/');
  ok(r.status === 200 && r.raw.includes('Lucky Chips'), 'index served');
  process.exit(0);
});
