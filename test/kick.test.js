// Kick chat bot over real HTTP with Kick's API faked: signed webhooks only, !game picks + cooldown, alerts reach the stream feed.
process.env.PORT = '0';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), http = require('node:http');
const __d = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-k-'));
process.env.CASINO_DATA = __d; process.env.CASINO_DB = __d + '/t.db';
Object.assign(process.env, { KICK_CLIENT_ID: 'id', KICK_CLIENT_SECRET: 'secret', KICK_CHANNEL: 'luckychips', KICK_LINK_MIN: '0', KICK_RELAY_KEY: 'relay-secret', STREAM_GAMES: 'blackjack,roulette,craps' });
fs.writeFileSync(__d + '/kick.json', JSON.stringify({ access: 'a', refresh: 'r', expiresAt: Date.now() + 3600e3, userId: 7, name: 'LuckyChips' }));

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sent = [];
const realFetch = global.fetch;
global.fetch = async (url, o = {}) => {
  url = String(url);
  if (url.endsWith('/public/v1/public-key')) return new Response(JSON.stringify({ data: { public_key: publicKey.export({ type: 'spki', format: 'pem' }) } }));
  if (url.endsWith('/public/v1/chat')) { const b = JSON.parse(o.body); if (b.type === 'bot') return new Response('{"message":"Not found"}', { status: 404 }); sent.push(b); return new Response(JSON.stringify({ data: { is_sent: true } })); }     // like Kick for an app with no bot identity
  if (url.endsWith('/public/v1/events/subscriptions')) return new Response(JSON.stringify({ data: [] }));
  return realFetch(url, o);
};
const { server } = require('../server');
const ctl = require('../lib/streamctl');
const alerts = []; const _emit = ctl.emit; ctl.emit = (ev, d) => { alerts.push([ev, d]); _emit(ev, d); };

function hook(port, type, body, { sign = true, ts = new Date().toISOString() } = {}) {
  const raw = JSON.stringify(body), id = crypto.randomUUID();
  const sig = crypto.sign('sha256', Buffer.from(`${id}.${ts}.${raw}`), sign ? privateKey : crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey).toString('base64');
  return new Promise((resolve, reject) => {
    const req = http.request({ port, method: 'POST', path: '/api/kick/webhook', headers: { 'Content-Type': 'application/json', 'Kick-Event-Type': type, 'Kick-Event-Version': '1', 'Kick-Event-Message-Id': id, 'Kick-Event-Message-Timestamp': ts, 'Kick-Event-Signature': sig } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end(raw);
  });
}
const get = (port, p) => new Promise(r => http.get({ port, path: p }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r(JSON.parse(b))); }));
const chat = (who, content, badges = []) => ({ broadcaster: { user_id: 7 }, sender: { user_id: 99, username: who, identity: { badges } }, content });
const wait = ms => new Promise(r => setTimeout(r, ms));

server.listen(0, async () => {
  const port = server.address().port;
  const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
  ok(await hook(port, 'chat.message.sent', chat('eve', '!game craps'), { sign: false }) === 401, 'webhook with a bad signature is rejected');
  ok(await hook(port, 'chat.message.sent', chat('eve', '!game craps'), { ts: new Date(Date.now() - 3600e3).toISOString() }) === 401, 'stale webhook is rejected');
  const before = (await get(port, '/api/stream/now')).game;
  ok(await hook(port, 'chat.message.sent', chat('crabfan', '!game crabs')) === 200, 'signed webhook accepted');
  await wait(50);
  ok((await get(port, '/api/stream/now')).game === before, 'unknown game does not switch');
  const target = before === 'roulette' ? 'craps' : 'roulette', tname = target === 'craps' ? 'Craps' : 'Roulette';
  await hook(port, 'chat.message.sent', chat('crabfan', '!game ' + target)); await wait(50);
  const now = await get(port, '/api/stream/now');
  ok(now.game === target && now.picked, `!game ${target} puts it on air`);
  ok(alerts.some(([e, d]) => e === 'alert' && d.kind === 'switch' && d.user === 'crabfan'), 'switch alert reaches the stream');
  await hook(port, 'chat.message.sent', chat('other', '!game bj')); await wait(50);
  ok((await get(port, '/api/stream/now')).game === target, 'cooldown blocks a second switch');
  await hook(port, 'chat.message.sent', chat('amod', '!game bj', [{ type: 'moderator' }])); await wait(50);
  ok((await get(port, '/api/stream/now')).game === 'blackjack', 'mods skip the cooldown (alias bj)');
  await hook(port, 'channel.followed', { broadcaster: { user_id: 7 }, follower: { username: 'newfan' } }); await wait(50);
  ok(alerts.some(([e, d]) => e === 'alert' && d.kind === 'follow' && d.user === 'newfan'), 'follow alert reaches the stream');
  await hook(port, 'channel.subscription.gifts', { broadcaster: { user_id: 7 }, gifter: { username: 'santa' }, giftees: [{}, {}, {}] }); await wait(50);
  ok(alerts.some(([e, d]) => d.kind === 'gift' && /3 subs/.test(d.text)), 'gift alert counts the subs');
  await hook(port, 'channel.followed', { broadcaster: { user_id: 12345 }, follower: { username: 'elsewhere' } }); await wait(50);
  ok(!alerts.some(([, d]) => d.user === 'elsewhere'), 'events for other channels are ignored');
  const relay = (key, messages) => new Promise((resolve, reject) => { const req = http.request({ port, method: 'POST', path: '/api/kick/relay', headers: { 'Content-Type': 'application/json', 'X-Relay-Key': key } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); req.on('error', reject); req.end(JSON.stringify({ messages })); });
  const rm = { id: 'm-1', content: '!game roulette', sender: { username: 'relayed', user_id: 5, identity: { badges: [{ type: 'broadcaster' }] } } };
  ok(await relay('wrong-secret', [rm]) === 401, 'relay with the wrong key is rejected');
  ok(await relay('relay-secret', [rm]) === 204, 'relay accepted'); await wait(50);
  ok((await get(port, '/api/stream/now')).game === 'roulette', 'relayed !game switches the table');
  const n = alerts.length; await relay('relay-secret', [rm]); await wait(50);
  ok(alerts.length === n, 'a relayed message is handled once');
  await hook(port, 'chat.message.sent', chat('x', '!play'));
  for (let i = 0; i < 80 && !sent.some(({ content: m }) => /casino\.hackatoa\.com/.test(m)); i++) await wait(250);     // chat goes out 1.5 s apart
  ok(sent.some(({ content: m }) => /casino\.hackatoa\.com/.test(m)), '!play posts the link');
  ok(sent.some(({ content: m }) => new RegExp('switched the table to .*' + tname).test(m)), 'switch announced in chat');
  ok(sent.some(({ content: m }) => /try again in \d+ min/.test(m)), 'cooldown explained in chat');
  ok(sent.every(b => b.type === 'user' && b.broadcaster_user_id === 7), 'falls back to posting as the channel when bot messages 404');
  server.close(); process.exit(0);
});
