// Лестница заявок, стоимость игр, правила хода и взятки
(function (root) {
  'use strict';
  const Pref = root.Pref || (root.Pref = {});
  const { suitOf, rankOf } = Pref.Cards;

  const NT = 4; // без козыря
  const PASS = -1;
  const STRAIN_SYM = ['♠', '♣', '♦', '♥', 'БК'];

  // Заявка — индекс в BIDS: 6♠ … 8БК, мизер, 9♠ … 10БК
  const BIDS = [];
  for (let level = 6; level <= 10; level++) {
    for (let strain = 0; strain <= 4; strain++) {
      if (level === 9 && strain === 0) BIDS.push({ level: 0, strain: -1, misere: true });
      BIDS.push({ level, strain, misere: false });
    }
  }
  const MISERE = BIDS.findIndex(b => b.misere);

  const VALUE = { 6: 2, 7: 4, 8: 6, 9: 8, 10: 10 };
  const MISERE_VALUE = 10;
  // Сколько взяток на двоих обязаны взять вистующие (Сочи)
  const OBLIGATION = { 6: 4, 7: 2, 8: 1, 9: 1, 10: 1 };

  function bidIndex(level, strain) {
    return BIDS.findIndex(b => !b.misere && b.level === level && b.strain === strain);
  }

  function bidName(i) {
    if (i === PASS || i == null) return 'Пас';
    const b = BIDS[i];
    return b.misere ? 'Мизер' : b.level + STRAIN_SYM[b.strain];
  }

  // Допустимые карты: в масть, иначе козырем, иначе любая
  function legalCards(hand, leadSuit, trump) {
    if (leadSuit == null) return hand.slice();
    const follow = hand.filter(c => suitOf(c) === leadSuit);
    if (follow.length) return follow;
    if (trump != null) {
      const trumps = hand.filter(c => suitOf(c) === trump);
      if (trumps.length) return trumps;
    }
    return hand.slice();
  }

  // trick: [{seat, card}]; возвращает место, чья карта старшая (работает и для неполной взятки)
  function trickWinner(trick, leadSuit, trump) {
    if (!trick.length) return -1;
    if (leadSuit == null) leadSuit = suitOf(trick[0].card);
    const key = (c, lead) => {
      const s = suitOf(c);
      if (trump != null && s === trump) return 100 + rankOf(c);
      if (s === lead) return 50 + rankOf(c);
      return -1;
    };
    let lead = leadSuit;
    // На распасах масть задаёт карта прикупа; если её никто не дал — старшая в масти первого хода
    if (trick.every(t => key(t.card, lead) < 0)) lead = suitOf(trick[0].card);
    let best = trick[0];
    for (const t of trick) if (key(t.card, lead) > key(best.card, lead)) best = t;
    return best.seat;
  }

  Pref.Rules = {
    NT, PASS, STRAIN_SYM, BIDS, MISERE, VALUE, MISERE_VALUE, OBLIGATION,
    bidIndex, bidName, legalCards, trickWinner,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
