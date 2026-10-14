// Slot machine client — one renderer for all seven machine types (classic, lines, ways, cascading clusters, bubbles, jackpot).
import { h, clear, fmt, btn, betPicker, modal, sleep, badge } from '../ui.js';
import { api } from '../api.js';
import { sfx } from '../sfx.js';
import { animOn } from '../fx.js';

export default {
  init(ctx) {
    const s = ctx._sl = { busy: false, auto: 0, grid: null };
    s.bet = betPicker('slot.' + ctx.id, { min: 1, max: 200, def: 2, label: 'Bet per unit' });
    s.title = h('div', { class: 'zone-title' });
    s.jp = h('div', { class: 'jackpot', hidden: true });
    s.banner = h('div', { class: 'sl-banner' });
    s.reels = h('div', { class: 'sl-reels' });
    s.win = h('div', { class: 'banner-result' });
    s.lines = h('div', { class: 'sl-lines' });
    s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(s.title, s.jp, s.banner, s.reels, s.win, s.lines, s.controls);
    if (ctx.game.id === 'slots_jackpot' && !ctx.readonly) { s.tick = setInterval(() => ctx.refresh && ctx.refresh().catch(() => {}), 9000); }
  },
  destroy(ctx) { if (ctx._sl && ctx._sl.tick) clearInterval(ctx._sl.tick); if (ctx._sl) ctx._sl.auto = 0; },
  render(v, ctx) {
    const s = ctx._sl, cfg = v.cfg; s.v = v; s.cfg = cfg; s.sym = Object.fromEntries(cfg.symbols.map(x => [x.id, x]));
    s.title.textContent = `${ctx.game.name} · ${(v.rtp * 100).toFixed(1)}% return`;
    s.reels.className = `sl-reels theme-${cfg.theme} mode-${cfg.mode}`; s.reels.style.setProperty('--cols', cfg.reels); s.reels.style.setProperty('--rows', cfg.rows);
    if (v.jackpot !== null) { s.jp.hidden = false; s.jp.replaceChildren(h('span', null, '💰 PROGRESSIVE JACKPOT'), h('b', null, fmt(v.jackpot)), v.jackpotLast ? h('small', { class: 'muted' }, ` last win ${fmt(v.jackpotLast.amount)}`) : null); }
    if (!s.grid) { const last = v.last && v.last.rounds.length ? lastGrid(v.last) : null; s.grid = last || idleGrid(cfg, s); drawGrid(s, s.grid); }
    // watching someone else (bot arena, gallery, multi-view tile): replay each new spin with the full reel animation
    if (ctx.readonly && v.last && v.last.rounds && v.last.rounds.length) {
      const key = JSON.stringify(v.last.rounds) + ':' + v.last.win;
      if (s.specKey === undefined) s.specKey = key;                      // first sight: just show the grid
      else if (key !== s.specKey) { s.specKey = key; s.specQueue = v.last; if (!s.playing) { s.playing = true; (async () => { while (s.specQueue) { const l = s.specQueue; s.specQueue = null; s.win.textContent = ''; s.lines.textContent = ''; try { await play(ctx, l); } catch (e) { console.error(e); } } s.playing = false; })(); } }
    }
    clear(s.controls);
    if (!ctx.readonly) {
      const total = s.bet.get() * cfg.units;
      s.controls.append(s.bet.el, h('div', { class: 'actions', style: { width: '100%' } },
        h('span', { class: 'badge gold' }, `🪙 Total bet ${fmt(total)}` + (cfg.units > 1 ? ` (${cfg.units} ${cfg.mode === 'ways' ? 'ways units' : 'lines'} × ${fmt(s.bet.get())})` : '')),
        btn('Paytable', 'ghost', () => paytable(ctx)), btn('Auto ×10', '', () => { s.auto = 10; spin(ctx); }, { disabled: s.busy }),
        btn(s.busy ? 'Spinning…' : 'SPIN', 'gold big', () => { s.auto = 0; spin(ctx); }, { disabled: s.busy || ctx.sitting })));
      s.bet.onChange(() => ctx.mod.render(s.v, ctx));
    }
    ctx.setCoach(h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, `Long-run return ${(v.rtp * 100).toFixed(1)}% — no strategy exists`), h('p', { class: 'small', style: { margin: '4px 0 0' } }, 'The reels are random and independent. "Hot", "cold" and "due" machines are myths; near-misses are just how reels look. Your only control is bet size: smaller bets stretch your bankroll for the same entertainment.')),
      h('div', { class: 'coach-opt' }, h('b', null, 'About the paytable'), cfg.mode === 'cluster' ? 'Matching symbols anywhere on the grid pay when enough connect; winners vanish and new symbols fall in for chain reactions.' : cfg.mode === 'ways' ? 'No paylines: a symbol pays when it appears on adjacent reels from the left. Several copies on one reel multiply the ways.' : 'Wins pay left to right on active paylines; wild symbols substitute for everything except bonus symbols.'),
      cfg.jackpot ? h('div', { class: 'coach-opt' }, h('b', null, 'Progressive jackpot'), 'The pool grows with every spin from every player. It costs ~3% of each bet, which is why this machine\'s base return is lower.') : null));
  },
};
const emoji = (s, id) => (id === '_' ? '▬' : s.sym[id] ? s.sym[id].emoji : id);
function idleGrid(cfg, s) { const ids = cfg.symbols.filter(x => x.id !== cfg.scatter && x.id !== cfg.wild).map(x => x.id); return Array.from({ length: cfg.reels }, () => Array.from({ length: cfg.rows }, () => ids[Math.floor(Math.random() * ids.length)])); }
function lastGrid(last) { const r = last.rounds[last.rounds.length - 1]; return (r.cascade ? r.cascade[r.cascade.length - 1].grid : r.grid); }
function cell(s, id, extra = '') { return h('div', { class: `sl-cell sym-${id} ${extra}` + (s.cfg.wild === id ? ' wild' : '') + (s.cfg.scatter === id ? ' scat' : '') }, h('span', null, emoji(s, id))); }
function drawGrid(s, grid, marks) {
  s.grid = grid;
  s.reels.replaceChildren(...grid.map((col, c) => h('div', { class: 'sl-col', dataset: { c } }, col.map((id, r) => { const m = marks && marks.has(c + ',' + r); return cell(s, id, m ? 'win' : ''); }))));
}
function randSym(s) { const ids = s.cfg.symbols.map(x => x.id); return ids[Math.floor(Math.random() * ids.length)]; }

