// Mines client.
import { h, clear, fmt, btn, betPicker, sleep } from '../ui.js';
import { sfx } from '../sfx.js';
export default {
  init(ctx) {
    const s = ctx._mn = {};
    s.bet = betPicker('mines', { min: 1, max: 2000, def: 10 });
    s.mines = h('input', { type: 'range', min: 1, max: 24, value: 5, 'aria-label': 'Mines', style: { padding: 0 } }); s.minesOut = h('b', null, '5'); s.mines.addEventListener('input', () => { s.minesOut.textContent = s.mines.value; });
    s.stat = h('div', { class: 'hud' }); s.grid = h('div', { class: 'mn-grid' }); s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(h('div', { class: 'zone-title' }, 'Mines'), s.stat, s.grid, s.controls);
  },
  render(v, ctx) {
    const s = ctx._mn; clear(s.grid); clear(s.stat); clear(s.controls);
    const active = v.phase === 'play', done = v.phase === 'done';
    for (let i = 0; i < 25; i++) {
      const picked = v.picks && v.picks.includes(i), b = v.board ? v.board[i] : null;
      const cls = 'mn-cell' + (picked || b === 'gem' ? ' gem' : '') + (b === 'mine' ? ' mine' : '') + (b === 'boom' ? ' boom' : '') + (picked ? ' fresh' : '');
      s.grid.append(h('button', { type: 'button', class: cls, disabled: !active || picked || ctx.readonly, onclick: async () => { const r = await ctx.call('pick', { index: i }); if (r) { sfx.play(r.analysis && r.analysis.net < 0 ? 'explode' : 'gem'); } } }, picked || b === 'gem' ? '💎' : b === 'mine' ? '💣' : b === 'boom' ? '💥' : ''));
    }
    if (active) s.stat.append(stat(fmt(v.pot), 'cash-out value'), stat('×' + v.mult.toFixed(2), 'multiplier'), stat(v.next ? '×' + v.next.toFixed(2) : '—', 'next gem'), stat(v.mines, 'mines'));
    if (ctx.readonly) return;
    if (active) {
      s.controls.append(h('div', { class: 'actions' }, v.safe ? btn('Cash out ' + fmt(v.pot), 'gold big', async () => { const r = await ctx.call('cashout', {}); if (r) sfx.play('win', 1); }) : h('span', { class: 'muted' }, 'Reveal a tile to begin')));
      ctx.setCoach(ctx.coachOn() && v.coach ? h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, `Next tile safe: ${(v.coach.p * 100).toFixed(1)}%`), h('p', { class: 'small', style: { margin: '4px 0 0' } }, v.coach.text))) : null);
    } else {
      s.controls.append(s.bet.el, h('label', { class: 'opt-row' }, h('span', null, 'Mines on the grid: '), s.mines, s.minesOut), h('div', { class: 'actions', style: { width: '100%' } }, btn(done ? 'Play again' : 'Start', 'gold big', async () => { const r = await ctx.call('start', { bet: s.bet.get(), mines: Number(s.mines.value) }); if (r) sfx.play('chips'); })));
      ctx.setCoach(h('div', { class: 'coach-content' }, h('p', null, 'Choose how many mines hide on the 5×5 grid. More mines = bigger jumps per gem but a higher chance of busting. Mine positions are fixed at the start and never sent to your browser until the round ends.')));
    }
  },
};
const stat = (b, l) => h('div', { class: 'stat' }, h('b', null, b), h('span', null, l));
