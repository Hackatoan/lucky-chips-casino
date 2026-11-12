'use strict';
// Kick chat → casino relay. Kick often doesn't deliver its chat.message.sent webhook (KickDevDocs discussion #147), so this polls the
// channel's public chat history and forwards new !commands to the casino's /api/kick/relay. Read-only, no Kick login. Runs here on the
// streaming box because Kick answers 403 to datacenter IPs (the casino server's). Alerts (follows, subs…) still arrive as webhooks.
//   env: KICK_CHANNEL_ID (numeric channel id), KICK_RELAY_KEY (same value as on the casino server), RELAY_URL, POLL_MS (3000)
const CH = process.env.KICK_CHANNEL_ID, KEY = process.env.KICK_RELAY_KEY;
const TARGET = process.env.RELAY_URL || 'https://casino.hackatoa.com/api/kick/relay';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
if (!CH || !KEY) { console.error('[relay] set KICK_CHANNEL_ID and KICK_RELAY_KEY'); process.exit(1); }
const seen = new Set();
let primed = false, fails = 0;

async function tick() {
  try {
    const r = await fetch(`https://web.kick.com/api/v1/chat/${CH}/history`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error('history ' + r.status);
    const msgs = (((await r.json()).data || {}).messages || []).filter(m => m && m.id && !seen.has(m.id));
    for (const m of msgs) seen.add(m.id);
    if (seen.size > 2000) for (const id of [...seen].slice(0, 1000)) seen.delete(id);
    if (!primed) { primed = true; console.log('[relay] watching chat for channel ' + CH); return; }      // don't replay the backlog on start
    const cmds = msgs.filter(m => /^!\w/.test(String(m.content || '').trim()))
      .map(m => ({ id: m.id, content: m.content, sender: { username: m.sender && m.sender.username, user_id: m.sender && m.sender.id, identity: m.sender && m.sender.identity } }));
    if (cmds.length) {
      const p = await fetch(TARGET, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Relay-Key': KEY }, body: JSON.stringify({ messages: cmds }) });
      if (!p.ok) throw new Error('relay ' + p.status);
      console.log(`[relay] forwarded ${cmds.map(c => c.content.split(' ')[0]).join(' ')}`);
    }
    if (fails) console.log('[relay] recovered'); fails = 0;
  } catch (e) { if (fails++ % 20 === 0) console.warn('[relay]', e.message); }
}
setInterval(tick, Math.max(1500, Number(process.env.POLL_MS || 3000)));
tick();