async function spinTo(s, grid) {
  if (!animOn()) { drawGrid(s, grid); return; }
  const cols = [...s.reels.children], timers = [];
  const spinning = new Set(cols.map((_, i) => i));
  const iv = setInterval(() => { for (const c of spinning) { const colEl = cols[c]; colEl.replaceChildren(...Array.from({ length: s.cfg.rows }, () => cell(s, randSym(s), 'blur'))); } }, 70);
  sfx.play('reel');
  for (let c = 0; c < cols.length; c++) {
    await sleep(380 + c * 230);
    spinning.delete(c);
    cols[c].replaceChildren(...grid[c].map(id => cell(s, id, 'land')));
    sfx.play('stop');
  }
  clearInterval(iv); s.grid = grid;
}
function winMarks(s, round) {
  const cfg = s.cfg, marks = new Set(), grid = round.grid;
  if (cfg.mode === 'classic') { if (round.wins.length) for (let c = 0; c < cfg.reels; c++) marks.add(c + ',' + Math.floor(cfg.rows / 2)); return marks; }
  if (cfg.mode === 'lines') { for (const w of round.wins) { const pat = cfg.linePatterns[w.line]; for (let c = 0; c < w.run; c++) marks.add(c + ',' + pat[c]); } return marks; }
  if (cfg.mode === 'ways') { for (const w of round.wins) for (let c = 0; c < w.run; c++) grid[c].forEach((id, r) => { if (id === w.sym || id === cfg.wild) marks.add(c + ',' + r); }); return marks; }
  return marks;
}
function winText(s, round) {
  if (s.cfg.mode === 'classic') return round.wins.length ? `${round.wins[0].run}× ${s.sym[round.wins[0].sym].name}` : '';
  return round.wins.map(w => (s.cfg.mode === 'lines' ? `Line ${w.line + 1}: ` : '') + `${w.run}× ${s.sym[w.sym] ? s.sym[w.sym].name : w.sym}${w.ways ? ` (${w.ways} ways)` : ''}`).join(' · ');
}

