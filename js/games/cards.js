(() => {
  const { $, $$, sleep, state, registerGame, beep, confetti, titleBlock, setBusy, getWager, updateBalance, showResult } = window.Arcade;
  const { casinoCard, cardHtml, createCardElement, blackjackValue, freshDeck } = window.Arcade.cards;

  // ==========================================================
  // 1. HIGHER / LOWER
  // ==========================================================
  function randomCardVal() { return 2 + Math.floor(Math.random() * 13); }
  function cardText(v) { return v === 14 ? "A" : v === 13 ? "K" : v === 12 ? "Q" : v === 11 ? "J" : String(v); }
  function higherCashoutAmount(streak, w) {
    if (streak < 2) return 0;
    if (streak === 2) return w;
    return Math.max(2, Math.round(w * 2.5));
  }

  function renderHigher(a) {
    const pips = [0, 1, 2].map(i => `<i class="streak-pip ${i < state.higherStreak ? "active" : ""}"></i>`).join("");
    const w = getWager();
    const canCashout = state.higherStreak >= 2;
    const cashVal = canCashout ? higherCashoutAmount(state.higherStreak, w) : 0;

    a.innerHTML = `
      ${titleBlock("🃏 Higher / Lower", "Gæt højere eller lavere! Nå min. 2 i streg for Cash Out – eller 3/3 for 2.5× JACKPOT!")}
      <div class="streak-wrap">
        <div class="streak-label">STREAK</div>
        <div class="streak-pips">${pips}</div>
        <div class="streak-text">${state.higherStreak}/3 rigtige i træk</div>
      </div>
      <div class="card-stage" id="cardStage">
        <div class="play-card"><div class="front">${cardText(state.higherCard)}</div><div class="back"></div></div>
        <div class="play-card face-down" id="nextCard"><div class="front">?</div><div class="back"></div></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center;margin-bottom:8px">
        <button class="btn primary hlBtn" style="flex:1" data-choice="higher">⬆️ Højere</button>
        <button class="btn primary hlBtn" style="flex:1" data-choice="lower">⬇️ Lavere</button>
      </div>
      ${canCashout
        ? `<button class="big-button cashout-btn" id="hlCashoutBtn">💰 CASH UD NU (-${cashVal} POINT)</button>`
        : state.higherStreak === 1
          ? `<div style="text-align:center;font-size:11.5px;color:var(--muted);font-weight:800;margin-top:4px">🔒 Klar 1 mere (2/3) for at låse Cash Out op</div>`
          : ""}
      <div id="gameResult"></div>`;
    $$(".hlBtn").forEach(b => b.onclick = () => playHigher(b.dataset.choice));
    if (canCashout) $("#hlCashoutBtn").onclick = cashoutHigher;
  }

  function cashoutHigher() {
    if (state.busy || state.balance <= 0 || state.higherStreak < 2) return;
    const w = getWager();
    const cashVal = higherCashoutAmount(state.higherStreak, w);
    const streak = state.higherStreak;
    const actual = updateBalance(-cashVal, `Higher / Lower: cashede ud (${streak}/3).`);
    showResult(`💰 CASH OUT · ${streak} I STREG`, `Du tog gevinsten! ${Math.abs(actual)} point forsvandt fra puljen.`, "good");
    state.higherStreak = 0;
    state.higherCard = randomCardVal();
    renderHigher($("#arena"));
  }

  async function playHigher(choice) {
    if (state.busy || state.balance <= 0) return;
    const w = getWager();
    setBusy(true);
    let next = randomCardVal();
    while (next === state.higherCard) next = randomCardVal();

    const previous = state.higherCard;
    const el = $("#nextCard");
    el.querySelector(".front").textContent = cardText(next);
    el.classList.add("flip");
    beep(560, 0.08, 0.025);
    await sleep(700);

    const correct = (choice === "higher" && next > previous) || (choice === "lower" && next < previous);
    state.higherCard = next;

    if (correct) {
      state.higherStreak++;
      if (state.higherStreak >= 3) {
        const jack = Math.max(2, Math.round(w * 2.5));
        const actual = updateBalance(-jack, `Higher / Lower: 3 i streg! Jackpot.`);
        state.higherStreak = 0;
        showResult("🔥 3 I STREG JACKPOT!", `${cardText(previous)} → ${cardText(next)} var korrekt! 2.5× indsats fjernet: ${Math.abs(actual)} point forsvandt!`, "good");
        confetti();
      } else {
        const msg = state.higherStreak >= 2
          ? `${cardText(previous)} → ${cardText(next)}. Cash Out er nu låst op (-${higherCashoutAmount(state.higherStreak, w)} point) – eller gå efter 3/3!`
          : `${cardText(previous)} → ${cardText(next)}. Klar 1 rigtig mere (2/3) for at kunne cashe ud!`;
        showResult(`✅ KORREKT · ${state.higherStreak}/3`, msg, "good", { skipModal: true });
      }
    } else {
      const prevStreak = state.higherStreak;
      state.higherStreak = 0;
      const actual = updateBalance(w, `Higher / Lower: forkert gæt.`);
      showResult("❌ FORKERT GÆT", `${cardText(previous)} → ${cardText(next)} gik den anden vej. ${actual} point lagt oveni.${prevStreak > 0 ? " Streak nulstillet." : ""}`, "bad");
    }

    setBusy(false);
    await sleep(450);
    if (state.game === "higher" && !state.busy) renderHigher($("#arena"));
  }

  registerGame({
    id: "higher",
    name: "Higher / Lower",
    icon: "🃏",
    desc: "3D kort-streak",
    category: "cards",
    render: renderHigher
  });

  // ==========================================================
  // 2. BLACKJACK
  // ==========================================================
  let bjState = null;

  function renderBlackjack(a) {
    bjState = null;
    a.innerHTML = `
      ${titleBlock("🂡 Blackjack", "Slå huset mod 21. Sejr fjerner indsats. Natural 21 fjerner op til dobbelt indsats.")}
      <div class="casino-table" id="bjTable">
        <div class="hand-label">Huset</div>
        <div class="hand" id="dealerHand"><div class="muted" style="font-size:12px;align-self:center">Klar til deal</div></div>
        <div style="text-align:center"><span class="score-bubble" id="dealerScore">?</span></div>
        <div class="hand-label">Din hånd</div>
        <div class="hand" id="playerHand"></div>
        <div style="text-align:center"><span class="score-bubble" id="playerScore">0</span></div>
      </div>
      <button class="big-button" id="bjDeal">DEAL</button>
      <div id="bjControls" style="display:flex;gap:10px;justify-content:center;margin-top:10px"></div>
      <div id="gameResult"></div>`;
    $("#bjDeal").onclick = blackjackDeal;
  }

  async function blackjackRevealDealerHole() {
    if (!bjState || !bjState.dealer[1]) return;
    const hand = $("#dealerHand");
    const hole = hand && hand.children[1];
    if (!hole) return;
    hole.classList.add("revealed");
    beep(470, 0.06, 0.02);
    await sleep(340);
    $("#dealerScore").textContent = blackjackValue(bjState.dealer);
    await sleep(220);
  }

  async function blackjackDealerDrawCard() {
    if (!bjState) return;
    const card = casinoCard();
    bjState.dealer.push(card);
    $("#dealerHand").appendChild(createCardElement(card));
    $("#dealerScore").textContent = blackjackValue(bjState.dealer);
    beep(470, 0.05, 0.02);
    await sleep(420);
  }

  async function blackjackDeal() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager();
    setBusy(true);
    bjState = { w, player: [casinoCard(), casinoCard()], dealer: [casinoCard(), casinoCard()], resolving: false };
    $("#bjDeal").style.display = "none";

    const dHand = $("#dealerHand"), pHand = $("#playerHand");
    dHand.innerHTML = ""; pHand.innerHTML = "";
    $("#dealerScore").textContent = "?"; $("#playerScore").textContent = "0";

    pHand.appendChild(createCardElement(bjState.player[0]));
    $("#playerScore").textContent = bjState.player[0].value;
    beep(520, 0.04, 0.015); await sleep(170);

    dHand.appendChild(createCardElement(bjState.dealer[0]));
    $("#dealerScore").textContent = bjState.dealer[0].value;
    beep(560, 0.04, 0.015); await sleep(170);

    pHand.appendChild(createCardElement(bjState.player[1]));
    $("#playerScore").textContent = blackjackValue(bjState.player);
    beep(600, 0.04, 0.015); await sleep(170);

    dHand.appendChild(createCardElement(bjState.dealer[1], true));
    beep(640, 0.04, 0.015); await sleep(200);

    $("#bjControls").innerHTML = `<button class="btn primary" style="flex:1" id="bjHit">HIT</button><button class="btn" style="flex:1" id="bjStand">STAND</button>`;
    $("#bjHit").onclick = blackjackHit;
    $("#bjStand").onclick = blackjackStand;

    if (blackjackValue(bjState.player) === 21) await blackjackResolve(true);
  }

  async function blackjackHit() {
    if (!bjState || bjState.resolving) return;
    const card = casinoCard();
    bjState.player.push(card);
    $("#playerHand").appendChild(createCardElement(card));
    $("#playerScore").textContent = blackjackValue(bjState.player);
    beep(620, 0.05, 0.02);
    await sleep(320);
    if (blackjackValue(bjState.player) > 21) {
      bjState.resolving = true;
      await blackjackResolve(false);
    }
  }

  async function blackjackStand() {
    if (!bjState || bjState.resolving) return;
    bjState.resolving = true;
    $("#bjHit").disabled = true;
    $("#bjStand").disabled = true;
    await blackjackResolve(false);
  }

  async function blackjackResolve(natural = false) {
    if (!bjState) return;
    bjState.resolving = true;
    $("#bjControls").innerHTML = "";
    const pv = blackjackValue(bjState.player);

    await sleep(240);
    await blackjackRevealDealerHole();

    if (pv <= 21) {
      while (blackjackValue(bjState.dealer) < 17) {
        await sleep(320);
        await blackjackDealerDrawCard();
      }
    }

    const dv = blackjackValue(bjState.dealer);
    await sleep(250);

    let delta = 0, title = "", type = "", text = "";
    if (pv > 21) { delta = bjState.w; title = "Bust"; type = "bad"; text = "Du gik over 21."; }
    else if (natural && bjState.player.length === 2 && pv === 21) { delta = -2 * bjState.w; title = "Blackjack!"; type = "good"; text = "Natural 21."; }
    else if (dv > 21 || pv > dv) { delta = -bjState.w; title = "Du vinder"; type = "good"; text = `${pv} mod husets ${dv}.`; }
    else if (pv === dv) { delta = 0; title = "Push"; text = `Begge endte på ${pv}.`; }
    else { delta = bjState.w; title = "Huset vinder"; type = "bad"; text = `${pv} mod husets ${dv}.`; }

    const actual = updateBalance(delta, `Blackjack: ${title}.`);
    showResult(title, `${text} ${actual < 0 ? Math.abs(actual) + " point forsvandt." : actual > 0 ? actual + " point lagt oveni." : "Ingen ændring."}`, type);

    bjState = null;
    setBusy(false);
    if ($("#bjDeal")) {
      $("#bjDeal").style.display = "block";
      $("#bjDeal").textContent = "NY HÅND";
    }
  }

  registerGame({
    id: "blackjack",
    name: "Blackjack",
    icon: "🂡",
    desc: "Slå huset til 21",
    category: "cards",
    duel: true,
    render: renderBlackjack
  });

  // ==========================================================
  // 3. RED / BLACK
  // ==========================================================
  function renderRedBlack(a) {
    a.innerHTML = `
      ${titleBlock("♦️ Red / Black", "Gæt om et tilfældigt kort bliver rødt eller sort.")}
      <div class="quick-card-stage"><div class="quick-card" id="rbCard">?</div></div>
      <div class="bet-picks">
        <button class="btn bet-red rbPick" style="flex:1" data-rb="red">♥️ RØD</button>
        <button class="btn bet-black rbPick" style="flex:1" data-rb="black">♠️ SORT</button>
      </div>
      <div id="gameResult"></div>`;
    $$(".rbPick").forEach(b => b.onclick = () => playRedBlack(b.dataset.rb));
  }

  async function playRedBlack(choice) {
    if (state.busy || state.balance <= 0) return;
    const w = getWager(), c = casinoCard();
    setBusy(true);
    const el = $("#rbCard");
    el.className = "quick-card"; el.textContent = "?";
    await sleep(180);
    el.className = `quick-card ${c.red ? "red" : ""} reveal`;
    el.textContent = `${c.label}${c.suit}`;
    beep(690, 0.09, 0.03);
    await sleep(700);
    const win = (choice === "red") === c.red;
    const actual = updateBalance(win ? -w : w, `Red / Black: ${c.label}${c.suit}.`);
    showResult(c.red ? "RØDT KORT" : "SORT KORT",
      win ? `${Math.abs(actual)} point forsvandt.` : `${actual} point blev lagt oveni.`, win ? "good" : "bad");
    setBusy(false);
  }

  registerGame({
    id: "redblack",
    name: "Red / Black",
    icon: "♦️",
    desc: "Gæt kortets farve",
    category: "cards",
    duel: true,
    render: renderRedBlack
  });

  // ==========================================================
  // 4. WAR
  // ==========================================================
  function renderWar(a) {
    a.innerHTML = `
      ${titleBlock("⚔️ War", "Højeste kort vinder. Ved uafgjort opstår KRIG om 2× indsatsen!")}
      <div class="war-stage">
        <div class="war-side"><div class="hand-label">DIG</div><div id="warPlayer" class="hand"><div class="muted">?</div></div></div>
        <div class="war-side"><div class="hand-label">HUSET</div><div id="warDealer" class="hand"><div class="muted">?</div></div></div>
      </div>
      <div id="warExtra"></div>
      <button class="big-button" id="warBtn">TRÆK KORT</button>
      <div id="gameResult"></div>`;
    $("#warBtn").onclick = playWar;
  }

  async function playWar() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager(), p = casinoCard(), d = casinoCard();
    setBusy(true);
    $("#warExtra").innerHTML = "";
    $("#warPlayer").innerHTML = cardHtml(p); beep(560, 0.05, 0.02); await sleep(420);
    $("#warDealer").innerHTML = cardHtml(d); beep(620, 0.05, 0.02); await sleep(480);
    const pWar = p.rank === 1 ? 14 : p.rank;
    const dWar = d.rank === 1 ? 14 : d.rank;

    if (pWar === dWar) {
      beep(780, 0.15, 0.04);
      $("#warExtra").innerHTML = `<div class="war-banner">⚔️ KRIG ER ERKLÆRET! · 2× INDSATS</div>`;
      showResult("⚔️ KRIG ER ERKLÆRET!", "Lige kort! Brænder 3 kort og trækker krigskort...", "special", { skipModal: true });
      await sleep(1050);

      const pWarCard = casinoCard(), dWarCard = casinoCard();
      $("#warPlayer").innerHTML += `<span class="war-burn">🂠🂠🂠</span>` + cardHtml(pWarCard);
      beep(590, 0.05, 0.02); await sleep(450);
      $("#warDealer").innerHTML += `<span class="war-burn">🂠🂠🂠</span>` + cardHtml(dWarCard);
      beep(650, 0.05, 0.02); await sleep(480);

      const pw2 = pWarCard.rank === 1 ? 14 : pWarCard.rank;
      const dw2 = dWarCard.rank === 1 ? 14 : dWarCard.rank;
      if (pw2 >= dw2) {
        const actual = updateBalance(-2 * w, `War: Sejr i krig!`);
        showResult("🔥 SEJR I KRIG!", `Dit krigskort ${pWarCard.label}${pWarCard.suit} slog husets ${dWarCard.label}${dWarCard.suit}! ${Math.abs(actual)} point forsvandt!`, "good");
        confetti();
      } else {
        const actual = updateBalance(2 * w, `War: Tab i krig!`);
        showResult("💥 TAB I KRIG!", `Husets krigskort ${dWarCard.label}${dWarCard.suit} slog dit ${pWarCard.label}${pWarCard.suit}! ${actual} point lagt oveni.`, "bad");
      }
      setBusy(false);
      return;
    }

    const win = pWar > dWar;
    const actual = updateBalance(win ? -w : w, `War: ${p.label} mod ${d.label}.`);
    showResult(win ? "DU VINDER" : "HUSET VINDER",
      `${p.label}${p.suit} mod ${d.label}${d.suit}. ${actual < 0 ? Math.abs(actual) + " point forsvandt." : actual + " point lagt oveni."}`, win ? "good" : "bad");
    setBusy(false);
  }

  registerGame({
    id: "war",
    name: "War",
    icon: "⚔️",
    desc: "Højeste kort vinder",
    category: "cards",
    duel: true,
    render: renderWar
  });

  // ==========================================================
  // 5. BACCARAT LITE
  // ==========================================================
  let baccaratPick = "player";
  function baccaratTotal(cards) {
    return cards.reduce((s, c) => s + (c.rank >= 10 ? 0 : c.rank === 1 ? 1 : c.rank), 0) % 10;
  }

  function renderBaccarat(a) {
    a.innerHTML = `
      ${titleBlock("🎴 Baccarat Lite", "Vælg Player eller Banker. Højeste total (mod 10) vinder.")}
      <div class="baccarat-board">
        <div class="baccarat-side"><strong>PLAYER</strong><div class="hand" id="bacPlayer"></div><div class="score-bubble" id="bacPS">?</div></div>
        <div class="baccarat-side"><strong>BANKER</strong><div class="hand" id="bacBanker"></div><div class="score-bubble" id="bacBS">?</div></div>
      </div>
      <div class="bet-picks">
        <button class="btn bet-pick bacPick ${baccaratPick === "player" ? "active" : ""}" style="flex:1" data-bac="player">PLAYER</button>
        <button class="btn bet-pick bacPick ${baccaratPick === "banker" ? "active" : ""}" style="flex:1" data-bac="banker">BANKER</button>
      </div>
      <button class="big-button" id="bacBtn">DEAL</button>
      <div id="gameResult"></div>`;
    $$(".bacPick").forEach(b => b.onclick = () => {
      baccaratPick = b.dataset.bac;
      $$(".bacPick").forEach(x => x.classList.toggle("active", x === b));
    });
    $("#bacBtn").onclick = playBaccarat;
  }

  async function playBaccarat() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager(), p = [casinoCard(), casinoCard()], b = [casinoCard(), casinoCard()];
    setBusy(true);
    $("#bacPlayer").innerHTML = cardHtml(p[0]); $("#bacBanker").innerHTML = cardHtml(b[0]); beep(520, 0.04, 0.018);
    await sleep(320);
    $("#bacPlayer").innerHTML += cardHtml(p[1]); $("#bacBanker").innerHTML += cardHtml(b[1]); beep(610, 0.04, 0.018);
    const pt = baccaratTotal(p), bt = baccaratTotal(b);
    $("#bacPS").textContent = pt; $("#bacBS").textContent = bt;
    await sleep(420);
    if (pt === bt) {
      updateBalance(0, `Baccarat: tie ${pt}-${bt}.`);
      showResult("TIE", `${pt} mod ${bt}. Ingen ændring.`, "special");
    } else {
      const winner = pt > bt ? "player" : "banker";
      const win = winner === baccaratPick;
      const actual = updateBalance(win ? -w : w, `Baccarat: ${winner} vandt ${pt}-${bt}.`);
      showResult(`${winner === "player" ? "PLAYER" : "BANKER"} VINDER`,
        `${pt} mod ${bt}. ${win ? Math.abs(actual) + " point forsvandt." : actual + " point lagt oveni."}`, win ? "good" : "bad");
    }
    setBusy(false);
  }

  registerGame({
    id: "baccarat",
    name: "Baccarat Lite",
    icon: "🎴",
    desc: "Player eller Banker",
    category: "cards",
    render: renderBaccarat
  });

  // ==========================================================
  // 6. POKER DRAW
  // ==========================================================
  function pokerRank(cards) {
    const vals = cards.map(c => (c.rank === 1 ? 14 : c.rank)).sort((a, b) => a - b);
    const counts = {}; vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    const groups = Object.values(counts).sort((a, b) => b - a);
    const flush = cards.every(c => c.suit === cards[0].suit);
    const unique = [...new Set(vals)];
    let straight = unique.length === 5 && unique[4] - unique[0] === 4;
    if (JSON.stringify(unique) === "[2,3,4,5,14]") straight = true;
    if (straight && flush) return { name: "Straight Flush", mult: 4 };
    if (groups[0] === 4) return { name: "Four of a Kind", mult: 4 };
    if (groups[0] === 3 && groups[1] === 2) return { name: "Full House", mult: 3 };
    if (flush) return { name: "Flush", mult: 3 };
    if (straight) return { name: "Straight", mult: 3 };
    if (groups[0] === 3) return { name: "Three of a Kind", mult: 2 };
    if (groups[0] === 2 && groups[1] === 2) return { name: "Two Pair", mult: 1.5 };
    if (groups[0] === 2) {
      const pairVal = Number(Object.keys(counts).find(k => counts[k] === 2));
      if (pairVal >= 11) return { name: "Jacks or Better", mult: 1 };
      return { name: "Low Pair", mult: 0 };
    }
    return { name: "High Card", mult: -1 };
  }

  let pokerState = null;

  function renderPoker(a) {
    pokerState = null;
    a.innerHTML = `
      ${titleBlock("🃏 Poker Draw", "Jacks or Better: Par i J–A eller 2+ par vinder! Lavt par (2–10) er Push.")}
      <div class="poker-hand" id="pokerHand">
        ${Array.from({ length: 5 }, () => `<div class="poker-card-wrap"><div class="mini-card hidden-card">?</div></div>`).join("")}
      </div>
      <div id="pokerPrompt" style="text-align:center;font-weight:900;color:var(--muted);font-size:12px;margin:8px auto">Tryk på knappen for at deale 5 kort.</div>
      <button class="big-button" id="pokerBtn">DEAL 5 KORT</button>
      <div id="gameResult"></div>`;
    $("#pokerBtn").onclick = startPokerDeal;
  }

  async function startPokerDeal() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager(), deck = freshDeck(), cards = deck.slice(0, 5);
    setBusy(true);
    pokerState = { deck, cards, held: [false, false, false, false, false], phase: "hold", wager: w };

    const hand = $("#pokerHand"); hand.innerHTML = "";
    for (let i = 0; i < 5; i++) {
      hand.innerHTML += `<div class="poker-card-wrap" data-idx="${i}">${cardHtml(cards[i])}<span class="hold-badge" id="holdBadge-${i}">SKIFT</span></div>`;
      beep(500 + i * 35, 0.035, 0.015); await sleep(130);
    }

    const rankCounts = {};
    cards.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
    cards.forEach((c, i) => {
      const pVal = c.rank === 1 ? 14 : c.rank;
      if (rankCounts[c.rank] >= 3 || (rankCounts[c.rank] === 2 && pVal >= 11)) {
        pokerState.held[i] = true;
      }
    });
    updatePokerHeldUI();

    $$(".poker-card-wrap").forEach(wrap => {
      wrap.onclick = () => {
        if (pokerState && pokerState.phase === "hold" && !state.busy) {
          const idx = +wrap.dataset.idx;
          pokerState.held[idx] = !pokerState.held[idx];
          updatePokerHeldUI();
          beep(600 + idx * 40, 0.03, 0.01);
        }
      };
    });

    $("#pokerPrompt").textContent = "Tap kort du vil BEHOLDE, og tryk TRÆK NYE KORT:";
    const btn = $("#pokerBtn");
    btn.textContent = "TRÆK NYE KORT 🔄";
    btn.onclick = drawPoker;
    setBusy(false);
  }

  function updatePokerHeldUI() {
    if (!pokerState) return;
    pokerState.held.forEach((isHeld, i) => {
      const wrap = document.querySelector(`.poker-card-wrap[data-idx="${i}"]`);
      const badge = $(`#holdBadge-${i}`);
      if (wrap && badge) {
        wrap.classList.toggle("held", isHeld);
        badge.textContent = isHeld ? "BEHOLD" : "SKIFT";
      }
    });
  }

  async function drawPoker() {
    if (state.busy || state.balance <= 0 || !pokerState || pokerState.phase !== "hold") return;
    setBusy(true);
    pokerState.phase = "done";
    const w = pokerState.wager;

    let nextDeckIdx = 5;
    for (let i = 0; i < 5; i++) {
      if (!pokerState.held[i]) {
        const newCard = pokerState.deck[nextDeckIdx++];
        pokerState.cards[i] = newCard;
        const wrap = document.querySelector(`.poker-card-wrap[data-idx="${i}"]`);
        if (wrap) {
          wrap.innerHTML = `${cardHtml(newCard)}<span class="hold-badge">NYT</span>`;
          beep(580 + i * 30, 0.035, 0.014);
          await sleep(140);
        }
      }
    }

    const rank = pokerRank(pokerState.cards);
    let delta = w, title = "", type = "";
    if (rank.name === "High Card") { delta = w; title = "HIGH CARD · TAB"; type = "bad"; }
    else if (rank.name === "Low Pair") { delta = 0; title = "➖ LAVT PAR (2–10) · PUSH"; type = "special"; }
    else if (rank.name === "Jacks or Better") { delta = -w; title = "✅ PAR I J–A · GEVINST!"; type = "good"; }
    else if (rank.name === "Two Pair") { delta = -Math.max(1, Math.round(w * 1.5)); title = "✨ TO PAR"; type = "good"; confetti(); }
    else if (rank.name === "Three of a Kind") { delta = -2 * w; title = "🔥 TRE ENS!"; type = "good"; confetti(); }
    else if (rank.name === "Straight" || rank.name === "Flush" || rank.name === "Full House") { delta = -3 * w; title = `🏆 ${rank.name.toUpperCase()}!`; type = "good"; confetti(); }
    else { delta = -4 * w; title = `👑 ${rank.name.toUpperCase()} · JACKPOT!`; type = "good"; confetti(); }

    const actual = updateBalance(delta, `Poker Draw: ${rank.name}.`);
    showResult(title, actual < 0 ? `${Math.abs(actual)} point forsvandt!` : actual > 0 ? `${actual} point lagt oveni.` : "Lavt par giver Push (0 ændring).", type);
    $("#pokerPrompt").textContent = `Resultat: ${rank.name}.`;
    const btn = $("#pokerBtn");
    btn.textContent = "DEAL IGEN";
    btn.onclick = () => renderPoker($("#arena"));
    setBusy(false);
  }

  registerGame({
    id: "poker",
    name: "Poker Draw",
    icon: "🃏",
    desc: "Video Poker med Hold",
    category: "cards",
    render: renderPoker
  });

  // ==========================================================
  // 7. ROYAL DRAW (QUEEN)
  // ==========================================================
  function renderQueen(a) {
    a.innerHTML = `
      ${titleBlock("👑 Royal Draw", "Træk ét kort! Queen giver 2× Jackpot, K/A giver fuld indsats, Jack halv.")}
      <div class="royal-stage">
        <div class="royal-deck"></div>
        <div class="royal-draw-card" id="royalCard">
          <div class="royal-face royal-front" id="royalFront">?</div>
          <div class="royal-face royal-back"></div>
        </div>
      </div>
      <div class="royal-odds">
        <div><strong>QUEEN</strong>2× Jackpot</div>
        <div><strong>K / A</strong>1× Gevinst</div>
        <div><strong>JACK</strong>½× Gevinst</div>
        <div><strong>10</strong>Push (0)</div>
        <div><strong>2–9</strong>½× Straf</div>
      </div>
      <button class="big-button" id="royalBtn">TRÆK KORT</button>
      <div id="gameResult"></div>`;
    $("#royalBtn").onclick = playQueen;
  }

  async function playQueen() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager(), card = casinoCard();
    setBusy(true);
    const el = $("#royalCard"), front = $("#royalFront");
    front.className = `royal-face royal-front ${card.red ? "red" : ""}`;
    front.textContent = `${card.label}${card.suit}`;
    el.classList.remove("draw"); void el.offsetWidth; el.classList.add("draw");

    for (let i = 0; i < 7; i++) { beep(430 + i * 42, 0.035, 0.014); await sleep(150); }
    await sleep(480);

    let delta = 0, title = "", type = "", detail = "";
    if (card.rank === 12) { delta = -2 * w; title = `👑 QUEEN JACKPOT · ${card.label}${card.suit}`; type = "good"; detail = "Queen er topresultatet."; confetti(); }
    else if (card.rank === 13 || card.rank === 1) { delta = -w; title = `✨ ROYAL HIT · ${card.label}${card.suit}`; type = "good"; detail = "King eller Ace giver fuld indsats."; }
    else if (card.rank === 11) { delta = -Math.max(1, Math.ceil(w / 2)); title = `✅ JACK · ${card.label}${card.suit}`; type = "good"; detail = "Jack giver mindre gevinst."; }
    else if (card.rank === 10) { delta = 0; title = "10 · PUSH"; type = "special"; detail = "Ingen ændring i puljen."; }
    else { delta = Math.max(1, Math.ceil(w / 2)); title = `${card.label}${card.suit} · MISS`; type = "bad"; detail = "Almindeligt kort giver halv straf."; }

    const actual = updateBalance(delta, `Royal Draw: ${card.label}${card.suit}.`);
    showResult(title, `${detail} ${actual < 0 ? Math.abs(actual) + " point forsvandt." : actual > 0 ? actual + " point lagt oveni." : ""}`, type);
    setBusy(false);
  }

  registerGame({
    id: "queen",
    name: "Royal Draw",
    icon: "👑",
    desc: "Træk ét kongeligt kort",
    category: "cards",
    render: renderQueen
  });
})();
