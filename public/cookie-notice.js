/*! Hackatoa cookie notice — tiny, dependency-free. One file, reusable on every site.
 *  <script src="/cookie-notice.js" data-mode="essential|ads" data-policy="/cookies" data-privacy="/privacy" defer></script>
 *  mode "essential": informs that only essential cookies/storage are used (one OK button).
 *  mode "ads": asks Accept / Essential only. Honours Global Privacy Control. Emits `cookie-consent` ({detail:{ads:boolean}}) and sets
 *  window.cookieConsent = { ads }. Sites with ads must wait for the event (or read window.cookieConsent) before loading ad scripts, and
 *  call (adsbygoogle.requestNonPersonalizedAds = 1) when ads === false. Add data-cookie-settings to any link to reopen the notice. */
(() => {
  const me = document.currentScript || document.querySelector('script[src*="cookie-notice"]');
  const extra = (me && me.dataset.extra) || '', lead = (me && me.dataset.lead) || 'This site only uses <b>essential</b> cookies and local storage (to keep you signed in and remember your settings). No ads, no analytics, no tracking.';
  const mode = (me && me.dataset.mode) || 'essential', policy = (me && me.dataset.policy) || '/cookies', privacy = (me && me.dataset.privacy) || '/privacy';
  const KEY = 'cookie-consent-v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  const gpc = !!navigator.globalPrivacyControl;                       // "Do Not Sell/Share" signal: treated as a rejection of personalised ads
  const publish = ads => { window.cookieConsent = { ads }; document.dispatchEvent(new CustomEvent('cookie-consent', { detail: { ads } })); };
  const saved = read();
  if (saved) publish(!!saved.ads && !gpc); else if (mode !== 'ads') publish(false);
  if (mode === 'ads' && !saved && gpc) { write({ ads: false, gpc: true, ts: Date.now() }); publish(false); return; }
  const open = () => {
    if (document.getElementById('ck-notice')) return;
    const css = document.createElement('style');
    css.textContent = '#ck-notice{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:640px;margin:0 auto;background:#0f1d18;color:#e6f2ec;border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:12px 14px;font:14px/1.5 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45)}#ck-notice a{color:#f3c253}#ck-notice .b{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}#ck-notice button{font:inherit;font-weight:600;padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:transparent;color:inherit;cursor:pointer}#ck-notice button.p{background:#f3c253;color:#2b1d00;border-color:#f3c253}@media (prefers-color-scheme:light){#ck-notice{background:#fff;color:#1a1a1a;border-color:#ccc}#ck-notice a{color:#7a5a00}}';
    const box = document.createElement('div'); box.id = 'ck-notice'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Cookie notice');
    const done = ads => { write({ ads, ts: Date.now() }); publish(ads && !gpc); box.remove(); css.remove(); };
    box.innerHTML = mode === 'ads'
      ? `We use essential cookies to run this site, and Google AdSense cookies to show ads. You can allow personalised ads or keep only essential cookies (ads then stay non-personalised). ${gpc ? '<br><b>Your browser sends a Global Privacy Control signal, so personalised ads stay off.</b>' : ''} <a href="${policy}">Cookie policy</a> · <a href="${privacy}">Privacy</a><div class="b"><button class="p" data-a="1">Accept all</button><button data-a="0">Essential only</button></div>`
      : `${lead}${extra ? ' ' + extra : ''} <a href="${policy}">Cookie policy</a> · <a href="${privacy}">Privacy</a><div class="b"><button class="p" data-a="0">OK</button></div>`;
    box.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (b) done(b.dataset.a === '1'); });
    document.head.append(css); document.body.append(box);
  };
  const ready = fn => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());
  ready(() => { if (!saved) open(); document.addEventListener('click', e => { if (e.target.closest('[data-cookie-settings]')) { e.preventDefault(); open(); } }); });
})();
