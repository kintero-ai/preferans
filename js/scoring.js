// Запись пули по правилам «Сочи» и итоговый расчёт
(function (root) {
  'use strict';
  const Pref = root.Pref || (root.Pref = {});
  const R = Pref.Rules;

  function newScore() {
    return {
      pool: [0, 0, 0],
      mountain: [0, 0, 0],
      whists: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], // whists[p][q] — висты p на q
      poolLog: [[], [], []],
      mountainLog: [[], [], []],
    };
  }

  // Сыгранная (или несыгранная) игра.
  // o: {declarer, level, declTricks, defenders:[a,b], whist:[...'W'|'P'], tricks:[3]}
  function gameEntries(o) {
    const V = R.VALUE[o.level], O = R.OBLIGATION[o.level], e = [];
    const decl = o.declarer, [a, b] = o.defenders;
    if (o.declTricks >= o.level) {
      e.push({ kind: 'pool', p: decl, amount: V });
    } else {
      const u = o.level - o.declTricks;
      e.push({ kind: 'mountain', p: decl, amount: V * u });
      // за недобор висты пишут оба защитника
      for (const x of [a, b]) e.push({ kind: 'whist', p: x, q: decl, amount: V * u });
    }
    const W = [a, b].filter(x => o.whist[x] === 'W');
    const defTotal = o.tricks[a] + o.tricks[b];
    if (W.length === 2) {
      for (const x of W) e.push({ kind: 'whist', p: x, q: decl, amount: V * o.tricks[x] });
      if (defTotal < O) {
        for (const x of W) {
          const short = O / 2 - o.tricks[x];
          if (short > 0) e.push({ kind: 'mountain', p: x, amount: V * short });
        }
      }
    } else if (W.length === 1) {
      const w = W[0];
      e.push({ kind: 'whist', p: w, q: decl, amount: V * defTotal });
      if (defTotal < O) e.push({ kind: 'mountain', p: w, amount: V * (O - defTotal) });
    }
    return e;
  }

  // Оба защитника спасовали — игра записывается без розыгрыша
  function passedEntries(declarer, level) {
    return [{ kind: 'pool', p: declarer, amount: R.VALUE[level] }];
  }

  // Полвист: игра не разыгрывается, полвистующий пишет висты за половину обязательства
  function halfWhistEntries(declarer, level, halfWhister) {
    const V = R.VALUE[level];
    return [
      { kind: 'pool', p: declarer, amount: V },
      { kind: 'whist', p: halfWhister, q: declarer, amount: V * R.OBLIGATION[level] / 2 },
    ];
  }

  function misereEntries(declarer, tricks) {
    if (tricks === 0) return [{ kind: 'pool', p: declarer, amount: R.MISERE_VALUE }];
    return [{ kind: 'mountain', p: declarer, amount: R.MISERE_VALUE * tricks }];
  }

  function raspasyEntries(tricks, mult) {
    return tricks.map((t, p) => t === 0
      ? { kind: 'pool', p, amount: mult }
      : { kind: 'mountain', p, amount: mult * t });
  }

  // Применяет записи; перебор пули идёт «помощью» другим (висты 10 за очко)
  function apply(score, entries, limit) {
    const applied = [];
    for (const e of entries) {
      if (!e.amount) continue;
      if (e.kind === 'pool') addPool(score, e.p, e.amount, limit, applied);
      else if (e.kind === 'mountain') {
        score.mountain[e.p] += e.amount;
        score.mountainLog[e.p].push(score.mountain[e.p]);
        applied.push(e);
      } else if (e.kind === 'whist') {
        score.whists[e.p][e.q] += e.amount;
        applied.push(e);
      }
    }
    return applied;
  }

  function addPool(score, p, amount, limit, applied) {
    const room = Math.max(0, limit - score.pool[p]);
    const own = Math.min(room, amount);
    if (own > 0) {
      score.pool[p] += own;
      score.poolLog[p].push(score.pool[p]);
      applied.push({ kind: 'pool', p, amount: own });
    }
    let over = amount - own;
    while (over > 0) {
      const cands = [0, 1, 2].filter(q => q !== p && score.pool[q] < limit);
      if (!cands.length) {
        // все пули закрыты — остаток списывается с горы
        score.mountain[p] -= over;
        score.mountainLog[p].push(score.mountain[p]);
        applied.push({ kind: 'mountain', p, amount: -over });
        break;
      }
      cands.sort((x, y) => score.pool[y] - score.pool[x]);
      const q = cands[0];
      const give = Math.min(over, limit - score.pool[q]);
      score.pool[q] += give;
      score.poolLog[q].push(score.pool[q]);
      score.whists[p][q] += give * 10;
      applied.push({ kind: 'help', p, q, amount: give });
      over -= give;
    }
  }

  const round2 = x => Math.round(x * 100) / 100;

  // Итог в вистах. Незакрытая пуля переносится в гору.
  function settle(score, limit) {
    const m = score.mountain.map((x, p) => x + Math.max(0, limit - score.pool[p]));
    const min = Math.min(...m);
    const W = score.whists.map(r => r.slice());
    for (let p = 0; p < 3; p++) {
      const d = (m[p] - min) * 10 / 3;
      for (let q = 0; q < 3; q++) if (q !== p) W[q][p] += d;
    }
    const balance = [0, 1, 2].map(p => {
      let s = 0;
      for (let q = 0; q < 3; q++) if (q !== p) s += W[p][q] - W[q][p];
      return round2(s);
    });
    return { balance, mountainEff: m };
  }

  Pref.Scoring = {
    newScore, gameEntries, passedEntries, halfWhistEntries, misereEntries, raspasyEntries, apply, settle,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
