// Запуск игры: цикл ходов ботов, действия человека, сохранение
(function () {
  'use strict';
  const { Engine: E, AI, UI } = window.Pref;

  const SAVE_KEY = 'preferans.save.v1';
  const SETTINGS_KEY = 'preferans.settings.v1';
  const SPEED = {
    slow: { bot: 1200, collect: 1500 },
    normal: { bot: 700, collect: 1000 },
    fast: { bot: 300, collect: 550 },
  };

  let game = null;
  let timer = null;

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ }
  }

  function schedule(fn, ms) {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(); }, ms);
  }

  function step() {
    UI.render(game);
    writeJSON(SAVE_KEY, game);
    const a = E.whoActs(game);
    if (!a) return;
    const sp = SPEED[game.settings.speed] || SPEED.normal;
    if (a.kind === 'collect') return schedule(() => { E.collectTrick(game); step(); }, sp.collect);
    if (a.kind === 'done' || a.kind === 'over' || a.actor === 0) return;
    const delay = a.kind === 'discard' ? sp.bot * 2.5 : sp.bot;
    schedule(() => { botAct(a); step(); }, delay);
  }

  function botAct(a) {
    const s = a.seat;
    switch (a.kind) {
      case 'bid': E.applyBid(game, s, AI.chooseBid(game, s)); break;
      case 'discard': E.applyDiscard(game, AI.chooseDiscard(game, s)); break;
      case 'contract': E.applyContract(game, AI.chooseContract(game, s)); break;
      case 'whist': E.applyWhist(game, s, AI.chooseWhist(game, s)); break;
      case 'play': E.playCard(game, s, AI.chooseCard(game, s)); break;
    }
  }

  // Действия человека
  function human(fn) {
    return (...args) => {
      if (timer) return; // ждём анимацию/бота
      try { fn(...args); } catch (e) { console.warn(e); return; }
      step();
    };
  }

  const handlers = {
    onBid: human(b => E.applyBid(game, 0, b)),
    onDiscard: human(cards => E.applyDiscard(game, cards)),
    onContract: human(c => E.applyContract(game, c)),
    onWhist: human(ch => E.applyWhist(game, game.deal.turn, ch)),
    onPlay: human((seat, card) => {
      const a = E.whoActs(game);
      if (a.kind !== 'play' || a.actor !== 0 || a.seat !== seat) throw new Error('Не ваш ход');
      E.playCard(game, seat, card);
    }),
    onNext: human(() => E.nextDeal(game)),
    onNewGame: (patch) => {
      clearTimeout(timer);
      timer = null;
      const settings = Object.assign({}, game ? game.settings : readJSON(SETTINGS_KEY), patch || {});
      writeJSON(SETTINGS_KEY, settings);
      game = E.newGame(settings);
      step();
    },
    onSettings: (patch) => {
      Object.assign(game.settings, patch);
      writeJSON(SETTINGS_KEY, game.settings);
      UI.render(game);
      writeJSON(SAVE_KEY, game);
    },
  };

  function start() {
    UI.init(handlers);
    const saved = readJSON(SAVE_KEY);
    if (saved && saved.v === 1 && saved.deal && !saved.over) {
      game = saved;
      step();
    } else {
      handlers.onNewGame();
    }
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  start();
})();
