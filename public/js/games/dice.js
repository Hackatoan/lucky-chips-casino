// Dice Roll client (roll under / over a target; the house edge is a setting).
import { h, clear, fmt, btn, betPicker, sleep } from '../ui.js';
import { sfx } from '../sfx.js';
import { animOn } from '../fx.js';
export default {
  init(ctx) {
    const s = ctx._dr = { dir: 'under', target: 50 };
    s.bet = betPicker('dice', { min: 1, max: 5000, def: 10 });
    s.out = h('div', { class: 'dice-roll-out' }, '—'); s.bar = h('div', { class: 'dr-bar' }); s.hist = h('div', { class: 'rl-hist' });
    s.slider = h('input', { type: 'range', min: 2, max: 98, step: 1, value: s.target, 'aria-label': 'Target', oninput: e => { s.target = Number(e.target.value); upd(ctx); } });
    s.info = h('div', { class: 'center' }); s.controls = h('div', { class: 'controls' });
    const dirBtn = d => btn(d === 'under' ? 'Roll under' : 'Roll over', 'pill', () => { s.dir = d; upd(ctx); sfx.play('click'); });
    s.dirs = h('div', { class: 'row', style: { justifyContent: 'center' } }, dirBtn('under'), dirBtn('over'));
    ctx.stage.replaceChildren(h('div', { class: 'zone-title' }, 'Dice Roll'), s.out, s.bar, s.slider, s.dirs, s.info, s.hist, s.controls);
  },
  render(v, ctx) {
    const s = ctx._dr; s.v = v;
    if (v.last && !s.seen) { s.seen = true; s.out.textContent = v.last.roll.toFixed(2); }
    if (ctx.readonly && v.last) {                                       // watching someone: show THEIR target and replay each roll
      s.dir = v.last.dir; s.target = v.last.target; s.slider.value = s.target;
      const key = v.last.roll + ':' + v.last.target + ':' + v.last.dir;
      if (s.specKey === undefined) s.specKey = key;
      else if (key !== s.specKey) { s.specKey = key; s.specQ = v.last; if (!s.playing) { s.playing = true; (async () => { while (s.specQ) { const l = s.specQ; s.specQ = null; if (animOn()) for (let i = 0; i < 12; i++) { s.out.textContent = (Math.random() * 100).toFixed(2); await sleep(45); } s.out.textContent = l.roll.toFixed(2); s.out.className = 'dice-roll-out ' + (l.win ? 'win' : 'lose'); } s.playing = false; })(); } }
    }
    clear(s.hist); (v.history || []).slice(-20).forEach(x => s.hist.append(h('span', { class: x.win ? 'green' : 'red' }, x.roll.toFixed(1))));
    upd(ctx);
    clear(s.controls); if (!ctx.readonly) s.controls.append(s.bet.el, h('div', { class: 'actions', style: { width: '100%' } }, btn('Roll', 'gold big', () => roll(ctx))));
    ctx.setCoach(h('div', { class: 'coach-content' }, h('div', { class: 'coach-best' }, h('b', null, `House edge ${v.edge}% on every target`), h('p', { class: 'small', style: { margin: '4px 0 0' } }, 'Payout = (100 − edge) ÷ win chance. A 5% shot pays ~19×, a 95% shot ~1.04× — identical expected loss, very different volatility.'))));
  },
};
function upd(ctx) {
  const s = ctx._dr, v = s.v || { edge: 1 };
  const chance = s.dir === 'under' ? s.target : 100 - s.target, m = Math.floor(((100 - v.edge) / chance) * 10000) / 10000;
  s.dirs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', (i === 0) === (s.dir === 'under')));
  s.bar.style.background = s.dir === 'under' ? `linear-gradient(90deg, #1d8a5c ${s.target}%, #a8322b ${s.target}%)` : `linear-gradient(90deg, #a8322b ${s.target}%, #1d8a5c ${s.target}%)`;
  s.info.replaceChildren(h('b', { class: 'gold' }, `${s.dir === 'under' ? 'Under' : 'Over'} ${s.target}`), ` · win chance ${chance}% · pays ${m.toFixed(2)}× (${fmt(Math.floor(s.bet.get() * m))} on ${fmt(s.bet.get())})`);
}
async function roll(ctx) {
  const s = ctx._dr; sfx.play('dice', 6);
  const r = await ctx.call('roll', { bet: s.bet.get(), dir: s.dir, target: s.target });
  if (!r) return;
  const final = r.view.last.roll;
  if (animOn()) for (let i = 0; i < 12; i++) { s.out.textContent = (Math.random() * 100).toFixed(2); await sleep(45); }
  s.out.textContent = final.toFixed(2); s.out.className = 'dice-roll-out ' + (r.view.last.win ? 'win' : 'lose');
}
