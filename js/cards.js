// Колода: карта — число 0..31; масть = c >> 3 (0♠ 1♣ 2♦ 3♥), ранг = c & 7 (0=7 … 7=туз)
(function (root) {
  'use strict';
  const Pref = root.Pref || (root.Pref = {});

  const SUIT_SYM = ['♠', '♣', '♦', '♥'];
  const SUIT_NAMES = ['пики', 'трефы', 'бубны', 'червы'];
  const RANK_NAMES = ['7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];
  // Порядок мастей на руке: чередуем цвета
  const DISPLAY_SUIT_ORDER = [0, 2, 1, 3];

  const suitOf = c => c >> 3;
  const rankOf = c => c & 7;
  const makeCard = (s, r) => (s << 3) | r;

  function newDeck() {
    const d = [];
    for (let i = 0; i < 32; i++) d.push(i);
    return d;
  }

  function shuffle(a, rnd) {
    rnd = rnd || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sortHand(hand) {
    return hand.slice().sort((a, b) =>
      DISPLAY_SUIT_ORDER.indexOf(suitOf(a)) - DISPLAY_SUIT_ORDER.indexOf(suitOf(b)) || rankOf(b) - rankOf(a));
  }

  function cardName(c) {
    return RANK_NAMES[rankOf(c)] + SUIT_SYM[suitOf(c)];
  }

  // Детерминированный генератор для тестов
  function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  Pref.Cards = {
    SUIT_SYM, SUIT_NAMES, RANK_NAMES, DISPLAY_SUIT_ORDER,
    suitOf, rankOf, makeCard, newDeck, shuffle, sortHand, cardName, seededRandom,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
