// Screenshot harness: node test/shots.js <outDir> <port> item[,item...]   (items: auth, home, g:<id>, t:<id>, lobby, leaders, house, learn)
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const pw = require('/home/hackatoa/free-games-claimer/node_modules/playwright-core');
const [outDir, port, itemsArg] = process.argv.slice(2);
const items = (itemsArg || 'auth,home').split(',');
const BASE = `http://127.0.0.1:${port}`;
fs.mkdirSync(outDir, { recursive: true });

function api(method, p, body, cookie, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: '/api' + p, method, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} resolve({ status: res.statusCode, json: j, cookie: (res.headers['set-cookie'] || [])[0] }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
// put games into a photogenic state before capture
const PREP = {
  blackjack: async c => {
    for (let i = 0; i < 14; i++) {
      const g = await api('GET', '/game/blackjack', undefined, c); const ph = g.json.view.phase;
      if (ph === 'player') return;
      if (ph === 'insurance') { await api('POST', '/game/blackjack/insurance', { take: false }, c); continue; }
      await api('POST', '/game/blackjack/deal', { bet: 20, sides: { pp: 2 } }, c);
    }
  },
  baccarat: async c => { await api('POST', '/game/baccarat/deal', { bets: { banker: 40, player: 10 } }, c); },
  crownanchor: async c => { await api('POST', '/game/crownanchor/roll', { bets: [{ type: 'single', n: 2, amount: 10 }] }, c); },
  chuckaluck: async c => { await api('POST', '/game/chuckaluck/roll', { bets: [{ type: 'single', n: 5, amount: 10 }] }, c); },
  sevenup: async c => { await api('POST', '/game/sevenup/roll', { bets: { over: 10 } }, c); },
  wheel: async c => { await api('POST', '/game/wheel/spin', { bets: { 1: 10 } }, c); },
  slots_classic: async c => { await api('POST', '/game/slots_classic/spin', { unit: 2 }, c); },
  slots_fruit: async c => { await api('POST', '/game/slots_fruit/spin', { unit: 1 }, c); },
  slots_pharaoh: async c => { await api('POST', '/game/slots_pharaoh/spin', { unit: 1 }, c); },
  slots_dragon: async c => { await api('POST', '/game/slots_dragon/spin', { unit: 1 }, c); },
  slots_gems: async c => { await api('POST', '/game/slots_gems/spin', { unit: 2 }, c); },
  slots_bubble: async c => { await api('POST', '/game/slots_bubble/spin', { unit: 2 }, c); },
  slots_jackpot: async c => { await api('POST', '/game/slots_jackpot/spin', { unit: 5 }, c); },
  roulette: async c => { await api('POST', '/game/roulette/spin', { bets: [{ type: 'red', amount: 10 }, { type: 'straight', nums: [17], amount: 5 }] }, c); },
  videopoker: async c => { await api('POST', '/game/videopoker/deal', { bet: 10 }, c); },
  craps: async c => { await api('POST', '/game/craps/place', { bets: [{ type: 'pass', amount: 10 }, { type: 'field', amount: 5 }] }, c); for (let i = 0; i < 4; i++) await api('POST', '/game/craps/roll', {}, c).catch(() => {}); },
  letitride: async c => { await api('POST', '/game/letitride/deal', { bet: 10 }, c); },
  threecard: async c => { await api('POST', '/game/threecard/deal', { ante: 10, sides: { pairplus: 5 } }, c); },
  reddog: async c => { for (let i = 0; i < 6; i++) { const r = await api('POST', '/game/reddog/deal', { bet: 10 }, c); if ((r.json.view || {}).phase === 'raise') return; } },
  hilo: async c => { await api('POST', '/game/hilo/start', { bet: 10 }, c); },
  mines: async c => { await api('POST', '/game/mines/start', { bet: 10, mines: 5 }, c); await api('POST', '/game/mines/pick', { index: 12 }, c); },
  war: async c => { await api('POST', '/game/war/deal', { bet: 10 }, c); },
  keno: async c => { await api('POST', '/game/keno/play', { bet: 5, picks: [3, 14, 22, 37, 41, 58, 63, 77] }, c); },
  plinko: async c => { await api('POST', '/game/plinko/drop', { bet: 10, rows: 12, risk: 'high', balls: 1 }, c); },
  sicbo: async c => { await api('POST', '/game/sicbo/roll', { bets: [{ type: 'small', amount: 10 }, { type: 'single', n: 4, amount: 5 }] }, c); },
  dice: async c => { await api('POST', '/game/dice/roll', { bet: 10, dir: 'under', target: 50 }, c); },
};
(async () => {
  const ck = path.join(outDir, '.cookie');
  let cookie = fs.existsSync(ck) ? fs.readFileSync(ck, 'utf8') : '';
  if (cookie) { const me = await api('GET', '/me', undefined, cookie); if (!me.json || !me.json.user) cookie = ''; }
  if (!cookie) {
    const reg = await api('POST', '/register', { username: 'shot' + Math.floor(Math.random() * 1e6), password: 'secret123', display: 'High Roller' });
    if (!reg.cookie) throw new Error('register failed: ' + JSON.stringify(reg.json));
    cookie = reg.cookie.split(';')[0]; fs.writeFileSync(ck, cookie);
  }
  const browser = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--no-sandbox'] });
  const written = [];
  for (const item of items) {
    const [kind, id] = item.split(':');
    if (kind === 'g' && PREP[id]) { try { await PREP[id](cookie); } catch (e) { console.log('  prep skipped for', id, e.message); } }
    for (const [dev, opts] of Object.entries(DEVICES)) {
      if (process.env.DEVICES && !process.env.DEVICES.split(',').includes(dev)) continue;
      const ctx = await browser.newContext({ ...opts, colorScheme: 'dark', reducedMotion: 'no-preference' });
      if (kind !== 'auth') await ctx.addCookies([{ name: 'sid', value: cookie.split('=')[1], url: BASE }]);
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      const hash = kind === 'auth' ? '' : kind === 'home' ? '#/' : kind === 'g' ? `#/g/${id}` : kind === 't' ? `#/t/${id}` : `#/${kind}${id ? '/' + id : ''}`;
      await page.goto(BASE + '/' + hash, { waitUntil: 'networkidle' });
      await page.waitForTimeout(kind === 'g' ? 900 : 500);
      const file = path.join(outDir, `${item.replace(':', '-')}-${dev}.png`);
      await page.screenshot({ path: file, fullPage: process.env.FULL === '1' || (kind !== 'g' && dev === 'desktop') });
      written.push(file);
      if (errors.length) console.log(`  [${item} ${dev}] console errors:`, [...new Set(errors)].slice(0, 4));
      await ctx.close();
    }
  }
  await browser.close();
  console.log(written.join('\n'));
})().catch(e => { console.error('SHOT ERROR', e); process.exit(1); });
