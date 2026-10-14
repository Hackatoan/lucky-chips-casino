// Hold'em engine: evaluator, side pots, chip conservation over thousands of random hands, bot brain sanity.
const P = require('../lib/poker'), C = require('../lib/cards');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('PASS', m); };
const card = s => { const r = '23456789TJQKA'.indexOf(s[0]), u = 'SHDC'.indexOf(s[1]); return u * 13 + r; };
const hand = s => s.split(' ').map(card);
const sc = s => P.best(hand(s)).score;
ok(sc('AS KS QS JS TS 2D 3C') > sc('9S KS QS JS TS 2D 3C'), 'royal flush beats king-high straight flush');
ok(P.describe(sc('AS KS QS JS TS 2D 3C')) === 'Royal flush', 'royal flush is named');
ok(sc('AS 2D 3C 4H 5S 9D KC') > sc('KS KD 3C 4H 5S 9D 2C'), 'the wheel (A-5 straight) beats a pair');
ok(P.describe(sc('AS 2D 3C 4H 5S 9D KC')) === 'Straight, Five high', 'wheel plays as five-high');
ok(sc('KS KD KC 4H 4S 9D 2C') > sc('QS QD QC AH AS 9D 2C'), 'kings full beats queens full');
ok(sc('AS AD KC KH 4S 9D 2C') > sc('AS AD QC QH KS 9D 2C'), 'aces and kings beats aces and queens');
ok(sc('AS AD KC 7H 4S 9D 2C') < sc('AS AD KC 8H 4S 9D 2C'), 'higher kicker wins');
ok(sc('AS KS 3S 4S 9S 2D 7C') > sc('QH QD QC 4S 9S 2D 7C'), 'flush beats trips');
ok(P.catOf(sc('2S 2D 2C 2H 5S 9D KC')) === 7, 'quads detected');
ok(sc('AS KD QC JH TS 2D 3C') > sc('KS QD JC TH 9S 2D 3C'), 'ace-high straight beats king-high');
ok(P.best(hand('2S 3S 4S 5S 6S')).score === sc('2S 3S 4S 5S 6S'), 'five-card hands evaluate directly');

