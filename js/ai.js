// Боты: оценка руки, торговля, снос, вист и розыгрыш (Монте-Карло по раскладам, согласованным с тем, что видно боту)
(function (root) {
  'use strict';
  const Pref = root.Pref || (root.Pref = {});
  const C = Pref.Cards, R = Pref.Rules, E = Pref.Engine;
  const { suitOf, rankOf } = C;

  // ---------- Оценка руки ----------
  function bySuit(hand) {
    const s = [[], [], [], []];
    for (const c of hand) s[suitOf(c)].push(rankOf(c));
    for (const a of s) a.sort((x, y) => y - x);
    return s;
  }

  // Взятки на старших картах масти (ranks по убыванию)
  function honorTricks(ranks) {
    const n = ranks.length;
    if (!n) return 0;
    let t = 0;
    for (const r of ranks) {
      let out = 0;
      for (let x = r + 1; x < 8; x++) if (!ranks.includes(x)) out++;
      if (out === 0) t += 1;
      else if (out === 1 && n >= 2) t += 0.5;
      else if (out === 2 && n >= 3) t += 0.25;
    }
    return Math.min(t, n);
  }

  function trumpTricks(ranks) {
    const n = ranks.length;
    if (!n) return 0;
    const t = honorTricks(ranks);
    if (n <= 3) return t;
    let lost = 0;
    for (const r of [7, 6, 5]) if (!ranks.includes(r)) lost++;
    return Math.max(t, n - Math.min(lost, n) - (n === 4 ? 0.5 : 0));
  }

  // Ожидаемое число взяток играющего в масти strain (4 — без козыря)
  function handTricks(hand, strain) {
    const s = bySuit(hand);
    let t = 0;
    if (strain === R.NT) {
      let unstopped = 0;
      for (let k = 0; k < 4; k++) {
        const r = s[k];
        const h = honorTricks(r);
        t += h;
        if (r.length >= 5 && h >= 1.5) t += (r.length - 4) * 0.8;
        const stop = r[0] === 7 || (r.includes(6) && r.length >= 2) || (r.includes(5) && r.length >= 3);
        if (!stop) unstopped++;
      }
      return t - unstopped * 0.7;
    }
    for (let k = 0; k < 4; k++) {
      if (k === strain) t += trumpTricks(s[k]);
      else t += Math.min(honorTricks(s[k]), 2.5);
    }
    const tn = s[strain].length;
    if (tn <= 2) t -= 1.5;
    else if (tn === 3) t -= 0.5;
    const spare = Math.max(0, tn - 3);
    let shortv = 0;
    for (let k = 0; k < 4; k++) {
      if (k === strain) continue;
      if (s[k].length === 0) shortv += 1.2;
      else if (s[k].length === 1 && s[k][0] !== 7) shortv += 0.6;
    }
    return t + Math.min(spare, shortv) * 0.7;
  }

  // Риск мизера: карты, которые нельзя «прикрыть» младшими (i-я снизу карта должна быть не выше 2i-го ранга)
  function misereStats(hand) {
    const s = bySuit(hand);
    let risk = 0, count = 0;
    for (let k = 0; k < 4; k++) {
      const a = s[k].slice().sort((x, y) => x - y);
      for (let i = 0; i < a.length; i++) {
        if (a[i] > 2 * i) { count++; risk += 1 + (a[i] - 2 * i) * 0.15; }
      }
    }
    return { risk, count };
  }

  // Взятки защитника против козыря trump (null — без козыря)
  function defenseTricks(hand, trump) {
    const s = bySuit(hand);
    let t = 0;
    for (let k = 0; k < 4; k++) {
      if (trump !== null && k === trump) t += honorTricks(s[k]) + Math.max(0, s[k].length - 3) * 0.6;
      else {
        let h = honorTricks(s[k]);
        if (trump !== null) h = Math.min(h, s[k].length >= 5 ? 1 : 2);
        t += h;
      }
    }
    return t;
  }

  // ---------- Решения ----------
  function chooseBid(game, p) {
    const d = game.deal;
    const legal = E.legalBids(d, p);
    const hand = d.hands[p];
    let maxIdx = -1;
    for (let s = 0; s <= 4; s++) {
      const est = handTricks(hand, s) + 0.9; // прикуп обычно немного помогает
      const L = Math.min(10, Math.floor(est + 0.15));
      if (L >= 6) maxIdx = Math.max(maxIdx, R.bidIndex(L, s));
    }
    if (legal.includes(R.MISERE) && maxIdx < R.bidIndex(8, 0)) {
      const m = misereStats(hand);
      if (m.count === 0 || (m.count === 1 && m.risk < 1.5)) return R.MISERE;
    }
    const options = legal.filter(b => b !== R.PASS && b !== R.MISERE && b <= maxIdx);
    return options.length ? Math.min(...options) : R.PASS;
  }

  function minLevelFor(bid, strain) {
    for (let L = 6; L <= 10; L++) if (R.bidIndex(L, strain) >= bid) return L;
    return 0;
  }

  // Лучшая игра для руки из 10 карт при заявке bid
  function bestContract(hand, bid) {
    let best = null;
    for (let s = 0; s <= 4; s++) {
      const minL = minLevelFor(bid, s);
      if (!minL) continue;
      const e = handTricks(hand, s);
      let L = minL;
      while (L < 10 && e - 0.4 >= L + 1) L++;
      const margin = e - L;
      const score = margin >= 0 ? 100 + L * 3 + margin : margin * 10 - L;
      if (!best || score > best.score) best = { score, contract: R.bidIndex(L, s) };
    }
    return best;
  }

  function chooseDiscard(game, p) {
    const d = game.deal;
    const hand = d.hands[p];
    let best = null;
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        const rest = hand.filter((_, k) => k !== i && k !== j);
        let score;
        if (d.bid === R.MISERE) {
          const m = misereStats(rest);
          score = -(m.risk * 10 + m.count);
        } else {
          score = bestContract(rest, d.bid).score;
        }
        if (!best || score > best.score) best = { score, discard: [hand[i], hand[j]] };
      }
    }
    return best.discard;
  }

  function chooseContract(game, p) {
    const d = game.deal;
    return bestContract(d.hands[p], d.bid).contract;
  }

  const WHIST_TH = { // [при висте партнёра / первым, в одиночку, полвист]
    6: [1.5, 2.6, 1.1], 7: [1.0, 1.8, 99], 8: [0.7, 1.1, 99], 9: [0.6, 1.0, 99], 10: [0.5, 0.9, 99],
  };

  function chooseWhist(game, p) {
    const d = game.deal;
    const opts = E.whistOptions(d, p);
    const est = defenseTricks(d.hands[p], d.trump);
    const th = WHIST_TH[d.level];
    if (d.whistStage === 0) return est >= th[0] ? 'W' : 'P';
    if (d.whistStage === 1) {
      const partner = d.whist[d.whistOrder[0]];
      if (partner === 'W') return est >= th[0] ? 'W' : 'P';
      if (est >= th[1]) return 'W';
      if (opts.includes('H') && est >= th[2]) return 'H';
      return 'P';
    }
    return est >= th[1] ? 'W' : 'P';
  }

  // ---------- Розыгрыш ----------
  // Что известно actor: свои/подконтрольные/открытые руки, сыгранные карты, прикуп
  function buildKnowledge(d, actor) {
    const knownSeat = [0, 1, 2].map(s => s === actor || d.controller[s] === actor || d.openSeats[s]);
    const seen = new Uint8Array(32);
    for (const c of d.played) seen[c] = 1;
    for (let s = 0; s < 3; s++) if (knownSeat[s]) for (const c of d.hands[s]) seen[c] = 1;
    let extra = 0;
    const talonLock = new Uint8Array(32);
    if (d.type === 'raspasy') {
      d.talon.forEach((c, i) => { if (i <= d.trickNo) seen[c] = 1; else extra++; });
    } else if (actor === d.declarer) {
      for (const c of d.discards) seen[c] = 1;
    } else {
      extra = d.discards.length;
      // прикуп видели все: эти карты у играющего или в сносе
      for (const c of d.talon) if (!seen[c]) talonLock[c] = 1;
    }
    const unknown = [];
    for (let c = 0; c < 32; c++) if (!seen[c]) unknown.push(c);
    const slots = [];
    for (let s = 0; s < 3; s++) if (!knownSeat[s]) slots.push({ seat: s, size: d.hands[s].length });
    if (extra) slots.push({ seat: -1, size: extra });
    return { knownSeat, unknown, slots, talonLock };
  }

  function sampleWorld(d, know, rnd) {
    const { unknown, slots, talonLock } = know;
    const allowed = (slot, c) => {
      if (slot.seat < 0) return true;
      if (d.voids[slot.seat][suitOf(c)]) return false;
      if (talonLock[c] && slot.seat !== d.declarer) return false;
      return true;
    };
    const nAllowed = {};
    for (const c of unknown) nAllowed[c] = slots.filter(sl => allowed(sl, c)).length;
    let out = null;
    for (let attempt = 0; attempt < 25 && !out; attempt++) {
      const cards = C.shuffle(unknown.slice(), rnd).sort((a, b) => nAllowed[a] - nAllowed[b]);
      const cap = slots.map(s => s.size);
      const res = slots.map(() => []);
      let ok = true;
      for (const c of cards) {
        let tot = 0;
        for (let i = 0; i < slots.length; i++) if (cap[i] > 0 && allowed(slots[i], c)) tot += cap[i];
        if (!tot) { ok = false; break; }
        let r = rnd() * tot, pick = -1;
        for (let i = 0; i < slots.length; i++) {
          if (cap[i] > 0 && allowed(slots[i], c)) {
            pick = i;
            r -= cap[i];
            if (r < 0) break;
          }
        }
        res[pick].push(c);
        cap[pick]--;
      }
      if (ok) out = res;
    }
    if (!out) { // противоречия — раздаём без ограничений
      const cards = C.shuffle(unknown.slice(), rnd);
      out = slots.map(() => []);
      let k = 0;
      slots.forEach((s, i) => { for (let j = 0; j < s.size; j++) out[i].push(cards[k++]); });
    }
    return [0, 1, 2].map(s => know.knownSeat[s] ? d.hands[s].slice() : out[slots.findIndex(sl => sl.seat === s)]);
  }

  function makeSim(d, hands) {
    const played = new Uint8Array(32);
    for (const c of d.played) played[c] = 1;
    return {
      hands, played,
      trick: d.trick.map(t => ({ seat: t.seat, card: t.card })),
      turn: d.turn, trickNo: d.trickNo, tricks: d.tricks.slice(),
      trump: d.trump, type: d.type, declarer: d.declarer, talon: d.talon,
    };
  }

  function simLead(sim) {
    if (sim.type === 'raspasy' && sim.trickNo < 2) return suitOf(sim.talon[sim.trickNo]);
    return sim.trick.length ? suitOf(sim.trick[0].card) : null;
  }

  function simPlay(sim, seat, card) {
    const lead = simLead(sim);
    const h = sim.hands[seat];
    h.splice(h.indexOf(card), 1);
    sim.played[card] = 1;
    sim.trick.push({ seat, card });
    if (sim.trick.length === 3) {
      const w = R.trickWinner(sim.trick, lead, sim.trump);
      sim.tricks[w]++;
      sim.trick = [];
      sim.trickNo++;
      sim.turn = w;
    } else sim.turn = (seat + 1) % 3;
  }

  function isMaster(sim, c, hand) {
    const s = suitOf(c);
    for (let r = rankOf(c) + 1; r < 8; r++) {
      const x = (s << 3) | r;
      if (!sim.played[x] && !hand.includes(x)) return false;
    }
    return true;
  }

  const lowest = cards => cards.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
  const highest = cards => cards.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));

  function wouldWin(sim, lead, seat, c) {
    return R.trickWinner(sim.trick.concat({ seat, card: c }), lead, sim.trump) === seat;
  }

  // Быстрая политика для доигрыша
  function policy(sim, seat) {
    const hand = sim.hands[seat];
    const lead = simLead(sim);
    const legal = R.legalCards(hand, lead, sim.trump);
    if (legal.length === 1) return legal[0];

    if (sim.type === 'raspasy' || (sim.type === 'misere' && seat === sim.declarer)) {
      // избегаем взяток
      if (!sim.trick.length) return lowest(legal);
      const safe = legal.filter(c => !wouldWin(sim, lead, seat, c));
      return highest(safe.length ? safe : legal);
    }
    if (sim.type === 'misere') {
      // защитники мизера: подсовывают играющему
      const decl = sim.declarer;
      if (!sim.trick.length) {
        const dh = sim.hands[decl];
        let best = null;
        for (const c of legal) {
          const ds = dh.filter(x => suitOf(x) === suitOf(c));
          if (ds.length && rankOf(c) < rankOf(lowest(ds)) && (!best || rankOf(c) < rankOf(best))) best = c;
        }
        return best != null ? best : lowest(legal);
      }
      const w = R.trickWinner(sim.trick, lead, sim.trump);
      if (w === decl) {
        const under = legal.filter(c => !wouldWin(sim, lead, seat, c));
        if (under.length) return highest(under);
      }
      return lowest(legal);
    }

    // обычная игра
    const team = s => (s === sim.declarer ? 0 : 1);
    const cheap = cards => {
      const nonTrump = cards.filter(c => suitOf(c) !== sim.trump);
      return lowest(nonTrump.length ? nonTrump : cards);
    };
    if (!sim.trick.length) {
      const masters = legal.filter(c => isMaster(sim, c, hand));
      if (seat === sim.declarer && sim.trump !== null) {
        const trumps = legal.filter(c => suitOf(c) === sim.trump);
        const oppTrumps = [0, 1, 2].some(s => s !== seat && sim.hands[s].some(c => suitOf(c) === sim.trump));
        if (trumps.length && oppTrumps) {
          const mt = trumps.filter(c => masters.includes(c));
          if (mt.length) return highest(mt);
        }
      }
      if (masters.length) {
        const side = masters.filter(c => suitOf(c) !== sim.trump);
        return highest(side.length ? side : masters);
      }
      const counts = [0, 0, 0, 0];
      for (const c of legal) counts[suitOf(c)]++;
      const nonTrump = legal.filter(c => suitOf(c) !== sim.trump);
      const pool = nonTrump.length ? nonTrump : legal;
      let best = pool[0];
      for (const c of pool) {
        if (counts[suitOf(c)] > counts[suitOf(best)] ||
            (counts[suitOf(c)] === counts[suitOf(best)] && rankOf(c) < rankOf(best))) best = c;
      }
      return best;
    }
    const w = R.trickWinner(sim.trick, lead, sim.trump);
    const last = sim.trick.length === 2;
    if (team(w) === team(seat) && w !== seat) return cheap(legal); // взятка у партнёра
    const winners = legal.filter(c => wouldWin(sim, lead, seat, c));
    if (winners.length) {
      if (last) return lowest(winners);
      const safe = winners.filter(c => isMaster(sim, c, hand));
      return safe.length ? lowest(safe) : highest(winners);
    }
    return cheap(legal);
  }

  function utility(sim, d, seat) {
    const t = sim.tricks;
    if (d.type === 'raspasy') return -t[seat] + (t[seat] === 0 ? 1.5 : 0);
    const td = t[d.declarer];
    let u;
    if (d.type === 'misere') u = td === 0 ? 10 : -3 * td;
    else u = td + (td >= d.level ? 8 : -(d.level - td) * 2);
    return seat === d.declarer ? u : -u;
  }

  function chooseCard(game, seat, opts) {
    opts = opts || {};
    const d = game.deal;
    const legal = E.legalFor(d, seat);
    if (legal.length <= 1) return legal[0];
    const rnd = opts.rnd || Math.random;
    const samples = opts.samples || 40;
    const budget = opts.timeMs || 150;
    const know = buildKnowledge(d, d.controller[seat]);
    const totals = legal.map(() => 0);
    const t0 = Date.now();
    for (let k = 0; k < samples; k++) {
      const hands = sampleWorld(d, know, rnd);
      for (let i = 0; i < legal.length; i++) {
        const sim = makeSim(d, hands.map(h => h.slice()));
        simPlay(sim, seat, legal[i]);
        while (sim.trickNo < 10) simPlay(sim, sim.turn, policy(sim, sim.turn));
        totals[i] += utility(sim, d, seat);
      }
      if (k >= 5 && Date.now() - t0 > budget) break;
    }
    let bi = 0;
    for (let i = 1; i < legal.length; i++) {
      if (totals[i] > totals[bi] + 1e-9 ||
          (Math.abs(totals[i] - totals[bi]) < 1e-9 && rankOf(legal[i]) < rankOf(legal[bi]))) bi = i;
    }
    return legal[bi];
  }

  Pref.AI = {
    handTricks, misereStats, defenseTricks,
    chooseBid, chooseDiscard, chooseContract, chooseWhist, chooseCard,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
