// Retired: the network-first worker caused spurious "You are offline" pages in some browsers.
// This stub (served to browsers that still have the old worker) clears its caches and unregisters itself.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
