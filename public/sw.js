// Network-first service worker: always try the live app, fall back to cache so the shell opens offline.
const CACHE = 'luckychips-v2';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    try {
      let res;
      try { res = await fetch(req); } catch { await new Promise(r => setTimeout(r, 700)); res = await fetch(req); }   // one retry rides out a blip
      if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch {
      const hit = await caches.match(req) || (req.mode === 'navigate' ? await caches.match('/') : null);
      return hit || new Response('<meta name=viewport content="width=device-width"><body style="font:16px system-ui;background:#06241c;color:#e8f3ee;text-align:center;padding:20vh 20px"><h2>Can\'t reach the casino</h2><p>Check your connection — retrying…</p><script>setTimeout(()=>location.reload(),4000)</script>', { status: 503, headers: { 'Content-Type': 'text/html' } });
    }
  })());
});
