(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const registry = new Map();
  const categories = [
    { id: "all", label: "Alle" },
    { id: "wheel_cases", label: "🎡 Hjul & Cases" },
    { id: "cards", label: "🃏 Kortspil" },
    { id: "dice", label: "🎲 Terninger" },
    { id: "arcade", label: "⚡ Risiko & Arkade" }
  ];

  const state = {
    balance: 0,
    initialStakeCap: 0,
    desiredWager: 1,
    game: "wheel",
    activeCategory: "all",
    activeView: "arena",
    busy: false,
    debtBusted: false,
    roundEnding: false,
    lastBalanceDelta: 0,
    pendingGiveAmount: 0,
    pendingGiveTransferDone: false,
    history: [],
    // Persistent game state
    wheelRotation: 0,
    higherCard: 2 + Math.floor(Math.random() * 13),
    higherStreak: 0,
    outcomeModalTimer: null,
    zeroOverlayTimer: null,
    debtBustTimer: null
  };

  function beep(freq = 440, dur = 0.04, vol = 0.025) {
    try {
      const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = freq;
      g.gain.value = vol;
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.stop(ctx.currentTime + dur);
    } catch (e) {}
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function confetti() {
    for (let i = 0; i < 24; i++) {
      const p = document.createElement("i");
      p.className = "particle";
      p.style.left = (42 + Math.random() * 16) + "vw";
      p.style.top = (36 + Math.random() * 10) + "vh";
      p.style.background = ["#ffc857", "#45d483", "#5ea1ff", "#a578ff", "#eb63cf"][Math.floor(Math.random() * 5)];
      p.style.setProperty("--x", (Math.random() * 340 - 170) + "px");
      p.style.setProperty("--y", (Math.random() * 260 - 70) + "px");
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1150);
    }
  }

  function feedback(type) {
    const f = $("#flash");
    if (f) {
      f.className = `flash ${type} go`;
      setTimeout(() => { f.className = "flash"; }, 480);
    }
    if (type === "good") {
      confetti();
      vibrate([30, 40, 30]);
    } else {
      const target = $("#viewArena") || $("#arena");
      if (target) {
        target.classList.remove("shake");
        void target.offsetWidth;
        target.classList.add("shake");
      }
      vibrate(80);
    }
  }

  function titleBlock(title, desc) {
    return `<div class="arena-title"><h2>${title}</h2><p>${desc}</p></div>`;
  }

  function setBusy(v) {
    state.busy = v || state.debtBusted || state.roundEnding;
    const locked = state.busy;
    $$(".game-tab").forEach(x => { x.disabled = locked; });
    $$(".nav-tab").forEach(x => { x.disabled = locked; });
    if ($("#wagerMinus")) $("#wagerMinus").disabled = locked;
    if ($("#wagerPlus")) $("#wagerPlus").disabled = locked;
    if ($("#maxBtn")) $("#maxBtn").disabled = locked;
    if ($("#wager")) $("#wager").disabled = locked;
    if ($("#newRoundBtn")) $("#newRoundBtn").disabled = locked;
    if ($("#takeBtn")) $("#takeBtn").disabled = locked;
  }

  function getMinWager() {
    if (window.Arcade && Arcade.modes && typeof Arcade.modes.getMinWager === "function") {
      return Arcade.modes.getMinWager(state.balance);
    }
    return 1;
  }

  function getBustLimit() {
    if (window.Arcade && Arcade.modes && typeof Arcade.modes.getBustLimit === "function") {
      return Arcade.modes.getBustLimit();
    }
    return 11;
  }

  function syncWagerUI() {
    const inp = $("#wager");
    const minEl = $("#wagerRuleHint");
    const isQuickDuel = window.Arcade && Arcade.modes && Arcade.modes.state.mode === "duel" && Arcade.modes.state.duelSubMode === "quick";
    if (!isQuickDuel && state.balance <= 0) {
      if (inp) inp.value = 0;
      return;
    }
    const maxW = isQuickDuel ? 10 : Math.max(1, state.balance);
    const minW = isQuickDuel ? 1 : Math.min(state.balance, Math.max(1, getMinWager()));
    state.desiredWager = clamp(state.desiredWager || 1, minW, maxW);
    if (inp) {
      inp.min = minW;
      inp.max = maxW;
      inp.value = state.desiredWager;
    }
    if (minEl) {
      if (isQuickDuel) {
        minEl.textContent = "Tårer i duel";
      } else if (minW === maxW && state.balance > 1 && Arcade.modes && Arcade.modes.state.mode === "chaos") {
        minEl.textContent = `Tvungen MAX: ${maxW}`;
      } else if (minW > 1) {
        minEl.textContent = `Min ${minW} · Max ${maxW}`;
      } else {
        minEl.textContent = `Max ${maxW}`;
      }
    }
  }

  function getWager() {
    const isQuickDuel = window.Arcade && Arcade.modes && Arcade.modes.state.mode === "duel" && Arcade.modes.state.duelSubMode === "quick";
    if (!isQuickDuel && state.balance <= 0) return 0;
    syncWagerUI();
    return state.desiredWager;
  }

  function updateDebtUI() {
    const hud = $("#phoneHud");
    const vig = $("#debtVignette");
    const isQuickDuel = window.Arcade && Arcade.modes && Arcade.modes.state.mode === "duel" && Arcade.modes.state.duelSubMode === "quick";
    const bustAt = getBustLimit();
    if (isQuickDuel) {
      if ($("#hudPoolVal")) $("#hudPoolVal").textContent = "⚔️";
      if ($("#hudPoolLimit")) $("#hudPoolLimit").textContent = "Hurtig";
      if ($("#debtMeterFill")) $("#debtMeterFill").style.width = "50%";
      if (hud) hud.classList.remove("caution", "danger", "critical", "busted");
      if (vig) vig.classList.remove("caution", "danger", "critical");
      if (window.Arcade && Arcade.modes && typeof Arcade.modes.renderHudExtras === "function") {
        Arcade.modes.renderHudExtras();
      }
      return;
    }
    if ($("#hudPoolVal")) $("#hudPoolVal").textContent = state.balance;
    if ($("#hudPoolLimit")) $("#hudPoolLimit").textContent = `/ ${bustAt}`;

    const fill = $("#debtMeterFill");
    if (fill) {
      fill.style.width = clamp((state.balance / bustAt) * 100, 0, 100) + "%";
    }

    if (hud) hud.classList.remove("caution", "danger", "critical", "busted");
    if (vig) vig.classList.remove("caution", "danger", "critical");

    if (state.balance >= bustAt) {
      if (hud) hud.classList.add("busted");
      if (vig) vig.classList.add("critical");
    } else if (state.balance === bustAt - 1) {
      if (hud) hud.classList.add("critical");
      if (vig) vig.classList.add("critical");
    } else if (state.balance === bustAt - 2) {
      if (hud) hud.classList.add("danger");
      if (vig) vig.classList.add("danger");
    } else if (state.balance >= Math.max(4, bustAt - 4)) {
      if (hud) hud.classList.add("caution");
      if (vig) vig.classList.add("caution");
    }

    if (window.Arcade && Arcade.modes && typeof Arcade.modes.renderHudExtras === "function") {
      Arcade.modes.renderHudExtras();
    }
  }

  function pushHistory(text) {
    if (!text) return;
    state.history.unshift(text);
    if (state.history.length > 25) state.history.pop();
    const lastEl = $("#lastAction");
    if (lastEl) lastEl.textContent = text;
  }

  function updateBalance(rawDelta, reason = "", feedbackMode = "auto", zeroDelay = null, opts = {}) {
    const modes = window.Arcade && Arcade.modes;
    const delta = modes && typeof modes.transformDelta === "function"
      ? modes.transformDelta(rawDelta, state.balance)
      : rawDelta;

    const before = state.balance;
    state.balance = clamp(state.balance + delta, 0, 99);
    const actual = state.balance - before;
    state.lastBalanceDelta = actual;

    // Reset/track Party transfer rewards (e.g. Give Sips / Give Shot)
    state.pendingGiveAmount = opts.giveAmount || 0;
    state.pendingGiveLabel = opts.giveLabel || "";
    state.pendingGiveTransferDone = false;

    const bustAt = getBustLimit();
    updateDebtUI();
    syncWagerUI();

    const c = $("#balanceChange");
    if (c) {
      c.textContent = (actual > 0 ? "+" : "") + actual;
      c.style.color = actual < 0 ? "var(--green)" : actual > 0 ? "var(--red)" : "var(--muted)";
      c.classList.remove("fly");
      void c.offsetWidth;
      c.classList.add("fly");
    }

    if (reason) pushHistory(reason);
    if (feedbackMode === "auto") {
      if (actual < 0) feedback("good");
      if (actual > 0) feedback("bad");
    }

    if (actual > 0 && state.balance >= bustAt - 2 && state.balance < bustAt) {
      setTimeout(() => beep(state.balance === bustAt - 1 ? 190 : 235, 0.11, 0.028), 160);
      vibrate(state.balance === bustAt - 1 ? [45, 45, 80] : [35, 45, 35]);
    }

    if (modes && typeof modes.syncCurrentPlayerPool === "function") {
      modes.syncCurrentPlayerPool(state.balance);
    }

    if (state.balance >= bustAt) {
      state.debtBusted = true;
      setBusy(true);
      updateDebtUI();
      if (zeroDelay !== null && zeroDelay >= 0) {
        clearTimeout(state.debtBustTimer);
        state.debtBustTimer = setTimeout(() => {
          $("#debtBustAmount").textContent = state.balance;
          $("#debtOverlay").classList.add("show");
          beep(145, 0.28, 0.055);
        }, zeroDelay);
      }
    } else if (state.balance === 0) {
      state.roundEnding = true;
      setBusy(false);
      const arena = $("#arena");
      if (arena) arena.classList.add("round-ending");
      if (zeroDelay !== null && zeroDelay >= 0) {
        clearTimeout(state.zeroOverlayTimer);
        state.zeroOverlayTimer = setTimeout(() => {
          $("#zeroOverlay").classList.add("show");
        }, zeroDelay);
      }
    }

    return actual;
  }

  function showResult(title, text, type = "", meta = {}) {
    const el = $("#gameResult");
    if (el) {
      el.className = `result ${type}`;
      el.innerHTML = `<strong>${title}</strong><p>${text}</p>`;
      void el.offsetWidth;
      el.classList.add("show");
    }

    if (meta.skipModal || state.game === "case") return;

    clearTimeout(state.outcomeModalTimer);
    state.outcomeModalTimer = setTimeout(() => {
      showOutcomeModal({ title, text, type, ...meta });
    }, 400);
  }

  function renderTransferBox(containerEl) {
    if (!containerEl) return;
    const modes = window.Arcade && Arcade.modes;
    if (!modes || !modes.canTransferSips() || !state.pendingGiveAmount) {
      containerEl.classList.add("hidden");
      containerEl.innerHTML = "";
      return;
    }

    const targets = modes.getTransferTargets();
    if (!targets.length) {
      containerEl.classList.add("hidden");
      containerEl.innerHTML = "";
      return;
    }

    const amt = state.pendingGiveAmount;
    const lbl = state.pendingGiveLabel || `${amt} tårer`;
    containerEl.classList.remove("hidden");
    containerEl.innerHTML = `
      <div class="transfer-title">🎁 Overfør ${lbl} (+${amt} point) til en medspiller:</div>
      <div class="transfer-targets">
        ${targets.map(p => `<button class="transfer-btn" data-pid="${p.id}">+ ${amt} til ${p.name} (${p.balance})</button>`).join("")}
      </div>
    `;
    containerEl.querySelectorAll(".transfer-btn").forEach(btn => {
      btn.onclick = () => {
        if (state.pendingGiveTransferDone) return;
        state.pendingGiveTransferDone = true;
        const targetPlayer = modes.transferPointsToPlayer(+btn.dataset.pid, amt);
        if (targetPlayer) {
          btn.classList.add("sent");
          btn.textContent = `✓ Sendt til ${targetPlayer.name} (nu ${targetPlayer.balance})`;
          containerEl.querySelectorAll(".transfer-btn").forEach(b => { b.disabled = true; });
          beep(760, 0.08, 0.03);
        }
      };
    });
  }

  function showOutcomeModal(cfg = {}) {
    const modal = $("#outcomeModal");
    if (!modal) return;

    const gInfo = registry.get(state.game) || { name: "Arcade Spil", icon: "🎲" };
    const type = cfg.type || (state.lastBalanceDelta < 0 ? "good" : state.lastBalanceDelta > 0 ? "bad" : "special");
    const delta = typeof cfg.delta === "number" ? cfg.delta : state.lastBalanceDelta;
    const modes = window.Arcade && Arcade.modes;
    const modeInfo = modes ? modes.getModeOutcomeConfig() : { mode: "classic" };

    let color = "#ffc857";
    let badgeText = cfg.badge || "";
    let headlineText = cfg.headline || "";

    if (state.balance === 0) {
      color = "#45d483";
      badgeText = badgeText || "🏆 PULJE RAMTE 0!";
      headlineText = headlineText || "DU ER I 0 TÅRER!";
    } else if (state.debtBusted) {
      color = "#ff6475";
      badgeText = badgeText || "💀 GÆLDSGRÆNSE NÅET!";
      headlineText = headlineText || `PULJEN RAMTE ${state.balance} POINT`;
    } else if (type === "good") {
      color = "#45d483";
      badgeText = badgeText || "🎉 VUNDET!";
      if (!headlineText) {
        headlineText = delta < 0 ? `🛡️ ${Math.abs(delta)} POINT REDDET` : "🛡️ GEVINST!";
      }
    } else if (type === "bad") {
      color = "#ff6475";
      badgeText = badgeText || "💀 TABT";
      if (!headlineText) {
        headlineText = delta > 0 ? `📈 +${delta} POINT TIL PULJEN` : "📈 STRAF TIL PULJEN";
      }
    } else {
      color = "#ffc857";
      badgeText = badgeText || "🤝 UAFGJORT / SPECIAL";
      headlineText = headlineText || "➖ INGEN POINT-ÆNDRING";
    }

    const card = $("#outcomeModalCard");
    if (card) card.style.setProperty("--outcome-color", color);

    $("#outcomeBadge").textContent = badgeText;
    $("#outcomeIcon").textContent = cfg.icon || gInfo.icon;
    $("#outcomeTitle").textContent = cfg.title || "Udfald";
    $("#outcomeGameSub").textContent = modeInfo.playerLabel ? `${gInfo.name} · ${modeInfo.playerLabel}` : gInfo.name;
    $("#outcomeHeadline").textContent = headlineText;
    $("#outcomeHeadline").style.color = color;
    $("#outcomeDesc").textContent = cfg.text || "";

    const extraRuleEl = $("#outcomeExtraRule");
    if (cfg.extraRule || modeInfo.extraNote) {
      extraRuleEl.textContent = cfg.extraRule || modeInfo.extraNote;
      extraRuleEl.style.display = "block";
    } else {
      extraRuleEl.style.display = "none";
    }

    renderTransferBox($("#outcomeTransferBox"));

    $("#outcomePoolVal").textContent = `${state.balance} tårer`;
    const changeEl = $("#outcomeChangeVal");
    changeEl.textContent = `${delta > 0 ? "+" : ""}${delta} tårer`;
    changeEl.style.color = delta < 0 ? "var(--green)" : delta > 0 ? "var(--red)" : "#fff";

    const mainBtn = $("#outcomeMainBtn");
    const switchBtn = $("#outcomeSwitchBtn");
    mainBtn.onclick = () => dismissOutcomeModal("stay");
    switchBtn.onclick = () => dismissOutcomeModal("switch");

    if (modeInfo.isPartyOrChaosNext) {
      mainBtn.innerHTML = modeInfo.nextBtnText;
      mainBtn.className = state.debtBusted ? "btn bad outcome-modal-btn" : "btn primary outcome-modal-btn";
      switchBtn.style.display = modeInfo.showSwitch ? "block" : "none";
      if (modeInfo.showSwitch) switchBtn.innerHTML = "VÆLG ET ANDET SPIL 🎮";
    } else if (state.balance === 0) {
      mainBtn.innerHTML = "🏆 DU VANDT RUNDEN! SE VINDERSKÆRM ➔";
      mainBtn.className = "btn primary outcome-modal-btn";
      switchBtn.style.display = "none";
    } else if (state.debtBusted) {
      mainBtn.innerHTML = "💀 GÆLDSGRÆNSE NÅET · CASHOUT ➔";
      mainBtn.className = "btn bad outcome-modal-btn";
      switchBtn.style.display = "none";
    } else {
      mainBtn.innerHTML = "SPIL IGEN ↺";
      mainBtn.className = "btn primary outcome-modal-btn";
      switchBtn.style.display = "block";
      switchBtn.innerHTML = "VÆLG ET ANDET SPIL 🎮";
    }

    if (state.balance === 0) { beep(920, 0.22, 0.05); confetti(); }
    else if (state.debtBusted) { beep(150, 0.25, 0.05); }
    else if (type === "good") { beep(840, 0.09, 0.025); }
    else if (type === "bad") { beep(230, 0.12, 0.035); }
    else { beep(560, 0.08, 0.025); }

    modal.classList.add("show");
  }

  function dismissOutcomeModal(action = "stay") {
    const modal = $("#outcomeModal");
    if (modal) modal.classList.remove("show");

    const modes = window.Arcade && Arcade.modes;
    if (modes && modes.handleAfterOutcome(action)) {
      return;
    }

    if (state.balance === 0) {
      $("#zeroOverlay").classList.add("show");
      beep(780, 0.25, 0.05);
    } else if (state.debtBusted) {
      $("#debtBustAmount").textContent = state.balance;
      $("#debtOverlay").classList.add("show");
      beep(145, 0.28, 0.055);
    } else {
      setBusy(false);
      if (action === "switch" && window.Arcade && Arcade.app) {
        Arcade.app.switchView("games");
      }
    }
  }

  function registerGame(def) {
    registry.set(def.id, def);
  }

  // Shared card and dice utilities
  const suits = ["♠", "♥", "♦", "♣"];

  function casinoCard() {
    const rank = 1 + Math.floor(Math.random() * 13);
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const value = rank === 1 ? 11 : Math.min(rank, 10);
    const label = rank === 1 ? "A" : rank === 11 ? "J" : rank === 12 ? "Q" : rank === 13 ? "K" : String(rank);
    return { rank, suit, value, label, red: suit === "♥" || suit === "♦" };
  }

  function cardHtml(c, hidden = false) {
    if (hidden) {
      return `
        <div class="mini-card bj-hole-card">
          <div class="bj-hole-inner">
            <div class="bj-hole-face bj-hole-back"></div>
            <div class="bj-hole-face bj-hole-front ${c.red ? "red" : ""}">${c.label}${c.suit}</div>
          </div>
        </div>`;
    }
    return `<div class="mini-card ${c.red ? "red" : ""}">${c.label}${c.suit}</div>`;
  }

  function createCardElement(c, hidden = false) {
    const t = document.createElement("template");
    t.innerHTML = cardHtml(c, hidden).trim();
    return t.content.firstElementChild;
  }

  function blackjackValue(cards) {
    let total = cards.reduce((s, c) => s + c.value, 0);
    let aces = cards.filter(c => c.rank === 1).length;
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return total;
  }

  function freshDeck() {
    const deck = [];
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({
          rank,
          suit,
          value: rank === 1 ? 14 : rank,
          label: rank === 1 ? "A" : rank === 11 ? "J" : rank === 12 ? "Q" : rank === 13 ? "K" : String(rank),
          red: suit === "♥" || suit === "♦"
        });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function dieFace(n) {
    return ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][n - 1];
  }

  window.Arcade = {
    $,
    $$,
    clamp,
    sleep,
    state,
    registry,
    categories,
    registerGame,
    beep,
    vibrate,
    confetti,
    feedback,
    titleBlock,
    setBusy,
    getWager,
    getMinWager,
    getBustLimit,
    syncWagerUI,
    updateDebtUI,
    updateBalance,
    pushHistory,
    showResult,
    renderTransferBox,
    showOutcomeModal,
    dismissOutcomeModal,
    cards: { suits, casinoCard, cardHtml, createCardElement, blackjackValue, freshDeck },
    dice: { dieFace }
  };
})();
