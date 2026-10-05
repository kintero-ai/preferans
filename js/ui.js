// Отрисовка стола и диалогов
(function (root) {
  'use strict';
  const Pref = root.Pref;
  const C = Pref.Cards, R = Pref.Rules, E = Pref.Engine, S = Pref.Scoring;

  const $ = id => document.getElementById(id);
  let ctx = null;          // обработчики из main.js
  let game = null;
  let selected = [];       // выбранные для сноса карты
  let selKey = '';

  function h(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }

  const suitSpan = s => `<span class="suit-${s}">${C.SUIT_SYM[s]}</span>`;
  function bidHtml(i) {
    if (i === R.PASS || i == null) return 'Пас';
    const b = R.BIDS[i];
    if (b.misere) return 'Мизер';
    return b.level + (b.strain === R.NT ? 'БК' : suitSpan(b.strain));
  }

  function cardEl(c) {
    const s = C.suitOf(c);
    const el = h('div', 'card suit-' + s,
      `<span class="c-r">${C.RANK_NAMES[C.rankOf(c)]}</span><span class="c-s">${C.SUIT_SYM[s]}</span><span class="c-big">${C.SUIT_SYM[s]}</span>`);
    el.dataset.card = c;
    return el;
  }

  const backEl = () => h('div', 'card back');
  const nameOf = p => game.names[p];

  // ---------- Главный рендер ----------
  function render(g) {
    game = g;
    const d = g.deal;
    const act = E.whoActs(g);
    document.body.classList.toggle('four', !!g.settings.fourColor);
    const key = d.no + ':' + d.phase;
    if (key !== selKey) { selKey = key; selected = []; }
    renderTop(d);
    renderOpp(d, act, 1);
    renderOpp(d, act, 2);
    renderCenter(d, act);
    renderMe(d, act);
    renderHand(d, act);
  }

  function renderTop(d) {
    const parts = [`Сдача <b>${d.no}</b>`, d.dealer === 0 ? 'сдаёте вы' : `сдаёт ${nameOf(d.dealer)}`];
    if (d.type === 'raspasy') parts.push(`<b>распасы ×${d.mult}</b>`);
    else if (d.contract >= 0) parts.push(`<b>${nameOf(d.declarer)}: ${bidHtml(d.contract)}</b>`);
    else if (d.curBid >= 0) parts.push(`заявка ${bidHtml(d.curBid)}`);
    parts.push(`пуля до ${game.settings.poolLimit}`);
    $('dealInfo').innerHTML = parts.join(' · ');
  }

  function seatBadges(d, p) {
    const b = [];
    if (d.dealer === p) b.push('<span class="badge dim">сдаёт</span>');
    if (d.phase === 'bidding') {
      if (d.lastBid[p] != null) b.push(`<span class="badge">${bidHtml(d.lastBid[p])}</span>`);
    } else if (d.declarer === p) {
      b.push(`<span class="badge gold">${bidHtml(d.contract >= 0 ? d.contract : d.bid)}</span>`);
    } else if (d.whist[p]) {
      b.push(`<span class="badge">${{ W: 'вист', P: 'пас', H: 'полвист' }[d.whist[p]]}</span>`);
    }
    if (d.phase === 'play' || (d.phase === 'done' && d.result && d.result.how === 'played')) {
      b.push(`<span class="badge">взяток ${d.tricks[p]}</span>`);
    }
    return b.join('');
  }

  function renderOpp(d, act, p) {
    const el = $('seat' + p);
    el.classList.toggle('turn', !!act && act.seat === p);
    el.innerHTML = '';
    el.append(h('div', 'opp-head', `<span class="opp-name">${nameOf(p)}</span>${seatBadges(d, p)}`));
    const hand = d.hands[p];
    if (d.openSeats[p]) {
      const controllable = act && act.kind === 'play' && act.seat === p && act.actor === 0;
      const legal = controllable ? E.legalFor(d, p) : [];
      const box = h('div', 'open-hand');
      const sorted = C.sortHand(hand);
      for (const s of C.DISPLAY_SUIT_ORDER) {
        const cards = sorted.filter(c => C.suitOf(c) === s);
        if (!cards.length) continue;
        const row = h('div', 'suit-row', `<span class="sym suit-${s}">${C.SUIT_SYM[s]}</span>`);
        for (const c of cards) {
          const btn = h('button', 'chipcard suit-' + s, C.RANK_NAMES[C.rankOf(c)]);
          if (controllable) {
            if (legal.includes(c)) {
              btn.classList.add('playable');
              btn.onclick = () => ctx.onPlay(p, c);
            } else { btn.classList.add('dim'); btn.disabled = true; }
          } else btn.disabled = true;
          row.append(btn);
        }
        box.append(row);
      }
      el.append(box);
      if (controllable) el.append(h('div', 'opp-meta', 'Вы ходите за этого игрока'));
    } else {
      const backs = h('div', 'backs');
      for (let i = 0; i < hand.length; i++) backs.append(h('div', 'mback'));
      backs.append(h('span', 'cnt', hand.length ? '×' + hand.length : ''));
      el.append(backs);
    }
  }

  // ---------- Центр стола ----------
  function renderCenter(d, act) {
    const el = $('center');
    el.innerHTML = '';
    // прикуп
    const talon = h('div', 'slot slot-talon');
    if (d.phase === 'bidding') {
      const row = h('div', 'row');
      row.append(backEl(), backEl());
      talon.append(row, h('div', 'lbl', 'прикуп'));
    } else if (d.phase === 'discard') {
      const row = h('div', 'row');
      d.talon.forEach(c => row.append(cardEl(c)));
      talon.append(row, h('div', 'lbl', `прикуп — ${nameOf(d.declarer)}`));
    } else if (d.type === 'raspasy' && d.phase === 'play' && d.trickNo < 2) {
      const row = h('div', 'row');
      row.append(cardEl(d.talon[d.trickNo]));
      talon.append(row, h('div', 'lbl', 'масть хода'));
    }
    if (talon.childNodes.length) el.append(talon);

    // взятка
    for (const t of d.trick) {
      const slot = h('div', 'slot slot-' + t.seat);
      const c = cardEl(t.card);
      if (d.pendingCollect && d.trickWinner === t.seat) c.classList.add('win');
      slot.append(c);
      el.append(slot);
    }

    if (d.lastTrick && (d.phase === 'play' || d.phase === 'done')) {
      const b = h('button', 'last-btn', 'Последняя взятка');
      b.onclick = showLastTrick;
      el.append(b);
    }

    // заметка по центру, когда ждём ботов
    if (act && act.actor !== 0 && !d.trick.length) {
      if (d.phase === 'whist' || (d.phase === 'contract')) {
        const note = d.phase === 'whist'
          ? `${nameOf(d.declarer)} играет ${bidHtml(d.contract)}<small>${nameOf(act.seat)}: вист или пас?</small>`
          : `${nameOf(d.declarer)} назначает игру…`;
        el.append(h('div', 'big-note', note));
      }
    }

    const panel = actionPanel(d, act);
    if (panel) {
      const ov = h('div', 'overlay');
      ov.append(panel);
      el.append(ov);
    }
  }

  function actionPanel(d, act) {
    if (!act) return null;
    if (act.kind === 'done' || act.kind === 'over') return resultPanel(d);
    if (act.actor !== 0) return null;
    if (act.kind === 'bid') return bidPanel(d);
    if (act.kind === 'discard') return discardPanel(d);
    if (act.kind === 'contract') return contractPanel(d);
    if (act.kind === 'whist') return whistPanel(d, act.seat);
    return null;
  }

  function bidGrid(legal, onPick) {
    const set = new Set(legal);
    const games = legal.filter(b => b >= 0 && b !== R.MISERE);
    const grid = h('div', 'bgrid');
    if (!games.length) return null;
    const minLevel = Math.min(...games.map(b => R.BIDS[b].level));
    for (let L = minLevel; L <= 10; L++) {
      for (let s = 0; s <= 4; s++) {
        const i = R.bidIndex(L, s);
        const btn = h('button', 'bbtn', bidHtml(i));
        btn.disabled = !set.has(i);
        btn.onclick = () => onPick(i);
        grid.append(btn);
      }
    }
    return grid;
  }

  function bidPanel(d) {
    const legal = E.legalBids(d, 0);
    const p = h('div', 'panel');
    p.append(h('h3', '', 'Торговля'));
    const cur = d.curBid >= 0 ? `Заявка: ${bidHtml(d.curBid)} (${nameOf(d.curHolder)})` : 'Заявок ещё не было';
    const here = d.curBid >= 0 && legal.includes(d.curBid) ? ' · можно сказать «здесь»' : '';
    p.append(h('p', '', cur + here));
    const grid = bidGrid(legal, b => ctx.onBid(b));
    if (grid) p.append(grid);
    const row = h('div', 'brow');
    if (!d.hasBid[0] && d.misereBy !== 0) {
      const mis = h('button', 'abtn', 'Мизер');
      mis.disabled = !legal.includes(R.MISERE);
      mis.onclick = () => ctx.onBid(R.MISERE);
      row.append(mis);
    }
    const pass = h('button', 'abtn primary', 'Пас');
    pass.onclick = () => ctx.onBid(R.PASS);
    row.append(pass);
    p.append(row);
    return p;
  }

  function discardPanel(d) {
    const p = h('div', 'panel');
    p.append(h('h3', '', d.type === 'misere' ? 'Мизер: снос' : 'Снос'));
    p.append(h('p', '', 'Прикуп у вас (карты в золотой рамке). Выберите 2 карты для сноса.'));
    const row = h('div', 'brow');
    const btn = h('button', 'abtn primary', `Снести (${selected.length}/2)`);
    btn.disabled = selected.length !== 2;
    btn.onclick = () => ctx.onDiscard(selected.slice());
    row.append(btn);
    p.append(row);
    return p;
  }

  function contractPanel(d) {
    const p = h('div', 'panel');
    p.append(h('h3', '', 'Назначьте игру'));
    p.append(h('p', '', `Ваша заявка: ${bidHtml(d.bid)}. Можно назначить её или выше.`));
    p.append(bidGrid(E.legalContracts(d), c => ctx.onContract(c)));
    return p;
  }

  function whistPanel(d, seat) {
    const opts = E.whistOptions(d, seat);
    const p = h('div', 'panel');
    p.append(h('h3', '', `${nameOf(d.declarer)} играет ${bidHtml(d.contract)}`));
    let info = `Обязательство вистующих: ${R.OBLIGATION[d.level]} взятк${R.OBLIGATION[d.level] === 1 ? 'а' : 'и'} на двоих.`;
    if (d.whistStage === 1) {
      const f = d.whistOrder[0];
      info = `${nameOf(f)}: ${d.whist[f] === 'W' ? 'вист' : 'пас'}. ` + info;
      if (d.whist[f] === 'P') info += ' Если вистуете один — игра в открытую, вы ходите за обоих.';
    }
    if (d.whistStage === 2) info = `${nameOf(d.whistOrder[1])}: «полвист». Будете вистовать сами (в открытую)?`;
    p.append(h('p', '', info));
    const row = h('div', 'brow');
    const labels = { W: 'Вист', P: 'Пас', H: 'Полвист' };
    for (const o of opts) {
      const b = h('button', 'abtn' + (o === 'W' ? ' primary' : ''), labels[o]);
      b.onclick = () => ctx.onWhist(o);
      row.append(b);
    }
    p.append(row);
    return p;
  }

  // Сводка изменений счёта по игрокам
  function deltas(applied) {
    const res = [0, 1, 2].map(() => ({ pool: 0, mountain: 0, whists: 0 }));
    for (const e of applied) {
      if (e.kind === 'pool') res[e.p].pool += e.amount;
      else if (e.kind === 'mountain') res[e.p].mountain += e.amount;
      else if (e.kind === 'whist') res[e.p].whists += e.amount;
      else if (e.kind === 'help') { res[e.q].pool += e.amount; res[e.p].whists += e.amount * 10; }
    }
    return res;
  }

  const fmt = x => (Math.round(x * 100) / 100).toString().replace('.', ',');
  const signed = x => (x > 0 ? '+' : '') + fmt(x);

  function resultPanel(d) {
    const r = d.result;
    const p = h('div', 'panel');
    p.append(h('h3', '', r.title));
    for (const line of r.lines) p.append(h('p', '', line));
    const ds = deltas(r.applied);
    let rows = '';
    for (let i = 0; i < 3; i++) {
      const x = ds[i];
      rows += `<tr><td>${nameOf(i)}</td><td>${x.pool ? '+' + fmt(x.pool) : '—'}</td>` +
        `<td>${x.mountain ? signed(x.mountain) : '—'}</td><td>${x.whists ? '+' + fmt(x.whists) : '—'}</td></tr>`;
    }
    p.append(h('table', 'res-table', `<tr><th></th><th>Пуля</th><th>Гора</th><th>Висты</th></tr>${rows}`));
    if (game.over) {
      const row = h('div', 'brow');
      const b = h('button', 'abtn primary', 'Итоги партии');
      b.onclick = showFinal;
      row.append(b);
      p.append(row);
    } else {
      const row = h('div', 'brow');
      const s = h('button', 'abtn ghost', 'Пуля');
      s.onclick = showScore;
      const b = h('button', 'abtn primary', 'Дальше');
      b.onclick = () => ctx.onNext();
      row.append(s, b);
      p.append(row);
    }
    return p;
  }

  // Экран окончания партии
  function showFinal() {
    if (!game || !game.over) return;
    const bal = game.final.balance;
    const sc = game.score;
    const order = [0, 1, 2].sort((a, b) => bal[b] - bal[a]);
    const place = order.indexOf(0) + 1;
    const me = bal[0];
    const box = h('div', 'final');
    let title, cls;
    if (me > 0) { title = place === 1 ? '🏆 Вы выиграли!' : 'Вы в плюсе!'; cls = 'win'; }
    else if (me < 0) { title = 'Вы проиграли'; cls = 'lose'; }
    else { title = 'Ничья'; cls = ''; }
    box.append(h('div', 'final-title ' + cls, title));
    box.append(h('div', 'final-score ' + (me >= 0 ? 'plus' : 'minus'), `${signed(me)} ${vistWord(me)}`));
    box.append(h('p', 'final-sub', `${place}-е место из 3 · пуля до ${game.settings.poolLimit} · сдач: ${game.history.length}`));
    let rows = '';
    order.forEach((i, k) => {
      rows += `<tr${i === 0 ? ' class="me"' : ''}><td>${k + 1}. ${nameOf(i)}</td><td>${fmt(sc.pool[i])}</td>` +
        `<td>${fmt(sc.mountain[i])}</td><td class="${bal[i] >= 0 ? 'plus' : 'minus'}"><b>${signed(bal[i])}</b></td></tr>`;
    });
    box.append(h('table', 'res-table', `<tr><th>Игрок</th><th>Пуля</th><th>Гора</th><th>Итог</th></tr>${rows}`));
    box.append(h('p', 'final-sub', 'Итог — в вистах: горы выровнены и переведены в висты, висты сведены между игроками.'));
    const row = h('div', 'brow');
    const s = h('button', 'abtn ghost', 'Пуля');
    s.onclick = showScore;
    const b = h('button', 'abtn primary', 'Новая партия');
    b.onclick = () => { closeModal(); ctx.onNewGame(); };
    row.append(s, b);
    box.append(row);
    openModal(box);
  }

  function vistWord(x) {
    const n = Math.abs(x);
    if (n !== Math.floor(n)) return 'виста';
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'вист';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'виста';
    return 'вистов';
  }

  // ---------- Игрок ----------
  function statusText(d, act) {
    if (!act) return '';
    const n = nameOf(act.seat);
    switch (act.kind) {
      case 'bid': return act.actor === 0 ? 'Ваше слово' : `${n} торгуется…`;
      case 'discard': return act.actor === 0 ? 'Снесите 2 карты' : `${n} смотрит прикуп…`;
      case 'contract': return act.actor === 0 ? 'Назначьте игру' : `${n} назначает игру…`;
      case 'whist': return act.actor === 0 ? 'Вист или пас?' : `${n} думает над вистом…`;
      case 'play':
        if (act.actor === 0) return act.seat === 0 ? 'Ваш ход' : `Ваш ход за ${n}`;
        return act.seat === 0 ? `${nameOf(act.actor)} ходит за вас…` : `Ходит ${n}…`;
      case 'collect': return d.trickWinner === 0 ? 'Ваша взятка' : `Взятку берёт ${nameOf(d.trickWinner)}`;
      case 'done': return 'Сдача окончена';
      case 'over': return 'Партия окончена';
    }
    return '';
  }

  function renderMe(d, act) {
    const el = $('mebar');
    el.classList.toggle('turn', !!act && act.seat === 0);
    el.innerHTML = `<span class="opp-name">${nameOf(0)}</span>${seatBadges(d, 0)}<span class="status">${statusText(d, act)}</span>`;
  }

  function renderHand(d, act) {
    const el = $('hand');
    el.innerHTML = '';
    const canPlay = act && act.kind === 'play' && act.seat === 0 && act.actor === 0;
    const legal = canPlay ? E.legalFor(d, 0) : [];
    const discarding = act && act.kind === 'discard' && act.actor === 0;
    for (const c of C.sortHand(d.hands[0])) {
      const ce = cardEl(c);
      if (canPlay) ce.classList.add(legal.includes(c) ? 'playable' : 'dim');
      if (discarding) {
        ce.classList.add('playable');
        if (selected.includes(c)) ce.classList.add('sel');
        if (d.talon.includes(c)) ce.classList.add('fresh');
      }
      el.append(ce);
    }
    layoutHand();
  }

  // Перекрытие карт, чтобы рука помещалась по ширине
  function layoutHand() {
    const el = $('hand');
    const cards = el.querySelectorAll('.card');
    if (!cards.length) return;
    const cs = getComputedStyle(el);
    const W = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const cw = cards[0].offsetWidth;
    const n = cards.length;
    const step = n > 1 ? Math.min(cw * 0.8, (W - cw) / (n - 1)) : 0;
    cards.forEach((c, i) => { c.style.marginLeft = i ? (step - cw) + 'px' : '0'; });
  }

  function onHandClick(e) {
    const ce = e.target.closest('.card');
    if (!ce || !game) return;
    const c = Number(ce.dataset.card);
    const act = E.whoActs(game);
    if (!act || act.actor !== 0) return;
    if (act.kind === 'discard') {
      const i = selected.indexOf(c);
      if (i >= 0) selected.splice(i, 1);
      else {
        if (selected.length === 2) selected.shift();
        selected.push(c);
      }
      render(game);
    } else if (act.kind === 'play' && act.seat === 0 && E.legalFor(game.deal, 0).includes(c)) {
      ctx.onPlay(0, c);
    }
  }

  // ---------- Модальные окна ----------
  function openModal(content) {
    const box = $('modalBox');
    box.innerHTML = '';
    box.append(content);
    $('modal').classList.remove('hidden');
  }
  function closeModal() { $('modal').classList.add('hidden'); }

  function closeRow() {
    const row = h('div', 'brow');
    const b = h('button', 'abtn primary', 'Закрыть');
    b.onclick = closeModal;
    row.append(b);
    return row;
  }

  function showLastTrick() {
    const d = game.deal;
    if (!d.lastTrick) return;
    const box = h('div');
    box.append(h('h2', '', 'Последняя взятка'));
    const v = h('div', 'trick-view');
    for (const t of d.lastTrick.cards) {
      const f = h('figure', t.seat === d.lastTrick.winner ? 'win' : '');
      f.append(cardEl(t.card));
      f.append(h('figcaption', '', nameOf(t.seat)));
      v.append(f);
    }
    box.append(v, closeRow());
    openModal(box);
  }

  function showScore() {
    const sc = game.score;
    const lim = game.settings.poolLimit;
    const st = S.settle(sc, lim);
    const box = h('div');
    box.append(h('h2', '', `Пуля до ${lim}`));
    const th = [0, 1, 2].map(p => `<th>${nameOf(p)}</th>`).join('');
    const row = (label, f) => `<tr><td>${label}</td>${[0, 1, 2].map(p => `<td>${f(p)}</td>`).join('')}</tr>`;
    let html = `<tr><th></th>${th}</tr>`;
    html += row('Пуля', p => `<b>${fmt(sc.pool[p])}</b>`);
    html += row('Гора', p => fmt(sc.mountain[p]));
    for (let q = 0; q < 3; q++) html += row(`Висты на ${nameOf(q)}`, p => (p === q ? '—' : fmt(sc.whists[p][q])));
    html += row('Итог сейчас', p => `<span class="${st.balance[p] >= 0 ? 'plus' : 'minus'}">${signed(st.balance[p])}</span>`);
    box.append(h('table', 'res-table', html));
    box.append(h('p', 'rules', 'Записи пули: ' + [0, 1, 2].map(p => `${nameOf(p)} — ${sc.poolLog[p].join('.') || '0'}`).join('; ')));
    box.append(h('h4', '', 'Сдачи'));
    const ul = h('ul', 'history');
    for (const it of game.history.slice().reverse()) {
      const ds = deltas(it.applied);
      const parts = [];
      ds.forEach((x, p) => {
        const s = [];
        if (x.pool) s.push('пуля +' + fmt(x.pool));
        if (x.mountain) s.push('гора ' + signed(x.mountain));
        if (x.whists) s.push('висты +' + fmt(x.whists));
        if (s.length) parts.push(`${nameOf(p)}: ${s.join(', ')}`);
      });
      ul.append(h('li', '', `${it.no}. ${it.title}<br><span>${parts.join('; ')}</span>`));
    }
    box.append(ul, closeRow());
    openModal(box);
  }

  const RULES_HTML = `
    <p><b>Колода</b> 32 карты, каждому по 10, 2 — в прикуп. Ход по часовой стрелке: Вы → Запад → Восток.</p>
    <p><b>Торговля</b>: 6♠ &lt; 6♣ &lt; 6♦ &lt; 6♥ &lt; 6БК &lt; 7♠ … &lt; 8БК &lt; мизер &lt; 9♠ … 10БК. Спасовавший выбывает. Старшая рука может сказать «здесь» на ту же заявку. Мизер можно заявить только первым словом.</p>
    <p><b>Игра</b>: выигравший торговлю берёт прикуп (его видят все), сносит 2 карты и назначает игру не ниже заявки.</p>
    <p><b>Вист</b>: стоимость игр 6 — 2, 7 — 4, 8 — 6, 9 — 8, 10 — 10. Вистующие обязаны взять на двоих: на 6 — 4, на 7 — 2, на 8–10 — 1. Если вистует один — игра в открытую, вистующий ходит за обоих. На 6 второй защитник после паса первого может сказать «полвист»: игра не разыгрывается, он пишет висты за половину обязательства.</p>
    <p><b>Запись (Сочи)</b>: сыгранная игра идёт в пулю; недобор — стоимость × недобор в гору, а защитники пишут столько же вистов. Вистующие пишут висты за свои взятки; недобор обязательства — в гору вистующему.</p>
    <p><b>Мизер</b> — не взять ни одной взятки: 10 в пулю, иначе 10 в гору за каждую взятку. Карты защитников открываются после первой взятки.</p>
    <p><b>Распасы</b> — все спасовали: каждая взятка в гору, ноль взяток — очко в пулю. Первые две взятки масть хода задаёт карта прикупа. Цена подряд идущих распасов растёт 1-2-3.</p>
    <p><b>Конец</b>: когда пули всех достигли размера. Перебор пули помогает другим (висты 10 за очко). Горы выравниваются, каждая гора ×10/3 идёт вистами соперникам, затем висты сводятся в итог.</p>`;

  function showMenu() {
    const st = game.settings;
    const box = h('div');
    box.append(h('h2', '', 'Меню'));

    box.append(h('h4', '', 'Новая партия'));
    const lbl = h('label', '', 'Пуля до ');
    const sel = h('select');
    for (const v of [10, 20, 30, 50]) {
      const o = h('option', '', String(v));
      o.value = v;
      if (v === st.poolLimit) o.selected = true;
      sel.append(o);
    }
    lbl.append(sel);
    const ng = h('button', 'abtn primary', 'Начать новую партию');
    ng.onclick = () => {
      if (!game.over && game.history.length && !confirm('Текущая партия будет потеряна. Начать заново?')) return;
      closeModal();
      ctx.onNewGame({ poolLimit: Number(sel.value) });
    };
    box.append(lbl, ng);

    box.append(h('h4', '', 'Скорость соперников'));
    const seg = h('div', 'seg');
    for (const [k, t] of [['slow', 'Медленно'], ['normal', 'Обычно'], ['fast', 'Быстро']]) {
      const b = h('button', 'abtn' + (st.speed === k ? ' on' : ''), t);
      b.onclick = () => { ctx.onSettings({ speed: k }); showMenu(); };
      seg.append(b);
    }
    box.append(seg);

    const four = h('label', '');
    const cb = h('input');
    cb.type = 'checkbox';
    cb.checked = !!st.fourColor;
    cb.onchange = () => ctx.onSettings({ fourColor: cb.checked });
    four.append(cb, document.createTextNode('Четырёхцветная колода (♣ зелёные, ♦ синие)'));
    box.append(h('h4', '', 'Вид'), four);

    const det = h('details', 'rules');
    det.append(h('summary', '', '<b>Правила (Сочи)</b>'));
    det.append(h('div', '', RULES_HTML));
    box.append(h('h4', '', 'Справка'), det);
    box.append(closeRow());
    openModal(box);
  }

  function init(handlers) {
    ctx = handlers;
    $('hand').addEventListener('click', onHandClick);
    $('btnScore').onclick = () => game && showScore();
    $('btnMenu').onclick = () => game && showMenu();
    $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
    window.addEventListener('resize', layoutHand);
  }

  Pref.UI = { init, render, showFinal };
})(typeof globalThis !== 'undefined' ? globalThis : this);
