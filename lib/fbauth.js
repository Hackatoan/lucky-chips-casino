'use strict';
// Verifies Firebase Auth ID tokens (Google sign-in and email/password) without the Admin SDK:
// RS256 signature against Google's published x509 certs + audience/issuer/expiry checks.
const crypto = require('node:crypto');

const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

// The Firebase *web* config is public by design (it ships in every Firebase web app) but is kept out of git so scanners
// don't flag the API key. Provide it as FIREBASE_WEB_CONFIG (JSON) or config/firebase.web.json (see the .example file).
// With neither present the site simply falls back to username/password accounts.
const WEB_CONFIG = (() => {
  if (process.env.FIREBASE_DISABLED === '1') return null;
  try { if (process.env.FIREBASE_WEB_CONFIG) return JSON.parse(process.env.FIREBASE_WEB_CONFIG); } catch {}
  try { return JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'config', 'firebase.web.json'), 'utf8')); } catch { return null; }
})();

const PROJECT = process.env.FIREBASE_PROJECT_ID || (WEB_CONFIG && WEB_CONFIG.projectId) || 'lucky-chips-casino';

let certs = null, certsExp = 0;
let fetchCerts = async () => {
  const res = await fetch(CERT_URL);
  if (!res.ok) throw new Error('cert fetch failed');
  const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  return { certs: await res.json(), ttl: (m ? Number(m[1]) : 3600) * 1000 };
};
async function getCerts(force) {
  if (!force && certs && Date.now() < certsExp) return certs;
  const r = await fetchCerts();
  certs = r.certs; certsExp = Date.now() + Math.max(60000, r.ttl);
  return certs;
}
const b64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
class AuthError extends Error { constructor(m) { super(m); this.status = 401; } }

async function verifyIdToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || token.length > 4096) throw new AuthError('Malformed sign-in token.');
  let header, p;
  try { header = JSON.parse(b64u(parts[0])); p = JSON.parse(b64u(parts[1])); } catch { throw new AuthError('Malformed sign-in token.'); }
  if (header.alg !== 'RS256' || !header.kid) throw new AuthError('Unsupported token.');
  let pem = (await getCerts())[header.kid];
  if (!pem) pem = (await getCerts(true))[header.kid];            // keys rotate: refetch once
  if (!pem) throw new AuthError('Unknown signing key.');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey(pem), b64u(parts[2]));
  if (!ok) throw new AuthError('Bad token signature.');
  const now = Math.floor(Date.now() / 1000);
  if (p.aud !== PROJECT || p.iss !== 'https://securetoken.google.com/' + PROJECT) throw new AuthError('Token is for a different app.');
  if (!p.sub || typeof p.sub !== 'string' || p.sub.length > 128) throw new AuthError('Bad token subject.');
  if (p.exp <= now) throw new AuthError('Sign-in expired — please try again.');
  if (p.iat > now + 300) throw new AuthError('Token issued in the future.');
  if (p.auth_time && p.auth_time > now + 300) throw new AuthError('Bad auth time.');
  return {
    uid: p.sub, email: (p.email || '').toLowerCase() || null, verified: !!p.email_verified, name: p.name || null,
    picture: p.picture || null, provider: (p.firebase && p.firebase.sign_in_provider) || 'unknown',
  };
}
module.exports = { verifyIdToken, AuthError, WEB_CONFIG, PROJECT, _setCertFetcher: f => { fetchCerts = f; certs = null; certsExp = 0; } };
