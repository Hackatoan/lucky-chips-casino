'use strict';
// House-edge configuration. Two independent knobs:
//  1. Hand fee  – a % of every wager, or a flat chip fee per hand (like a poker-room rake).
//  2. Rule sets – per-game options (paytables, commissions, deck counts…) declared in each game's meta.options.
// Operators can set a default (and lock it) via env; otherwise each player chooses their own table.
const DEFAULT_FEE = {
  mode: process.env.HOUSE_FEE_MODE === 'flat' ? 'flat' : 'pct',
  value: Math.max(0, Number(process.env.HOUSE_FEE || 0)) || 0,
};
const LOCK = process.env.HOUSE_FEE_LOCK === '1';
const LIMITS = { pct: { min: 0, max: 10, step: 0.5 }, flat: { min: 0, max: 100, step: 1 } };

function validFee(f) {
  if (!f || (f.mode !== 'pct' && f.mode !== 'flat')) return null;
  const L = LIMITS[f.mode];
  let v = Number(f.value);
  if (!Number.isFinite(v)) return null;
  v = Math.min(L.max, Math.max(L.min, v));
  v = f.mode === 'flat' ? Math.round(v) : Math.round(v / L.step) * L.step;
  return { mode: f.mode, value: v };
}
function effectiveFee(settings) {
  if (LOCK) return DEFAULT_FEE;
  return validFee(settings && settings.fee) || DEFAULT_FEE;
}
// chips owed on a debit of `amount`; flat fee is charged once, on the first debit of a round
function feeFor(fee, amount, firstOfRound) {
  if (!fee || fee.value <= 0 || amount <= 0) return 0;
  if (fee.mode === 'pct') return Math.max(1, Math.ceil((amount * fee.value) / 100 - 1e-9));
  return firstOfRound ? fee.value : 0;
}
// largest bet b such that b + fee(b) <= balance (for UI + error messages)
function maxAffordable(fee, balance) {
  if (!fee || fee.value <= 0) return balance;
  if (fee.mode === 'flat') return Math.max(0, balance - fee.value);
  let b = Math.floor(balance / (1 + fee.value / 100));
  while (b > 0 && b + feeFor(fee, b, true) > balance) b--;
  return b;
}

// ---- per-game rule options ----
function optionsOf(mod) { return (mod && mod.meta && mod.meta.options) || []; }
function validOpt(def, v) {
  if (def.type === 'select') {
    const hit = def.choices.find(c => String(c.v) === String(v));
    return hit ? hit.v : undefined;
  }
  if (def.type === 'range') {
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    const c = Math.min(def.max, Math.max(def.min, n));
    return Math.round(c / def.step) * def.step;
  }
  return undefined;
}
function resolveRules(mod, settings) {
  const saved = (settings && settings.rules && settings.rules[mod.id]) || {};
  const out = {};
  for (const def of optionsOf(mod)) {
    const v = validOpt(def, saved[def.key]);
    out[def.key] = v === undefined ? def.default : v;
  }
  return out;
}

module.exports = { DEFAULT_FEE, LOCK, LIMITS, validFee, effectiveFee, feeFor, maxAffordable, validOpt, resolveRules, optionsOf };
