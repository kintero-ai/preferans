// Запуск: node tests/run.js [число сдач для симуляции]
'use strict';
const assert = require('assert');
const path = require('path');
for (const f of ['cards', 'rules', 'scoring', 'engine', 'ai']) require(path.join(__dirname, '..', 'js', f + '.js'));
const { Cards: C, Rules: R, Scoring: S, Engine: E, AI } = globalThis.Pref;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; }
}
const card = (s, r) => C.makeCard(s, r); // r: 0=7 … 7=туз
const sumEntries = (score) => score;

test('лестница заявок', () => {
  assert.strictEqual(R.BIDS.length, 26);
  assert.strictEqual(R.bidName(R.MISERE - 1), '8БК');
  assert.strictEqual(R.bidName(R.MISERE), 'Мизер');
  assert.strictEqual(R.bidName(R.MISERE + 1), '9♠');
  assert.strictEqual(R.bidName(0), '6♠');
  assert.strictEqual(R.bidName(25), '10БК');
});

test('допустимые ходы', () => {
  const hand = [card(0, 1), card(1, 5), card(3, 7)];
  assert.deepStrictEqual(R.legalCards(hand, 0, 3), [card(0, 1)]);
  assert.deepStrictEqual(R.legalCards(hand, 2, 3), [card(3, 7)]); // нет масти — козырь
  assert.strictEqual(R.legalCards(hand, 2, null).length, 3);
  assert.strictEqual(R.legalCards(hand, null, 3).length, 3);
});

test('победитель взятки', () => {
  const t = [{ seat: 0, card: card(0, 3) }, { seat: 1, card: card(0, 7) }, { seat: 2, card: card(3, 0) }];
  assert.strictEqual(R.trickWinner(t, 0, 3), 2);
  assert.strictEqual(R.trickWinner(t, 0, null), 1);
  // распасы: масть прикупа ♦, никто её не дал — старшая в масти первого хода
  assert.strictEqual(R.trickWinner(t, 2, null), 1);
});

function scoreOf(entries, limit = 20) {
  const s = S.newScore();
  S.apply(s, entries, limit);
  return s;
}

test('сыгранная 7♥, оба виста', () => {
  const s = scoreOf(S.gameEntries({ declarer: 0, level: 7, declTricks: 7, defenders: [1, 2], whist: [null, 'W', 'W'], tricks: [7, 2, 1] }));
  assert.deepStrictEqual(s.pool, [4, 0, 0]);
  assert.strictEqual(s.whists[1][0], 8);
  assert.strictEqual(s.whists[2][0], 4);
  assert.deepStrictEqual(s.mountain, [0, 0, 0]);
});

test('недобор на 6, одиночный вист', () => {
  const s = scoreOf(S.gameEntries({ declarer: 0, level: 6, declTricks: 5, defenders: [1, 2], whist: [null, 'W', 'P'], tricks: [5, 3, 2] }));
  assert.strictEqual(s.mountain[0], 2);
  assert.strictEqual(s.whists[1][0], 2 * 5 + 2);
  assert.strictEqual(s.whists[2][0], 2);
});

test('недовист: оба вистовали на 6, взяли 2+1', () => {
  const s = scoreOf(S.gameEntries({ declarer: 0, level: 6, declTricks: 7, defenders: [1, 2], whist: [null, 'W', 'W'], tricks: [7, 2, 1] }));
  assert.deepStrictEqual(s.pool, [2, 0, 0]);
  assert.deepStrictEqual(s.mountain, [0, 0, 2]);
});

test('недовист одиночного вистующего', () => {
  const s = scoreOf(S.gameEntries({ declarer: 0, level: 6, declTricks: 7, defenders: [1, 2], whist: [null, 'P', 'W'], tricks: [7, 2, 1] }));
  assert.strictEqual(s.mountain[2], 2);
  assert.strictEqual(s.whists[2][0], 6);
});

test('мизер и распасы', () => {
  assert.deepStrictEqual(scoreOf(S.misereEntries(1, 2)).mountain, [0, 20, 0]);
  assert.deepStrictEqual(scoreOf(S.misereEntries(1, 0)).pool, [0, 10, 0]);
  const s = scoreOf(S.raspasyEntries([0, 4, 6], 2));
  assert.deepStrictEqual(s.pool, [2, 0, 0]);
  assert.deepStrictEqual(s.mountain, [0, 8, 12]);
});

test('полвист', () => {
  const s = scoreOf(S.halfWhistEntries(0, 6, 2));
  assert.deepStrictEqual(s.pool, [2, 0, 0]);
  assert.strictEqual(s.whists[2][0], 4);
});