async function play(ctx, last) {
  const s = ctx._sl, cfg = s.cfg;
  for (let ri = 0; ri < last.rounds.length; ri++) {
    const round = last.rounds[ri];
    s.banner.textContent = round.free ? `🎁 FREE SPIN ${ri} of ${last.fs}${cfg.fs && cfg.fs.mult > 1 ? ` · ×${cfg.fs.mult} wins` : ''}` : '';
    s.banner.classList.toggle('on', !!round.free);
    if (cfg.mode === 'cluster') {
      for (let i = 0; i < round.cascade.length; i++) {
        const step = round.cascade[i];
        if (i === 0) await spinTo(s, step.grid); else { drawGrid(s, step.grid); sfx.play('pop'); await sleep(animOn() ? 350 : 0); }
        if (step.wins.length) {
          const marks = new Set(); step.wins.forEach(w => step.grid.forEach((col, c) => col.forEach((id, r) => { if (id === w.sym) marks.add(c + ',' + r); })));
          drawGrid(s, step.grid, marks); sfx.play('gem');
          s.lines.textContent = step.wins.map(w => `${w.count}× ${s.sym[w.sym].name} → ${fmt(w.pay * last.unit)}`).join(' · ') + (step.mult > 1 ? `  (×${step.mult})` : '');
          await sleep(animOn() ? 800 : 0);
        }
      }
    } else {
      await spinTo(s, round.grid);
      if (round.wins.length || round.scatterPay) {
        drawGrid(s, round.grid, winMarks(s, round)); sfx.play('coin'); s.lines.textContent = winText(s, round) + (round.total ? `  → ${fmt(round.total)}` : '');
        await sleep(animOn() ? 900 : 0);
      } else s.lines.textContent = '';
    }
  }
  s.banner.classList.remove('on'); s.banner.textContent = last.fs ? `🎁 Bonus complete` : '';
  s.win.textContent = last.jackpot ? `🏆 JACKPOT ${fmt(last.jackpot)}!` : last.win ? `Win ${fmt(last.win)}` : '';
  s.win.className = 'banner-result ' + (last.win > last.bet ? 'win' : '');
}

async function spin(ctx) {
  const s = ctx._sl; if (s.busy) return; s.busy = true; ctx.mod.render(s.v, ctx);
  s.win.textContent = ''; s.lines.textContent = '';
  const r = await ctx.call('spin', { unit: s.bet.get() });
  if (!r) { s.busy = false; s.auto = 0; ctx.mod.render(s.v, ctx); return; }
  await play(ctx, r.view.last);
  s.busy = false; ctx.mod.render(r.view, ctx);
  if (s.auto > 0) { s.auto--; if (r.view.last.win < r.view.last.bet * 20) setTimeout(() => spin(ctx), 450); else s.auto = 0; }
}
function paytable(ctx) {
  const s = ctx._sl, cfg = s.cfg;
  const rows = Object.entries(cfg.pays).map(([id, t]) => h('tr', null, h('td', null, h('span', { class: 'sl-mini' }, emoji(s, id)), ' ', s.sym[id] ? s.sym[id].name : id), Object.entries(t).map(([n, m]) => h('td', { class: 'num' }, `${n}${cfg.mode === 'cluster' ? '+' : '×'} → ${m}×`))));
  modal(ctx.game.name + ' — paytable', h('div', null,
    h('p', { class: 'muted small' }, 'Pays are multiples of your bet per ' + (cfg.mode === 'cluster' || cfg.mode === 'classic' ? 'spin' : cfg.mode === 'ways' ? 'unit' : 'line') + '.'),
    h('table', { class: 't' }, h('tbody', null, rows)),
    cfg.wild ? h('p', null, h('span', { class: 'sl-mini' }, emoji(s, cfg.wild)), ' Wild substitutes for every symbol except the bonus.') : null,
    cfg.scatter ? h('p', null, h('span', { class: 'sl-mini' }, emoji(s, cfg.scatter)), cfg.fs ? ` ${cfg.fs.trigger}+ anywhere trigger ${cfg.fs.spins} free spins${cfg.fs.mult > 1 ? ` with ×${cfg.fs.mult} wins` : ''}.` : ' Scatter.') : null,
    ctx.game.meta.rules.map(t => h('p', { class: 'small' }, t))));
}
