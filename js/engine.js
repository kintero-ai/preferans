// Ход партии: сдача → торговля → прикуп → игра → вист → розыгрыш → запись.
// Состояние — простой JSON (сохраняется в localStorage). Место 0 — человек, 1 — слева, 2 — справа; ход по кругу 0→1→2.
(function (root) {
  'use strict';
  const Pref = root.Pref || (root.Pref = {});
  const C = Pref.Cards, R = Pref.Rules, S = Pref.Scoring;

  const DEFAULT_SETTINGS = { poolLimit: 20, speed: 'normal', fourColor: false };
  const NAMES = ['Вы', 'Запад', 'Восток'];

  const others = p => [(p + 1) % 3, (p + 2) % 3];

  function newGame(settings, rnd) {
    rnd = rnd || Math.random;
    const game = {
      v: 1,
      settings: Object.assign({}, DEFAULT_SETTINGS, settings || {}),
      names: NAMES.slice(),
      score: S.newScore(),
      dealer: Math.floor(rnd() * 3),
      raspasyStreak: 0,
      dealNo: 0,
      history: [],
      over: false,
      final: null,
      deal: null,
    };
    startDeal(game, rnd, true);
    return game;
  }

  function startDeal(game, rnd, first) {
    if (!first) game.dealer = (game.dealer + 1) % 3;
    const deck = C.shuffle(C.newDeck(), rnd);
    game.dealNo++;
    const eldest = (game.dealer + 1) % 3;
    game.deal = {
      no: game.dealNo,
      dealer: game.dealer,
      eldest,
      hands: [deck.slice(0, 10), deck.slice(10, 20), deck.slice(20, 30)],
      talon: deck.slice(30, 32),
      discards: [],
      phase: 'bidding',
      turn: eldest,
      bidLog: [],
      lastBid: [null, null, null],
      passed: [false, false, false],
      hasBid: [false, false, false],
      misereBy: -1,
      curBid: -1,
      curHolder: -1,
      declarer: -1,
      bid: -1,
      contract: -1,
      type: null, // 'game' | 'misere' | 'raspasy'
      level: 0,
      trump: null,
      talonOpen: false,
      whist: [null, null, null],
      whistOrder: null,
      whistStage: 0,
      openSeats: [false, false, false],
      controller: [0, 1, 2],
      trick: [],
      trickNo: 0,
      tricks: [0, 0, 0],
      lastTrick: null,
      pendingCollect: false,
      trickWinner: -1,
      voids: [[false, false, false, false], [false, false, false, false], [false, false, false, false]],
      played: [],
      mult: 1,
      result: null,
    };
  }

  function nextDeal(game, rnd) {
    if (game.over) return;
    startDeal(game, rnd || Math.random, false);
  }

  // ---------- Торговля ----------
  const seniority = (d, p) => (p - d.eldest + 3) % 3;

  function legalBids(d, p) {
    if (d.phase !== 'bidding' || d.turn !== p) return [];
    const res = [R.PASS];
    if (d.misereBy === p) return res; // заявивший мизер дальше не торгуется
    for (let i = 0; i < R.BIDS.length; i++) {
      if (i === R.MISERE) {
        if (!d.hasBid[p] && i > d.curBid) res.push(i);
        continue;
      }
      // «здесь»: старшая рука может повторить заявку младшей
      if (i > d.curBid || (i === d.curBid && d.curBid !== R.MISERE && d.curHolder !== p &&
          seniority(d, p) < seniority(d, d.curHolder))) res.push(i);
    }
    return res;
  }

  function applyBid(game, p, b) {
    const d = game.deal;
    if (!legalBids(d, p).includes(b)) throw new Error('Недопустимая заявка');
    d.bidLog.push({ p, b });
    d.lastBid[p] = b;
    if (b === R.PASS) d.passed[p] = true;
    else {
      d.curBid = b;
      d.curHolder = p;
      d.hasBid[p] = true;
      if (b === R.MISERE) d.misereBy = p;
    }
    const active = [0, 1, 2].filter(x => !d.passed[x]);
    if (active.length === 0) return startRaspasy(game);
    if (active.length === 1 && d.curHolder === active[0]) return winBidding(game, active[0]);
    let n = (p + 1) % 3;
    while (d.passed[n]) n = (n + 1) % 3;
    d.turn = n;
  }

  function winBidding(game, p) {
    const d = game.deal;
    d.declarer = p;
    d.bid = d.curBid;
    d.type = d.bid === R.MISERE ? 'misere' : 'game';
    d.hands[p] = d.hands[p].concat(d.talon);
    d.talonOpen = true;
    d.phase = 'discard';
    d.turn = p;
  }

  function applyDiscard(game, cards) {
    const d = game.deal;
    if (d.phase !== 'discard') throw new Error('Не время сноса');
    const hand = d.hands[d.declarer];
    if (cards.length !== 2 || cards[0] === cards[1] || !cards.every(c => hand.includes(c))) {
      throw new Error('Нужно снести две карты');
    }
    d.hands[d.declarer] = hand.filter(c => !cards.includes(c));
    d.discards = cards.slice();
    if (d.type === 'misere') {
      d.contract = R.MISERE;
      d.trump = null;
      startPlay(game);
    } else {
      d.phase = 'contract';
    }
  }

  function legalContracts(d) {
    if (d.phase !== 'contract') return [];
    const res = [];
    for (let i = d.bid; i < R.BIDS.length; i++) if (i !== R.MISERE) res.push(i);
    return res;
  }

  function applyContract(game, c) {
    const d = game.deal;
    if (!legalContracts(d).includes(c)) throw new Error('Недопустимая игра');
    const b = R.BIDS[c];
    d.contract = c;
    d.level = b.level;
    d.trump = b.strain === R.NT ? null : b.strain;
    d.phase = 'whist';
    d.whistOrder = others(d.declarer);
    d.whistStage = 0;
    d.turn = d.whistOrder[0];
  }

  // ---------- Вист ----------
  function whistOptions(d, p) {
    if (d.phase !== 'whist' || d.turn !== p) return [];
    if (d.whistStage === 1 && d.whist[d.whistOrder[0]] === 'P' && d.level === 6) return ['W', 'P', 'H'];
    return ['W', 'P'];
  }

  function applyWhist(game, p, ch) {
    const d = game.deal;
    if (!whistOptions(d, p).includes(ch)) throw new Error('Недопустимый ответ');
    const [first, second] = d.whistOrder;
    if (d.whistStage === 0) {
      d.whist[p] = ch;
      d.whistStage = 1;
      d.turn = second;
      return;
    }
    if (d.whistStage === 1) {
      d.whist[p] = ch;
      if (ch === 'H') { // спасовавший первым может передумать
        d.whistStage = 2;
        d.turn = first;
        return;
      }
      return resolveWhist(game);
    }
    // stage 2: ответ первого защитника на полвист
    if (ch === 'W') {
      d.whist[first] = 'W';
      d.whist[second] = 'P';
    }
    resolveWhist(game);
  }

  function resolveWhist(game) {
    const d = game.deal;
    const defs = d.whistOrder;
    const half = defs.find(x => d.whist[x] === 'H');
    if (half !== undefined) {
      return finishDeal(game, S.halfWhistEntries(d.declarer, d.level, half), 'half');
    }
    const W = defs.filter(x => d.whist[x] === 'W');
    if (W.length === 0) return finishDeal(game, S.passedEntries(d.declarer, d.level), 'passed');
    if (W.length === 1) {
      // одиночный вист — игра в открытую, вистующий играет за обоих
      const w = W[0];
      for (const x of defs) {
        d.controller[x] = w;
        d.openSeats[x] = true;
      }
    }
    startPlay(game);
  }

  // ---------- Розыгрыш ----------
  function startRaspasy(game) {
    const d = game.deal;
    game.raspasyStreak++;
    d.type = 'raspasy';
    d.mult = Math.min(game.raspasyStreak, 3);
    d.trump = null;
    startPlay(game);
  }

  function startPlay(game) {
    const d = game.deal;
    d.phase = 'play';
    d.turn = d.eldest; // первый ход всегда у первой руки
    d.trick = [];
    d.trickNo = 0;
  }

  // На распасах в первых двух взятках масть задаёт открытая карта прикупа
  function forcedSuit(d) {
    if (d.type === 'raspasy' && d.trickNo < 2) return C.suitOf(d.talon[d.trickNo]);
    return null;
  }

  function currentLeadSuit(d) {
    const f = forcedSuit(d);
    if (f !== null) return f;
    return d.trick.length ? C.suitOf(d.trick[0].card) : null;
  }

  function legalFor(d, seat) {
    if (d.phase !== 'play' || d.turn !== seat || d.pendingCollect) return [];
    return R.legalCards(d.hands[seat], currentLeadSuit(d), d.trump);
  }

  function playCard(game, seat, card) {
    const d = game.deal;
    if (!legalFor(d, seat).includes(card)) throw new Error('Так ходить нельзя');
    const lead = currentLeadSuit(d);
    d.hands[seat] = d.hands[seat].filter(c => c !== card);
    const s = C.suitOf(card);
    if (lead !== null && s !== lead) {
      d.voids[seat][lead] = true;
      if (d.trump !== null && s !== d.trump) d.voids[seat][d.trump] = true;
    }
    d.trick.push({ seat, card });
    d.played.push(card);
    if (d.trick.length === 3) {
      d.pendingCollect = true;
      d.trickWinner = R.trickWinner(d.trick, lead, d.trump);
      d.turn = -1;
    } else {
      d.turn = (seat + 1) % 3;
    }
  }

  function collectTrick(game) {
    const d = game.deal;
    if (!d.pendingCollect) return;
    const w = d.trickWinner;
    d.tricks[w]++;
    d.lastTrick = { cards: d.trick, winner: w };
    d.trick = [];
    d.trickNo++;
    d.pendingCollect = false;
    d.turn = w;
    // на мизере защитники открывают карты после первой взятки
    if (d.type === 'misere' && d.trickNo === 1) for (const x of others(d.declarer)) d.openSeats[x] = true;
    if (d.trickNo === 10) finishPlay(game);
  }

  function finishPlay(game) {
    const d = game.deal;
    let entries;
    if (d.type === 'raspasy') entries = S.raspasyEntries(d.tricks, d.mult);
    else if (d.type === 'misere') entries = S.misereEntries(d.declarer, d.tricks[d.declarer]);
    else {
      entries = S.gameEntries({
        declarer: d.declarer, level: d.level, declTricks: d.tricks[d.declarer],
        defenders: others(d.declarer), whist: d.whist, tricks: d.tricks,
      });
    }
    finishDeal(game, entries, 'played');
  }

  function describe(game, d, how) {
    const n = game.names;
    const lines = [];
    let title;
    if (d.type === 'raspasy') {
      title = `Распасы ×${d.mult}`;
      lines.push([0, 1, 2].map(p => `${n[p]}: ${d.tricks[p]}`).join(', '));
    } else if (d.type === 'misere') {
      const t = d.tricks[d.declarer];
      title = `${n[d.declarer]}: мизер — ${t === 0 ? 'чистый' : 'взяток ' + t}`;
    } else {
      const name = R.bidName(d.contract);
      const ws = d.whistOrder.map(x => `${n[x]} — ${{ W: 'вист', P: 'пас', H: 'полвист' }[d.whist[x]]}`).join(', ');
      if (how === 'passed') title = `${n[d.declarer]}: ${name} — без розыгрыша (оба паса)`;
      else if (how === 'half') title = `${n[d.declarer]}: ${name} — полвист`;
      else {
        const t = d.tricks[d.declarer];
        title = `${n[d.declarer]}: ${name} — ${t >= d.level ? 'сыграно' : 'недобор ' + (d.level - t)} (взяток ${t})`;
        lines.push('Взятки: ' + [0, 1, 2].map(p => `${n[p]} ${d.tricks[p]}`).join(', '));
      }
      lines.unshift(ws);
    }
    return { title, lines };
  }

  function finishDeal(game, entries, how) {
    const d = game.deal;
    const limit = game.settings.poolLimit;
    const applied = S.apply(game.score, entries, limit);
    if (d.type !== 'raspasy') game.raspasyStreak = 0;
    const desc = describe(game, d, how);
    d.result = { title: desc.title, lines: desc.lines, applied, how };
    d.phase = 'done';
    d.turn = -1;
    game.history.push({ no: d.no, title: desc.title, applied });
    if ([0, 1, 2].every(p => game.score.pool[p] >= limit)) {
      game.over = true;
      game.final = S.settle(game.score, limit);
    }
  }

  // Кто сейчас действует: seat — чьё место, actor — кто принимает решение
  function whoActs(game) {
    const d = game.deal;
    if (!d) return null;
    switch (d.phase) {
      case 'bidding': return { kind: 'bid', seat: d.turn, actor: d.turn };
      case 'discard': return { kind: 'discard', seat: d.declarer, actor: d.declarer };
      case 'contract': return { kind: 'contract', seat: d.declarer, actor: d.declarer };
      case 'whist': return { kind: 'whist', seat: d.turn, actor: d.turn };
      case 'play':
        if (d.pendingCollect) return { kind: 'collect', seat: -1, actor: -1 };
        return { kind: 'play', seat: d.turn, actor: d.controller[d.turn] };
      case 'done': return { kind: game.over ? 'over' : 'done', seat: -1, actor: -1 };
    }
    return null;
  }

  Pref.Engine = {
    DEFAULT_SETTINGS, NAMES, others,
    newGame, startDeal, nextDeal,
    legalBids, applyBid, applyDiscard, legalContracts, applyContract,
    whistOptions, applyWhist,
    currentLeadSuit, legalFor, playCard, collectTrick, whoActs,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
