// Firebase Auth (Google + email/password), loaded lazily from Google's CDN only when someone signs in.
const V = '10.14.1';
let A = null, auth = null;

export async function ready(cfg) {
  if (auth) return true;
  const [app, a] = await Promise.all([import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`), import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`)]);
  A = a; auth = a.getAuth(app.initializeApp(cfg));
  return true;
}
export const friendly = e => {
  const c = (e && e.code) || '';
  const m = {
    'auth/invalid-credential': 'Wrong email or password.', 'auth/wrong-password': 'Wrong email or password.', 'auth/user-not-found': 'No account with that email — create one instead?',
    'auth/email-already-in-use': 'That email already has an account — sign in instead (or use Google if that is how you signed up).', 'auth/weak-password': 'Choose a password of at least 6 characters.',
    'auth/invalid-email': 'That doesn\'t look like a valid email address.', 'auth/too-many-requests': 'Too many attempts — wait a few minutes or reset your password.',
    'auth/network-request-failed': 'Network problem — check your connection.', 'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.', 'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in pop-up — allow pop-ups for this site and try again.', 'auth/unauthorized-domain': 'Sign-in isn\'t enabled for this web address yet.', 'auth/operation-not-allowed': 'That sign-in method isn\'t enabled.',
    'auth/user-disabled': 'This account has been disabled.',
  };
  return m[c] || (e && e.message) || 'Sign-in failed.';
};
export async function google() {
  const p = new A.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
  const cred = await A.signInWithPopup(auth, p);
  return cred.user.getIdToken();
}
export async function emailSignIn(email, pw) { const c = await A.signInWithEmailAndPassword(auth, email, pw); return c.user.getIdToken(); }
export async function emailSignUp(email, pw) {
  const c = await A.createUserWithEmailAndPassword(auth, email, pw);
  try { await A.sendEmailVerification(c.user); } catch { /* resend is available from the banner */ }
  return c.user.getIdToken();
}
export const resendVerification = async () => { if (!auth || !auth.currentUser) throw new Error('Sign in again to resend the email.'); await A.sendEmailVerification(auth.currentUser); };
export async function freshToken() { if (!auth || !auth.currentUser) throw new Error('Please sign in again to refresh your verification.'); await auth.currentUser.reload(); return auth.currentUser.getIdToken(true); }
export const resetPassword = email => A.sendPasswordResetEmail(auth, email);
export const signOutFb = async () => { if (auth) { try { await A.signOut(auth); } catch {} } };
export const loaded = () => !!auth;