// side pots: A all-in 100, B all-in 300, C calls 300 → main pot 300 (A,B,C), side pot 400 (B,C)
{
  const h = P.newHand({ seats: [{ id: 'A', name: 'A', stack: 100 }, { id: 'B', name: 'B', stack: 300 }, { id: 'C', name: 'C', stack: 1000 }], button: 2, sb: 5, bb: 10 });
  while (!h.done) { const i = h.toAct, l = P.legal(h, i); const p = h.players[i]; if (p.id === 'C') P.act(h, i, l.call ? 'call' : 'check'); else P.act(h, i, l.raise ? 'raise' : 'call', l.raise ? l.raise.max : 0); }
  const sum = Object.values(h.result.pay).reduce((a, b) => a + b, 0);
  ok(sum === 700 && h.result.pots.length >= 2 && h.result.pots[0].amount === 300, `side pots: ${JSON.stringify(h.result.pots)} total ${sum}`);
  ok(h.result.hands.A && h.result.hands.B && h.result.hands.C, 'all three hands are revealed at showdown');
}
// everyone folds to the big blind: no showdown, nothing revealed
{
  const h = P.newHand({ seats: [{ id: 'A', name: 'A', stack: 500 }, { id: 'B', name: 'B', stack: 500 }, { id: 'C', name: 'C', stack: 500 }], button: 0, sb: 5, bb: 10 });
  P.act(h, h.toAct, 'fold'); P.act(h, h.toAct, 'fold');
  ok(h.done && !h.result.showdown && Object.keys(h.result.hands).length === 0 && h.result.pay[h.players[h.bbIdx].id] === 15, 'folds to the big blind win the blinds with no hands shown');
}
// heads-up: the button posts the small blind and acts first before the flop
{
  const h = P.newHand({ seats: [{ id: 'A', name: 'A', stack: 500 }, { id: 'B', name: 'B', stack: 500 }], button: 0, sb: 5, bb: 10 });
  ok(h.sbIdx === 0 && h.toAct === 0, 'heads-up: button is the small blind and acts first preflop');
  P.act(h, 0, 'call'); P.act(h, 1, 'check');
  ok(h.street === 'flop' && h.toAct === 1, 'heads-up: big blind acts first after the flop');
}
// chips are conserved across thousands of random hands
{
  let bad = 0, hands = 0, showdowns = 0, splits = 0;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  for (let g = 0; g < 4000; g++) {
    const n = 2 + Math.floor(Math.random() * 8);
    const seats = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'p' + i, stack: pick([1, 8, 15, 40, 100, 300, 1000, 5000]) }));
    const before = seats.reduce((a, s) => a + s.stack, 0);
    let h; try { h = P.newHand({ seats, button: Math.floor(Math.random() * n), sb: 5, bb: 10 }); } catch (e) { bad++; console.log('newHand', e.message); continue; }
    let guard = 0;
    try {
      while (!h.done && guard++ < 400) {
        const i = h.toAct, l = P.legal(h, i); if (!l) { bad++; console.log('no legal at', i, h.street); break; }
        const r = Math.random();
        if (r < 0.15 && !l.check) P.act(h, i, 'fold');
        else if (r < 0.40 && l.raise) P.act(h, i, 'raise', r < 0.25 ? l.raise.max : l.raise.min + Math.floor(Math.random() * (l.raise.max - l.raise.min + 1)));
        else if (l.check) P.act(h, i, 'check'); else P.act(h, i, 'call');
      }
    } catch (e) { bad++; console.log('act', e.message); }
    if (!h.done) { bad++; console.log('hand did not finish'); continue; }
    hands++;
    const after = h.players.reduce((a, p) => a + p.stack, 0);
    const paid = Object.values(h.result.pay).reduce((a, b) => a + b, 0), put = h.players.reduce((a, p) => a + p.total, 0);
    if (after !== before || paid !== put || h.players.some(p => p.stack < 0)) { bad++; console.log('conservation', before, after, paid, put); }
    if (h.result.showdown) showdowns++;
    if (h.result.pots.some(p => p.winners.length > 1)) splits++;
  }
  ok(bad === 0, `4000 random hands: chips conserved, every hand finishes (showdowns ${showdowns}, split pots ${splits})`);
}
// bot brain: always returns a legal action; coach advice has the expected shape
{
  let bad = 0;
  for (let g = 0; g < 300; g++) {
    const h = P.newHand({ seats: Array.from({ length: 2 + g % 6 }, (_, i) => ({ id: 'b' + i, name: 'b' + i, stack: 1000 })), button: g % 2, sb: 5, bb: 10 });
    let guard = 0;
    while (!h.done && guard++ < 100) {
      const i = h.toAct, m = P.botMove(h, i, P.PERSONAS[g % 4]);
      try { P.act(h, i, m.action, m.to); } catch (e) { bad++; console.log('bot illegal', JSON.stringify(m), e.message); break; }
    }
  }
  ok(bad === 0, 'bots only ever make legal moves');
  const h = P.newHand({ seats: [{ id: 'a', name: 'a', stack: 1000 }, { id: 'b', name: 'b', stack: 1000 }], button: 0, sb: 5, bb: 10 });
  const adv = P.advise(h, h.toAct); ok(adv && ['fold', 'call', 'raise', 'check'].includes(adv.rec) && adv.eq > 0 && adv.eq < 1 && adv.why.length > 20, 'coach advice has a recommendation, equity and a reason');
  const aa = P.equity(hand('AS AD'), [], 1, 800), seven2 = P.equity(hand('7S 2D'), [], 1, 800);
  ok(aa > 0.78 && aa < 0.9 && seven2 < 0.42, `equity sanity: AA ${aa.toFixed(2)} (≈0.85) vs 72o ${seven2.toFixed(2)} (≈0.35)`);
}
console.log(fails ? `\n${fails} FAILED` : '\npoker tests passed'); process.exit(fails ? 1 : 0);