test('перебор пули — помощь', () => {
  const s = S.newScore();
  s.pool = [8, 3, 5];
  S.apply(s, [{ kind: 'pool', p: 0, amount: 4 }], 10);
  assert.deepStrictEqual(s.pool, [10, 3, 7]);
  assert.strictEqual(s.whists[0][2], 20);
});

test('итог сходится к нулю', () => {
  const s = S.newScore();
  s.pool = [20, 20, 20];
  s.mountain = [14, 2, 40];
  s.whists = [[0, 30, 12], [5, 0, 80], [44, 10, 0]];
  const f = S.settle(s, 20);
  assert.ok(Math.abs(f.balance.reduce((a, b) => a + b, 0)) < 0.05, f.balance);
});

test('торговля: «здесь» и мизер', () => {
  const g = E.newGame({}, C.seededRandom(1));
  const d = g.deal;
  const [a, b, c] = [d.eldest, (d.eldest + 1) % 3, (d.eldest + 2) % 3];
  E.applyBid(g, a, 0);          // 6♠
  E.applyBid(g, b, 1);          // 6♣
  assert.ok(E.legalBids(d, c).includes(R.MISERE));
  E.applyBid(g, c, R.PASS);
  assert.ok(E.legalBids(d, a).includes(1), 'старшая рука может сказать «здесь»');
  assert.ok(!E.legalBids(d, a).includes(R.MISERE), 'после заявки игры мизер нельзя');
  E.applyBid(g, a, 1);
  assert.ok(!E.legalBids(d, b).includes(1));
  E.applyBid(g, b, R.PASS);
  assert.strictEqual(d.phase, 'discard');
  assert.strictEqual(d.declarer, a);
  assert.strictEqual(d.hands[a].length, 12);
});

test('все пас — распасы', () => {
  const g = E.newGame({}, C.seededRandom(2));
  const d = g.deal;
  for (let i = 0; i < 3; i++) E.applyBid(g, d.turn, R.PASS);
  assert.strictEqual(d.type, 'raspasy');
  assert.strictEqual(d.phase, 'play');
  assert.strictEqual(d.mult, 1);
});

// ---------- Симуляция боты против ботов ----------
function autoplay(game, stats, maxDeals) {
  for (let n = 0; n < maxDeals; n++) {
    for (let guard = 0; guard < 500; guard++) {
      const a = E.whoActs(game);
      const d = game.deal;
      if (a.kind === 'bid') E.applyBid(game, a.seat, AI.chooseBid(game, a.seat));
      else if (a.kind === 'discard') E.applyDiscard(game, AI.chooseDiscard(game, a.seat));
      else if (a.kind === 'contract') E.applyContract(game, AI.chooseContract(game, a.seat));
      else if (a.kind === 'whist') E.applyWhist(game, a.seat, AI.chooseWhist(game, a.seat));
      else if (a.kind === 'play') E.playCard(game, a.seat, AI.chooseCard(game, a.seat, { samples: 6, timeMs: 1e9 }));
      else if (a.kind === 'collect') E.collectTrick(game);
      else break;
    }
    const d = game.deal;
    assert.strictEqual(d.phase, 'done');
    if (d.result.how === 'played') {
      assert.strictEqual(d.tricks.reduce((x, y) => x + y, 0), 10);
      assert.ok(d.hands.every(h => h.length === 0));
    }
    stats.deals++;
    if (d.type === 'raspasy') stats.raspasy++;
    else if (d.type === 'misere') { stats.misere++; if (d.tricks[d.declarer] === 0) stats.misereOk++; }
    else {
      stats.games++;
      if (d.result.how === 'played') { stats.played++; if (d.tricks[d.declarer] >= d.level) stats.made++; }
    }
    if (game.over) return true;
    E.nextDeal(game);
  }
  return false;
}

const dealsTarget = Number(process.argv[2] || 600);
test(`симуляция ${dealsTarget} сдач`, () => {
  const stats = { deals: 0, raspasy: 0, misere: 0, misereOk: 0, games: 0, played: 0, made: 0, finished: 0 };
  const t0 = Date.now();
  while (stats.deals < dealsTarget) {
    const g = E.newGame({ poolLimit: 10 });
    if (autoplay(g, stats, dealsTarget - stats.deals)) {
      stats.finished++;
      const sum = g.final.balance.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum) < 0.05, 'сумма итогов ' + sum);
    }
  }
  console.log(`  сдач ${stats.deals} за ${Date.now() - t0} мс; партий доиграно ${stats.finished}`);
  console.log(`  игр ${stats.games} (разыграно ${stats.played}, сыграно ${stats.made}), мизеров ${stats.misere} (чистых ${stats.misereOk}), распасов ${stats.raspasy}`);
});

console.log(`${passed} тестов прошло${process.exitCode ? ', есть ошибки' : ''}`);
