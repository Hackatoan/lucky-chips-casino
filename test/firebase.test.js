// Firebase sign-in: real verification code, throwaway signing key, stubbed cert source.
process.env.PORT = '0';
const __d = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'casino-t-'));
process.env.CASINO_DATA = __d; process.env.CASINO_DB = __d + '/t.db';

process.env.FIREBASE_WEB_CONFIG = JSON.stringify({ apiKey: 'test', authDomain: 'lucky-chips-casino.firebaseapp.com', projectId: 'lucky-chips-casino', appId: 'x' });
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', tmp + '/k.pem', '-out', tmp + '/c.pem', '-subj', '/CN=test', '-days', '2'], { stdio: 'ignore' });
const key = fs.readFileSync(tmp + '/k.pem', 'utf8'), cert = fs.readFileSync(tmp + '/c.pem', 'utf8');
const fb = require('../lib/fbauth');
fb._setCertFetcher(async () => ({ certs: { kid1: cert }, ttl: 60000 }));
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function token(over = {}, signKey = key) {
  const now = Math.floor(Date.now() / 1000);
  const p = { iss: 'https://securetoken.google.com/lucky-chips-casino', aud: 'lucky-chips-casino', sub: 'uid-' + Math.random().toString(36).slice(2), iat: now - 5, exp: now + 3000, auth_time: now - 5, email: 'a@example.com', email_verified: true, name: 'Ann Example', firebase: { sign_in_provider: 'google.com' }, ...over };
  const head = b64({ alg: 'RS256', kid: 'kid1', typ: 'JWT' }), body = b64(p);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), signKey).toString('base64url');
  return head + '.' + body + '.' + sig;
}
const { server } = require('../server');
function call(port, method, p, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ port, method, path: p, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(cookie ? { Cookie: cookie } : {}) } }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} resolve({ status: res.statusCode, json: j, cookie: (res.headers['set-cookie'] || [])[0] }); }); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
server.listen(0, async () => {
  const port = server.address().port; let bad = 0;
  const ok = (c, m) => { if (!c) bad++; console.log(c ? 'PASS' : 'FAIL', m); };
  let r = await call(port, 'GET', '/api/config'); ok(r.json.firebase && r.json.firebase.projectId === 'lucky-chips-casino', 'public config exposes the Firebase web config');
  // Google (verified) – first call asks for a public name, second creates with 1,000 chips
  const gTok = token({ sub: 'google-1' });
  r = await call(port, 'POST', '/api/auth/firebase', { idToken: gTok }); ok(r.json.needsDisplay && r.json.suggestion, 'new account is asked for a public name (suggested: ' + (r.json.suggestion) + ')');
  r = await call(port, 'POST', '/api/auth/firebase', { idToken: gTok, display: 'sh1thead' }); ok(r.status === 400 && /allowed/.test(r.json.error), 'profane public name rejected');
  r = await call(port, 'POST', '/api/auth/firebase', { idToken: gTok, display: 'Ann Ace' }); ok(r.status === 200 && r.json.user.balance === 1000 && r.json.user.display === 'Ann Ace' && r.cookie, 'verified Google user created with 1,000 chips and a session');
  const ck = r.cookie.split(';')[0];
  r = await call(port, 'POST', '/api/daily', {}, ck); ok(r.status === 400, 'no second daily claim on day one');
  r = await call(port, 'POST', '/api/auth/firebase', { idToken: gTok }); ok(r.status === 200 && r.json.user.balance === 1000 && !r.json.created, 'signing in again does not duplicate the account or chips');
  // email/password – unverified gets no chips until verified
  const eTok = token({ sub: 'email-1', email: 'bob@example.com', email_verified: false, firebase: { sign_in_provider: 'password' } });
  r = await call(port, 'POST', '/api/auth/firebase', { idToken: eTok, display: 'Bobby Bets' }); ok(r.status === 200 && r.json.user.balance === 0 && r.json.user.needsVerify === true, 'unverified email account starts with 0 chips + needsVerify');
  const ck2 = r.cookie.split(';')[0];
  r = await call(port, 'POST', '/api/daily', {}, ck2); ok(r.status === 400 && /Verify/.test(r.json.error), 'unverified account cannot claim daily chips');
  r = await call(port, 'GET', '/api/me', undefined, ck2); ok(r.json.user.canClaim === false, 'canClaim is false while unverified');
  const eTok2 = token({ sub: 'email-1', email: 'bob@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } });
  r = await call(port, 'POST', '/api/auth/firebase', { idToken: eTok2 }); ok(r.json.user.balance === 1000 && r.json.welcome === true && r.json.user.needsVerify === false, 'after verifying the email the 1,000 welcome chips are granted exactly once');
  r = await call(port, 'POST', '/api/auth/firebase', { idToken: eTok2 }); ok(r.json.user.balance === 1000, 'welcome chips are not granted twice');
  // rejection cases
  r = await call(port, 'POST', '/api/auth/firebase', { idToken: token({}, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey), display: 'Eve Evil' }); ok(r.status === 401, 'token signed with the wrong key is rejected');
  r = await call(port, 'POST', '/api/auth/firebase', { idToken: token({ aud: 'some-other-app' }), display: 'Eve Evil' }); ok(r.status === 401, 'token for a different Firebase project is rejected');
  r = await call(port, 'POST', '/api/auth/firebase', { idToken: token({ exp: Math.floor(Date.now() / 1000) - 10 }), display: 'Eve Evil' }); ok(r.status === 401, 'expired token is rejected');
  r = await call(port, 'POST', '/api/auth/firebase', { idToken: 'a.b.c', display: 'Eve Evil' }); ok(r.status === 401, 'garbage token is rejected');
  r = await call(port, 'POST', '/api/auth/firebase', { idToken: token({ sub: 'x-2' }), display: 'Ann Ace' }); ok(r.status === 400 && /in use/.test(r.json.error), 'duplicate public name is refused');
  // firebase accounts cannot be logged into with a guessed username/password
  r = await call(port, 'GET', '/api/me', undefined, ck); const priv = r.json.user.username;
  r = await call(port, 'POST', '/api/login', { username: priv, password: '!' }); ok(r.status === 401, 'Firebase accounts have no local password to guess');
  r = await call(port, 'POST', '/api/register', { username: 'legacy1', password: 'secret1' }); ok(r.status === 200, 'legacy username/password sign-up still works');
  console.log(bad ? `\n${bad} FAILURE(S)` : '\nALL FIREBASE AUTH TESTS PASSED'); process.exit(bad ? 1 : 0);
});
