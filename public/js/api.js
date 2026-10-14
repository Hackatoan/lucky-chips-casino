// Fetch wrapper + tiny global store/event bus.
export const state = { user: null, games: [], byId: {}, tz: '', demo: (() => { try { return sessionStorage.getItem('lc.demo') === '1'; } catch { return false; } })(), repo: '' };
const listeners = {};
export const on = (ev, fn) => { (listeners[ev] ||= new Set()).add(fn); return () => listeners[ev].delete(fn); };
export const emit = (ev, data) => { for (const fn of listeners[ev] || []) { try { fn(data); } catch (e) { console.error(e); } } };

export class ApiError extends Error { constructor(m, status, data) { super(m); this.status = status; this.data = data; } }

export async function api(path, body, method) {
  const opts = { method: method || (body === undefined ? 'GET' : 'POST'), headers: {}, credentials: 'same-origin' };
  if (state.demo && /^\/game\//.test(path)) opts.headers['X-Demo'] = '1';        // practice wallet for solo games
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, opts); }
  catch { throw new ApiError('Network problem — check your connection.', 0); }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401 && state.user) { state.user = null; emit('logout'); }
    throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

export function setUser(u) {
  state.user = u;
  emit('user', u);
}
export function setDemo(on) { state.demo = !!on; try { sessionStorage.setItem('lc.demo', on ? '1' : '0'); } catch {} emit('demo', state.demo); }
export function shownBalance() { return state.user ? (state.demo ? state.user.demoBalance : state.user.balance) : 0; }
export function setBalance(b) {
  if (state.user && typeof b === 'number') { if (state.demo) state.user.demoBalance = b; else state.user.balance = b; emit('balance', b); }
}
export async function refreshUser() {
  const r = await api('/me');
  setUser(r.user);
  return r.user;
}
export async function loadCatalog() {
  const r = await api('/games');
  state.games = r.games; state.tz = r.tz; state.repo = r.repo || '';
  state.byId = Object.fromEntries(r.games.map(g => [g.id, g]));
}

// largest bet that still leaves room for the hand fee
export function maxAffordable(balance, fee) {
  if (!fee || !fee.value) return balance;
  if (fee.mode === 'flat') return Math.max(0, balance - fee.value);
  let b = Math.floor(balance / (1 + fee.value / 100));
  const f = n => Math.max(1, Math.ceil(n * fee.value / 100 - 1e-9));
  while (b > 0 && b + f(b) > balance) b--;
  return b;
}
