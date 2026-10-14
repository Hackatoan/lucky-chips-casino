// Craps client: dice + puck, line/come bets with odds, place/buy/lay/hard/big numbers, field and every proposition bet.
import { h, clear, fmt, sgn, die, chip, btn, store, sleep } from '../ui.js';
import { sfx } from '../sfx.js';
import { animOn } from '../fx.js';

const NUMS = [4, 5, 6, 8, 9, 10];
const NUM_WORD = { 6: 'SIX', 8: 'EIGHT' };
const TOOLS = [
  ['pass', 'Pass Line', 'line'], ['dontpass', "Don't Pass", 'line'], ['come', 'Come', 'line'], ['dontcome', "Don't Come", 'line'], ['field', 'Field', 'one'],
  ['place', 'Place', 'num'], ['buy', 'Buy', 'num'], ['lay', 'Lay', 'num'], ['hard', 'Hardway', 'num'], ['big', 'Big 6/8', 'num'],
];
const PROPS = ['any7', 'anycraps', 'two', 'three', 'eleven', 'twelve', 'ce', 'horn'];
const UNIT = { 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] };

export default {
  init(ctx) {
    const s = ctx._cr = { staged: [], chip: store.get('craps.chip', 5), tool: 'pass', dice: [1, 1], last: null };
    s.defs = ctx.game.meta.bets;
    s.diceBox = h('div', { class: 'dice-box' });
    s.puck = h('div', { class: 'puck' });
    s.rolls = h('div', { class: 'rl-hist' });
    s.layout = h('div', { class: 'cr-layout' });
    s.active = h('div', { class: 'bets-list' });
    s.tools = h('div', { class: 'row', style: { justifyContent: 'center', margin: '6px 0' } });
    s.stagedBox = h('div', { class: 'bets-list' });
    s.controls = h('div', { class: 'controls' });
    ctx.stage.replaceChildren(h('div', { class: 'zone-title' }, 'Craps'), h('div', { class: 'cr-top' }, s.puck, s.diceBox), s.rolls, s.layout, s.tools, s.stagedBox, s.active, s.controls);
  },
  render(v, ctx) {
    const s = ctx._cr; s.v = v;
    if (v.last && !s.shown) { s.dice = [v.last.d1, v.last.d2]; s.shown = true; }
    drawDice(s); drawPuck(s, v.point);
    clear(s.rolls); (v.rolls || []).slice(-24).forEach(t => s.rolls.append(h('span', { class: t === 7 ? 'red' : t === 11 || t === 2 || t === 12 || t === 3 ? 'black' : 'green' }, t)));
    drawLayout(ctx); drawTools(ctx); drawStaged(ctx); drawActive(ctx); drawControls(ctx); drawCoach(ctx);
  },
  async onResult(ctx, data) {
    const s = ctx._cr; if (!s) return; const o = data.outcome; if (!o || o.d1 === undefined) return;
    await animateDice(s, o.d1, o.d2);
  },
  spectate(ctx, snap) {
    if (!ctx._cr) { this.init(ctx); ctx._cr.controls.remove(); ctx._cr.tools.remove(); ctx._cr.stagedBox.remove(); ctx._cr.active.remove(); ctx._cr.layout.remove(); ctx.stage.prepend(h('div', { class: 'spectator-banner' }, '👁 Watching table ' + snap.code)); }
    const s = ctx._cr; const mem = snap.mem || { point: 0, rolls: [] };
    drawPuck(s, mem.point); clear(s.rolls); mem.rolls.slice(-24).forEach(t => s.rolls.append(h('span', { class: t === 7 ? 'red' : 'green' }, t)));
    if (snap.outcome && !s.seen) { s.seen = true; s.dice = [snap.outcome.d1, snap.outcome.d2]; }
    drawDice(s);
  },
};

