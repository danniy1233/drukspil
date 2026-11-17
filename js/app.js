(() => {
  const { $, $$, clamp, state, registry, categories, modes, caseModal, beep, setBusy, getMinWager, syncWagerUI, updateDebtUI, dismissOutcomeModal } = window.Arcade;

  let selectedMode = "classic";
  let drinkSub = "solo";
  let chaosSub = "solo";
  let duelSub = "pools";
  let setupPlayers = [
    { name: "Spiller 1", balance: 4 },
    { name: "Spiller 2", balance: 4 }
  ];

  // ==========================================================
  // START SCREEN & MODE SETUP
  // ==========================================================
  function renderModeCards() {
    const grid = $("#modeGrid");
    if (!grid) return;
    const order = ["classic", "drink", "party", "duel", "hardcore", "chaos"];
    grid.innerHTML = order.map(id => {
      const m = modes.MODES[id];
      const active = selectedMode === id;
      return `
        <button class="mode-card ${active ? "active" : ""}" data-mode="${id}" type="button">
          <div class="mode-ico">${m.icon}</div>
          <div>
            <strong>${m.name}</strong>
            <span>${m.desc}</span>
          </div>
          ${id === "classic" ? `<span class="mode-badge">Default</span>` : ""}
        </button>`;
    }).join("");

    $$(".mode-card").forEach(btn => {
      btn.onclick = () => {
        selectedMode = btn.dataset.mode;
        beep(520, 0.03, 0.015);
        renderModeCards();
        renderModeSetup();
      };
    });
  }

  function renderPlayerInputs(maxPool = 10, hidePools = false) {
    return `
      <div class="player-setup-list" id="playerSetupList">
        ${setupPlayers.map((p, i) => `
          <div class="player-setup-row" style="grid-template-columns:${hidePools ? "1fr 36px" : "1fr 68px 36px"}">
            <input type="text" class="pNameInput" data-idx="${i}" value="${p.name}" maxlength="16" placeholder="Spiller ${i + 1}">
            ${hidePools ? "" : `<input type="number" class="pBalInput" data-idx="${i}" min="1" max="${maxPool}" value="${clamp(p.balance, 1, maxPool)}">`}
            <button type="button" class="player-remove-btn" data-idx="${i}" ${setupPlayers.length <= 2 ? "disabled style='opacity:.35'" : ""}>×</button>
          </div>
        `).join("")}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        ${selectedMode !== "duel" && setupPlayers.length < 8 ? `<button type="button" class="btn small" id="addPlayerBtn" style="flex:1">+ Tilføj (${setupPlayers.length}/8)</button>` : ""}
        ${!hidePools ? `<button type="button" class="btn small" id="randPoolsBtn" style="flex:1">🎲 Tilfældige puljer</button>` : ""}
      </div>
    `;
  }

  function wirePlayerInputs(maxPool = 10) {
    $$(".pNameInput").forEach(inp => {
      inp.oninput = () => { setupPlayers[+inp.dataset.idx].name = inp.value; };
    });
    $$(".pBalInput").forEach(inp => {
      inp.onchange = () => {
        const v = clamp(parseInt(inp.value || "4", 10), 1, maxPool);
        inp.value = v;
        setupPlayers[+inp.dataset.idx].balance = v;
      };
    });
    $$(".player-remove-btn").forEach(btn => {
      btn.onclick = () => {
        if (setupPlayers.length <= 2) return;
        setupPlayers.splice(+btn.dataset.idx, 1);
        renderModeSetup();
      };
    });
    if ($("#addPlayerBtn")) {
      $("#addPlayerBtn").onclick = () => {
        if (setupPlayers.length >= 8) return;
        setupPlayers.push({ name: `Spiller ${setupPlayers.length + 1}`, balance: 4 });
        renderModeSetup();
      };
    }
    if ($("#randPoolsBtn")) {
      $("#randPoolsBtn").onclick = () => {
        setupPlayers.forEach(p => {
          p.balance = clamp(2 + Math.floor(Math.random() * 7), 1, maxPool);
        });
        beep(640, 0.04, 0.02);
        renderModeSetup();
      };
    }
  }

  function renderModeSetup() {
    const box = $("#modeSetupArea");
    if (!box) return;

    if (selectedMode === "classic") {
      box.innerHTML = `
        <span class="setup-label">Startpulje (1–10 tårer)</span>
        <p class="setup-rule-note">Spil alle 27 minispil alene. Ram <strong>0</strong> for at vinde – rammer puljen <strong>11</strong> taber du.</p>
        <div class="start-input-row" style="display:flex;gap:8px;align-items:center">
          <input id="startAmount" type="number" min="1" max="10" value="4" style="flex:1">
          <button type="button" class="btn small" id="randStartBtn">🎲 Tilfældig</button>
        </div>`;
    } else if (selectedMode === "drink") {
      box.innerHTML = `
        <span class="setup-label">🍻 Drukspil Format (Ingen pulje)</span>
        <div class="toggle-row">
          <button type="button" class="toggle-pill ${drinkSub === "solo" ? "active" : ""}" data-drsub="solo">Solo Drukspil</button>
          <button type="button" class="toggle-pill ${drinkSub === "party" ? "active" : ""}" data-drsub="party">Party Drukspil (2–8)</button>
        </div>
        <p class="setup-rule-note">Ingen startpulje! Spillet vælger et tilfældigt minispil og sætter <strong>1–5 tårer</strong> på højkant hver tur. Tab → <strong>Drik!</strong> · Vinder → <strong>Giv ud!</strong></p>
        ${drinkSub === "party" ? renderPlayerInputs(10, true) : ""}`;
      $$("[data-drsub]").forEach(b => b.onclick = () => { drinkSub = b.dataset.drsub; renderModeSetup(); });
      if (drinkSub === "party") wirePlayerInputs(10);
    } else if (selectedMode === "hardcore") {
      box.innerHTML = `
        <span class="setup-label">🔥 Hardcore Startpulje (1–20 tårer)</span>
        <p class="setup-rule-note">Hårdere indsats: Minimumsindsats er <strong>50% af din pulje</strong> (min. 2), og hvert tab giver <strong>+1 ekstra straftår</strong>. Bust ved 21!</p>
        <div class="start-input-row" style="display:flex;gap:8px;align-items:center">
          <input id="startAmount" type="number" min="1" max="20" value="8" style="flex:1">
          <button type="button" class="btn small" id="randStartBtn">🎲 Tilfældig</button>
        </div>`;
    } else if (selectedMode === "party") {
      box.innerHTML = `
        <span class="setup-label">👥 Spillere & Startpulje (2–8 spillere)</span>
        <p class="setup-rule-note">Skiftes efter hvert spil! "Giv ud"-gevinster kan sendes direkte til en valgfri medspillers pulje.</p>
        ${renderPlayerInputs(10, false)}`;
      wirePlayerInputs(10);
    } else if (selectedMode === "duel") {
      if (setupPlayers.length > 2) setupPlayers = setupPlayers.slice(0, 2);
      box.innerHTML = `
        <span class="setup-label">⚔️ Duel Format</span>
        <div class="toggle-row">
          <button type="button" class="toggle-pill ${duelSub === "pools" ? "active" : ""}" data-dsub="pools">Ægte Duel (Puljer)</button>
          <button type="button" class="toggle-pill ${duelSub === "quick" ? "active" : ""}" data-dsub="quick">Hurtig Duel (Uden pulje)</button>
        </div>
        <p class="setup-rule-note">${duelSub === "pools"
          ? "Vinderen fjerner indsatsen (-W) og taberen får indsatsen (+W). Først på 0 vinder eller først på 11 buster!"
          : "Spil direkte head-to-head om tårer uden puljegrænse – taberen tager indsatsen direkte!"}</p>
        ${renderPlayerInputs(10, duelSub === "quick")}`;
      $$("[data-dsub]").forEach(b => b.onclick = () => { duelSub = b.dataset.dsub; renderModeSetup(); });
      wirePlayerInputs(10);
    } else if (selectedMode === "chaos") {
      box.innerHTML = `
        <span class="setup-label">🌪️ Kaos Type</span>
        <div class="toggle-row">
          <button type="button" class="toggle-pill ${chaosSub === "solo" ? "active" : ""}" data-csub="solo">Solo Kaos</button>
          <button type="button" class="toggle-pill ${chaosSub === "party" ? "active" : ""}" data-csub="party">Party Kaos (2–8)</button>
        </div>
        <p class="setup-rule-note">Appen trækker et tilfældigt spil + en vild Kaos-modifier til hver tur!</p>
        ${chaosSub === "solo"
          ? `<span class="setup-label">Startpulje (1–10)</span><div class="start-input-row" style="display:flex;gap:8px;align-items:center"><input id="startAmount" type="number" min="1" max="10" value="4" style="flex:1"><button type="button" class="btn small" id="randStartBtn">🎲 Tilfældig</button></div>`
          : renderPlayerInputs(10, false)}`;
      $$("[data-csub]").forEach(b => b.onclick = () => { chaosSub = b.dataset.csub; renderModeSetup(); });
      if (chaosSub === "party") wirePlayerInputs(10);
    }

    if ($("#randStartBtn") && $("#startAmount")) {
      $("#randStartBtn").onclick = () => {
        const isHc = selectedMode === "hardcore";
        const val = isHc ? (4 + Math.floor(Math.random() * 13)) : (2 + Math.floor(Math.random() * 8));
        $("#startAmount").value = val;
        beep(640, 0.04, 0.02);
      };
    }
  }

  // ==========================================================
  // NAVIGATION & VIEWS (PHONE BOTTOM NAV)
  // ==========================================================
  function switchView(viewName) {
    if (viewName === "games" && (modes.state.mode === "chaos" || modes.state.mode === "drink")) return;
    state.activeView = viewName;
    $$(".phone-view").forEach(v => v.classList.toggle("active", v.dataset.view === viewName));
    $$(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.nav === viewName));

    // Vis kun wager-strip når man er i Arena (og ikke i Drukspil-mode)
    const wagerStrip = $("#hudWagerStrip");
    if (wagerStrip) {
      wagerStrip.classList.toggle("hidden", viewName !== "arena" || modes.isDrinkMode());
    }

    if (viewName === "games") renderGamesGrid();
    if (viewName === "status") renderStatusView();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderCategoryPills() {
    const wrap = $("#catPills");
    if (!wrap) return;
    if (modes.state.mode === "duel") {
      wrap.innerHTML = `<button class="cat-pill active" type="button">⚔️ Kun Duel-kompatible spil (8)</button>`;
      return;
    }
    wrap.innerHTML = categories.map(c => `
      <button type="button" class="cat-pill ${state.activeCategory === c.id ? "active" : ""}" data-cat="${c.id}">${c.label}</button>
    `).join("");
    $$(".cat-pill").forEach(btn => {
      btn.onclick = () => {
        state.activeCategory = btn.dataset.cat;
        renderCategoryPills();
        renderGamesGrid();
      };
    });
  }

  function renderGamesGrid() {
    renderCategoryPills();
    const grid = $("#gamesGrid");
    if (!grid) return;

    const all = [...registry.values()];
    const filtered = modes.state.mode === "duel"
      ? all.filter(g => g.duel)
      : state.activeCategory === "all"
        ? all
        : all.filter(g => g.category === state.activeCategory);

    grid.innerHTML = filtered.map(g => `
      <button type="button" class="game-tab ${state.game === g.id ? "active" : ""}" data-game="${g.id}">
        ${g.duel ? `<span class="duel-tag">1v1</span>` : ""}
        <div class="ico">${g.icon}</div>
        <strong>${g.name}</strong>
        <span>${g.desc}</span>
      </button>
    `).join("");

    $$(".game-tab").forEach(tab => {
      tab.onclick = () => {
        if (state.busy) return;
        const nextGame = tab.dataset.game;
        if (state.game === "higher" && nextGame !== "higher") state.higherStreak = 0;
        state.game = nextGame;
        beep(580, 0.03, 0.015);
        renderActiveGame();
        switchView("arena");
      };
    });
  }

  function renderActiveGame() {
    const a = $("#arena");
    if (!a) return;
    a.classList.remove("round-ending");

    if (modes.state.mode === "duel") {
      const ok = modes.renderDuelGame(state.game, a);
      if (!ok) {
        state.game = "rps";
        modes.renderDuelGame("rps", a);
      }
      return;
    }

    const def = registry.get(state.game) || registry.get("wheel");
    if (def && typeof def.render === "function") {
      def.render(a);
    }
  }

  function renderStatusView() {
    const sbCard = $("#statusScoreboardCard");
    const sbList = $("#statusScoreboardList");
    const isDrink = modes.isDrinkMode();
    const isMulti = modes.isMultiplayer() || modes.state.mode === "duel";

    if (sbCard && sbList) {
      sbCard.classList.toggle("hidden", !isMulti && !isDrink);
      const sbHeading = sbCard.querySelector("h3");
      if (isDrink) {
        if (sbHeading) sbHeading.textContent = "🍻 Drukket & Givet ud";
        const cur = modes.currentPlayer();
        sbList.innerHTML = modes.state.players.map(p => {
          const isCur = isMulti && cur && cur.id === p.id;
          return `
            <div class="scoreboard-item ${isCur ? "current" : ""}">
              <div>
                <strong>${isCur ? "▶ " : ""}${p.name}</strong>
                <small>${isMulti ? (isCur ? "Spiller nu" : "Venter på tur") : "Solo statistik"}</small>
              </div>
              <div class="scoreboard-pts">🍻 ${p.drunk || 0} · 🎁 ${p.given || 0}</div>
            </div>`;
        }).join("");
      } else if (isMulti) {
        if (sbHeading) sbHeading.textContent = "👥 Spillere & Stilling";
        const cur = modes.currentPlayer();
        sbList.innerHTML = modes.state.players.map(p => {
          const isCur = modes.isMultiplayer() && cur && cur.id === p.id;
          const badge = p.status === "safe" ? "🏆 Sikker (0)" : p.status === "busted" ? `💀 Bust (${p.balance})` : `${p.balance} tårer`;
          return `
            <div class="scoreboard-item ${isCur ? "current" : ""} ${p.status}">
              <div>
                <strong>${isCur ? "▶ " : ""}${p.name}</strong>
                <small>${p.status === "active" ? (isCur ? "Spiller nu" : "Venter på tur") : p.status === "safe" ? "Færdig & sikker" : "Over gældsgrænsen"}</small>
              </div>
              <div class="scoreboard-pts">${badge}</div>
            </div>`;
        }).join("");
      }
    }

    const histEl = $("#statusHistoryList");
    if (histEl) {
      histEl.innerHTML = state.history.length
        ? state.history.map(h => `<div class="history-row">${h}</div>`).join("")
        : `<div class="history-row">Ingen spil spillet i denne runde endnu.</div>`;
    }

    const rulesEl = $("#statusRulesText");
    if (rulesEl) {
      if (isDrink) {
        rulesEl.textContent = "🍻 Drukspil: Ingen startpulje og ingen gældsgrænse. Hver tur vælger spillet et tilfældigt minispil med 1–5 tårer på højkant. Taber du → drik! Vinder du → giv ud!";
      } else {
        const m = modes.MODES[modes.state.mode];
        const bust = modes.getBustLimit();
        rulesEl.textContent = `${m.icon} ${m.name}: Gældsgrænse er ${bust}. Indsats stiger ikke automatisk ved tab. MAX sætter hele din aktuelle pulje.`;
      }
    }

    if ($("#takeBtn")) {
      $("#takeBtn").textContent = isDrink ? "Afslut drukspil & gå til start" : "Tag puljen & afslut runde";
    }
  }

  // ==========================================================
  // START & RESET ROUND
  // ==========================================================
  function startFromSetup() {
    let soloAmt = 4;
    if ($("#startAmount")) {
      const maxP = selectedMode === "hardcore" ? 20 : 10;
      soloAmt = clamp(parseInt($("#startAmount").value || "4", 10), 1, maxP);
    }

    modes.startModeSession({
      mode: selectedMode,
      drinkSubMode: drinkSub,
      chaosSubMode: chaosSub,
      duelSubMode: duelSub,
      soloAmount: soloAmt,
      players: setupPlayers
    });

    $("#appRoot").classList.add("in-hub");
    $("#startScreen").classList.add("hidden");
    $("#hub").classList.remove("hidden");
    $("#zeroOverlay").classList.remove("show");
    $("#debtOverlay").classList.remove("show");
    $("#caseModal")?.classList.remove("show");
    $("#outcomeModal")?.classList.remove("show");
    $("#duelPrivacyOverlay")?.classList.remove("show");
    clearTimeout(state.outcomeModalTimer);

    const gamesNavBtn = $(`.nav-tab[data-nav="games"]`);
    if (gamesNavBtn) {
      const isChaos = modes.state.mode === "chaos";
      const isDrink = modes.isDrinkMode();
      const locked = isChaos || isDrink;
      const duelCount = [...registry.values()].filter(g => g.duel).length;
      gamesNavBtn.style.opacity = locked ? "0.35" : "1";
      gamesNavBtn.querySelector("span:last-child").textContent = isChaos
        ? "Kaos vælger"
        : isDrink
          ? "Drukspil vælger"
          : modes.state.mode === "duel"
            ? `Duel (${duelCount})`
            : `Spil (${registry.size})`;
    }

    setBusy(false);
    updateDebtUI();
    syncWagerUI();
    renderActiveGame();
    switchView("arena");
    beep(660, 0.06, 0.025);
  }

  function resetToStart() {
    if (state.busy && !state.debtBusted && !state.roundEnding) return;
    clearTimeout(state.zeroOverlayTimer);
    clearTimeout(state.debtBustTimer);
    clearTimeout(state.outcomeModalTimer);

    state.debtBusted = false;
    state.roundEnding = false;
    state.busy = false;
    state.balance = 0;

    $("#appRoot").classList.remove("in-hub");
    $("#hub").classList.add("hidden");
    $("#startScreen").classList.remove("hidden");
    $("#zeroOverlay").classList.remove("show");
    $("#debtOverlay").classList.remove("show");
    $("#caseModal")?.classList.remove("show");
    $("#outcomeModal")?.classList.remove("show");
    $("#duelPrivacyOverlay")?.classList.remove("show");
    $("#debtVignette").className = "debt-vignette";

    setBusy(false);
    renderModeCards();
    renderModeSetup();
  }

  // ==========================================================
  // GLOBAL WIRING
  // ==========================================================
  function init() {
    renderModeCards();
    renderModeSetup();

    $("#startBtn").onclick = startFromSetup;
    $("#startScreen").addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.id === "startAmount") $("#startBtn").click();
    });
    $("#newRoundBtn").onclick = resetToStart;
    $("#newRoundOverlay").onclick = resetToStart;
    $("#debtCashoutBtn").onclick = resetToStart;
    $("#takeBtn").onclick = () => {
      if (state.busy) return;
      resetToStart();
    };

    // Phone bottom nav
    $$(".nav-tab").forEach(btn => {
      btn.onclick = () => {
        if (state.busy) return;
        switchView(btn.dataset.nav);
      };
    });

    // Quick wager stepper + input
    const wagerMaxCap = () => (modes.state.mode === "duel" && modes.state.duelSubMode === "quick") ? 10 : state.balance;
    $("#wagerMinus").onclick = () => {
      const cap = wagerMaxCap();
      if (state.busy || cap <= 0) return;
      const minW = Math.min(cap, getMinWager());
      state.desiredWager = clamp(state.desiredWager - 1, minW, cap);
      syncWagerUI();
      beep(420, 0.02, 0.01);
    };
    $("#wagerPlus").onclick = () => {
      const cap = wagerMaxCap();
      if (state.busy || cap <= 0) return;
      const minW = Math.min(cap, getMinWager());
      state.desiredWager = clamp(state.desiredWager + 1, minW, cap);
      syncWagerUI();
      beep(500, 0.02, 0.01);
    };
    $("#maxBtn").onclick = () => {
      const cap = wagerMaxCap();
      if (state.busy || cap <= 0) return;
      state.desiredWager = cap;
      syncWagerUI();
      beep(620, 0.03, 0.015);
    };
    $("#wager").onchange = () => {
      const cap = wagerMaxCap();
      if (cap <= 0) return;
      const minW = Math.min(cap, getMinWager());
      state.desiredWager = clamp(parseInt($("#wager").value || minW, 10), minW, cap);
      syncWagerUI();
    };

    // Modals
    $("#caseModalCloseBtn").onclick = () => caseModal.dismissCaseModal("stay");
    $("#caseModalSwitchBtn").onclick = () => caseModal.dismissCaseModal("switch");
    $("#caseModal").onclick = e => {
      if (e.target === $("#caseModal") && state.balance > 0 && !state.debtBusted && !modes.isMultiplayer() && modes.state.mode !== "chaos" && !modes.isDrinkMode()) {
        caseModal.dismissCaseModal("stay");
      }
    };

    $("#outcomeMainBtn").onclick = () => dismissOutcomeModal("stay");
    $("#outcomeSwitchBtn").onclick = () => dismissOutcomeModal("switch");
    $("#outcomeModal").onclick = e => {
      if (e.target === $("#outcomeModal") && state.balance > 0 && !state.debtBusted && !modes.isMultiplayer() && modes.state.mode !== "chaos" && modes.state.mode !== "duel" && !modes.isDrinkMode()) {
        dismissOutcomeModal("stay");
      }
    };

    window.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        const outModal = $("#outcomeModal");
        if (outModal && outModal.classList.contains("show") && modes.state.mode !== "duel") {
          e.preventDefault();
          dismissOutcomeModal("stay");
          return;
        }
        const cModal = $("#caseModal");
        if (cModal && cModal.classList.contains("show")) {
          e.preventDefault();
          caseModal.dismissCaseModal("stay");
        }
      }
    });

    if ($("#topGameBadge")) {
      $("#topGameBadge").textContent = `${registry.size} spil · 6 modes`;
    }
  }

  window.Arcade.app = { switchView, renderActiveGame, renderGamesGrid, resetToStart };
  document.addEventListener("DOMContentLoaded", init);
})();