function drawDice(s) { s.diceBox.replaceChildren(die(s.dice[0]), die(s.dice[1]), h('div', { class: 'dice-total' }, s.dice[0] + s.dice[1])); }
function drawPuck(s, point) { s.puck.className = 'puck ' + (point ? 'on' : 'off'); s.puck.replaceChildren(h('b', null, point ? 'ON' : 'OFF'), h('span', null, point ? 'Point ' + point : 'Come-out')); }
async function animateDice(s, a, b) {
  if (!animOn()) { s.dice = [a, b]; drawDice(s); return; }
  sfx.play('dice');
  for (let i = 0; i < 9; i++) { s.diceBox.replaceChildren(die(1 + Math.floor(Math.random() * 6), { roll: true }), die(1 + Math.floor(Math.random() * 6), { roll: true })); await sleep(80); }
  s.dice = [a, b]; drawDice(s);
}

function addStage(ctx, b) {
  const s = ctx._cr, def = s.defs[b.type];
  let amount = s.chip;
  const step = def.step || 1;
  if (b.type === 'place' && b.num) amount = Math.max(5, Math.round(amount / 5) * 5);   // 6/8 pay 7:6 rounded down on non-multiples of 6, like a real table
  else if (b.type === 'lay') { const u = UNIT[b.num][0] === 6 ? 6 : UNIT[b.num][1] === 1 ? 2 : 3; amount = Math.max(u, Math.round(amount / u) * u); }
  else if (step > 1) amount = Math.max(step, Math.round(amount / step) * step);
  const key = b.type + ':' + (b.num || 0);
  const e = s.staged.find(x => x.key === key);
  if (e) e.amount += amount; else s.staged.push({ key, type: b.type, num: b.num || 0, amount });
  sfx.play('chip'); drawStaged(ctx); drawControls(ctx);
}
const KIND = { place: 'Place', buy: 'Buy', lay: 'Lay', hard: 'Hard', big: 'Big' };
// which extra bet types exist on each number (clicking the number itself is always a Place bet)
const ALTS = n => ['buy', 'lay', ...([4, 6, 8, 10].includes(n) ? ['hard'] : []), ...(n === 6 || n === 8 ? ['big'] : [])];
function drawLayout(ctx) {
  const s = ctx._cr, v = s.v; clear(s.layout);
  const cells = NUMS.map(n => {
    const mine = v.bets.filter(b => b.num === n).map(b => h('span', { class: 'stk', title: `${b.name} ${b.num} — on the table` }, `${KIND[b.type] || b.type} ${fmt(b.amount)}`));
    const here = s.staged.filter(b => b.num === n).map(b => h('span', { class: 'stk staged', title: 'staged — placed when you roll' }, `${KIND[b.type] || b.type} ${fmt(b.amount)}`));
    const add = type => { if (ctx.readonly) return; sfx.play('click'); addStage(ctx, { type, num: n }); drawLayout(ctx); };
    return h('div', { class: 'cr-numcell' + (v.point === n ? ' point' : '') },
      h('button', { type: 'button', class: 'cr-num' + (v.point === n ? ' point' : ''), title: `Place ${n}: ${s.defs.place.pays}. Click to bet your chip value.`, onclick: () => add('place') },
        v.point === n ? h('i', { class: 'puck-mini' }, 'ON') : null, h('b', null, NUM_WORD[n] || n), h('span', { class: 'cr-stk' }, ...mine, ...here)),
      h('div', { class: 'cr-alt' }, ALTS(n).map(t => h('button', { type: 'button', class: 'cr-altbtn', title: `${s.defs[t].name} ${n} — ${s.defs[t].pays} (edge ${(s.defs[t].edge * 100).toFixed(2)}%)`, onclick: () => add(t) }, KIND[t]))));
  });
  s.layout.append(h('div', { class: 'cr-nums' }, cells),
    h('div', { class: 'cr-lines' }, [['field', 'FIELD  2·3·4·9·10·11·12', 'one'], ['pass', 'PASS LINE', 'line'], ['dontpass', "DON'T PASS BAR", 'line'], ['come', 'COME', 'line'], ['dontcome', "DON'T COME", 'line']].map(([t, l]) => {
      const has = v.bets.filter(b => b.type === t && !b.pt).map(b => b.amount).reduce((a, b) => a + b, 0) + s.staged.filter(b => b.type === t).reduce((a, b) => a + b.amount, 0);
      return h('button', { type: 'button', class: 'cr-line ' + t, title: s.defs[t] ? `${s.defs[t].pays} · edge ${(s.defs[t].edge * 100).toFixed(2)}%` : '', onclick: () => { if (ctx.readonly) return; addStage(ctx, { type: t }); drawLayout(ctx); } }, l, has ? h('span', { class: 'stk' }, fmt(has)) : null);
    })));
}
function drawTools(ctx) {
  const s = ctx._cr;
  s.tools.replaceChildren(h('span', { class: 'muted small' }, 'Click a bet on the layout to add your chip value — numbers are Place bets; the small buttons under each number are Buy, Lay, Hard and Big.'),
    h('select', { 'aria-label': 'Proposition bets', onchange: e => { if (e.target.value) { addStage(ctx, { type: e.target.value }); drawLayout(ctx); } e.target.value = ''; } }, h('option', { value: '' }, 'Prop bets…'), PROPS.map(p => h('option', { value: p }, `${s.defs[p].name} — ${s.defs[p].pays} (${(s.defs[p].edge * 100).toFixed(1)}% edge)`))));
}
function drawStaged(ctx) {
  const s = ctx._cr; clear(s.stagedBox);
  if (!s.staged.length) return;
  s.stagedBox.append(h('div', { class: 'muted small' }, 'Staged — will be placed when you roll:'));
  for (const b of s.staged) s.stagedBox.append(h('div', null, h('span', null, `${s.defs[b.type].name}${b.num ? ' ' + b.num : ''}`), h('span', null, h('b', { class: 'gold' }, fmt(b.amount)), ' ', h('button', { class: 'x', onclick: () => { const i = ctx._cr.staged.indexOf(b); ctx._cr.staged.splice(i, 1); drawStaged(ctx); drawLayout(ctx); drawControls(ctx); } }, '✕'))));
}
function oddsLimits(ctx, b) {
  const v = ctx._cr.v, pt = (b.type === 'pass' || b.type === 'dontpass') ? v.point : b.pt; if (!pt) return null;
  const lay = b.type === 'dontpass' || b.type === 'dontcome';
  const unit = lay ? UNIT[pt][1] : UNIT[pt][1]; const max = v.maxOdds * b.amount - b.odds;
  return { pt, unit, max: Math.floor(max / unit) * unit };
}
function drawActive(ctx) {
  const s = ctx._cr, v = s.v; clear(s.active);
  if (!v.bets.length) return;
  s.active.append(h('div', { class: 'muted small' }, 'On the table:'));
  for (const b of v.bets) {
    const ol = ['pass', 'dontpass', 'come', 'dontcome'].includes(b.type) ? oddsLimits(ctx, b) : null;
    s.active.append(h('div', null,
      h('span', null, `${b.name}${b.num ? ' ' + b.num : ''}${b.pt ? ' → ' + b.pt : ''}`, !b.working ? h('i', { class: 'muted small' }, ' (off)') : null),
      h('span', null, h('b', { class: 'gold' }, fmt(b.amount)), b.odds ? h('span', { class: 'small' }, ' +' + fmt(b.odds) + ' odds') : null, ' ',
        ol && ol.max > 0 && !ctx.readonly ? h('button', { class: 'btn xs green', title: `True-odds bet (0% edge). Max ${v.maxOdds}× your flat bet.`, onclick: () => (ctx.table && ctx.table.role === 'player' ? ctx.primary('roll', { odds: { id: b.id, amount: ol.max } }) : ctx.call('odds', { id: b.id, amount: ol.max })) }, `+ Max odds (${fmt(ol.max)})`) : null, ' ',
        b.removable && !ctx.readonly ? h('button', { class: 'x', title: 'Take down', onclick: () => removeBet(ctx, b.id) }, '✕') : null)));
  }
}
async function removeBet(ctx, id) {
  if (ctx.table && ctx.table.role === 'player') { await ctx.primary('roll', { remove: [id] }); } else await ctx.call('remove', { ids: [id] });
}
function drawControls(ctx) {
  const s = ctx._cr, v = s.v; clear(s.controls);
  if (ctx.readonly) return;
  const total = s.staged.reduce((a, b) => a + b.amount, 0);
  const tab = ctx.table && ctx.table.role === 'player';
  s.controls.append(h('div', { class: 'betpicker' }, h('div', { class: 'small muted' }, 'Chip value'), h('div', { class: 'bp-chips' }, [1, 5, 25, 100, 500].map(c => chip(c, { active: s.chip === c, small: true, onclick: () => { s.chip = c; store.set('craps.chip', c); sfx.play('click'); drawControls(ctx); } })))),
    h('div', { class: 'actions', style: { width: '100%' } },
      h('span', { class: 'badge gold' }, '🪙 Staged: ' + fmt(total)),
      btn(tab ? 'Place staged bets' : 'Place bets', '', () => commit(ctx, false), { disabled: !s.staged.length || ctx.sitting }),
      btn(tab ? '🎲 Go (roll now)' : '🎲 Roll', 'gold big', () => commit(ctx, true), { disabled: ctx.sitting || (!s.staged.length && !v.bets.length) })));
}
async function commit(ctx, roll) {
  const s = ctx._cr; const tab = ctx.table && ctx.table.role === 'player';
  if (s.staged.length) {
    const bets = s.staged.map(b => ({ type: b.type, num: b.num || undefined, amount: b.amount }));
    const r = tab ? await ctx.primary('roll', { bets }) : await ctx.call('place', { bets });
    if (!r) return;
    s.staged = []; drawStaged(ctx); drawLayout(ctx); drawControls(ctx);
  }
  if (!roll) return;
  if (tab) { try { await ctx.tableCall('ready'); } catch (e) { ctx.toast(e.message, 'bad'); } return; }
  const r = await ctx.call('roll', {});
  if (r && r.view && r.view.last) { await animateDice(s, r.view.last.d1, r.view.last.d2); }
}
function drawCoach(ctx) {
  const v = ctx._cr.v;
  ctx.setCoach(h('div', { class: 'coach-content' },
    h('div', { class: 'coach-best' }, h('b', null, v.point ? `★ Point is ${v.point}: take odds!` : '★ Come-out roll: Pass Line (1.41%) or Don\'t Pass (1.36%)'), h('p', { class: 'small', style: { margin: '4px 0 0' } }, v.point ? `Odds behind your line bet pay true odds — a 0% house edge. With ${v.maxOdds}× odds your total edge on the Pass Line drops to about ${(1.41 / (1 + v.maxOdds) * 1.0).toFixed(2)}%. Use the “+ Max odds” button on your bet.` : 'Start with a line bet, then add odds once a point is established. It is the cheapest bet in any casino.')),
    h('div', { class: 'coach-opt' }, h('b', null, 'Good bets'), 'Pass / Don\'t Pass + max odds (≈0.2–0.8% total) · Place 6 & 8 (1.52%) · Come / Don\'t Come + odds · Field (2.78% here).'),
    h('div', { class: 'coach-opt no' }, h('b', null, 'Avoid'), 'Big 6/8 (9.1%) — Place 6/8 is better · Hardways (9–11%) · Any 7 (16.7%) · Horn, C&E, Aces, Boxcars, Yo (11–14%).'),
    h('p', { class: 'muted small' }, 'Place/Buy/Lay/Hardway/Big bets are "off" on the come-out roll. Hover any bet type for its payout and house edge.')));
}
