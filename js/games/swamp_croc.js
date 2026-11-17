(() => {
  const { $, $$, sleep, state, registerGame, beep, vibrate, confetti, titleBlock, setBusy, getWager, updateBalance, showResult } = window.Arcade;

  // ==========================================================
  // GAME 28: PRIK TIL SHREK (PRESS YOUR LUCK)
  // ==========================================================
  const SHREK_GIFTS = [
    { ico: "🧅", name: "Frisk Sumpløg", note: "Shrek grynter tilfreds!" },
    { ico: "🧇", name: "Æsels Vafler", note: "Shrek deler morgenmad!" },
    { ico: "🕯️", name: "Ørevoks-lys", note: "Klassisk sump-delikatesse!" },
    { ico: "👑", name: "Farquaads Krone", note: "Kongelig sump-bonus!" },
    { ico: "💎", name: "Magisk Sump-sten", note: "Vild gave fra sumpen!" }
  ];

  const SHREK_QUOTES = [
    "Hva' laver du i min sump? Klik forsigtigt...",
    "Heh... okay, den kildede faktisk lidt.",
    "Øh... lad være med at blive alt for grådig, makker.",
    "ADVARSEL! Mine ører ryster... én gang til og jeg eksploderer!",
    "PAS PÅ!! JEG TÆLLER TIL TRE!!"
  ];

  let shrekState = null;

  function shrekReward(pokes, w) {
    if (pokes <= 0) return 0;
    const mults = [0, 0.55, 1.0, 1.75, 2.75, 4.0, 5.5];
    const m = pokes < mults.length ? mults[pokes] : 5.5 + (pokes - 6) * 1.5;
    return Math.max(pokes, Math.round(w * m));
  }

  function shrekSnapChance(nextPoke) {
    if (nextPoke <= 1) return 0.14;
    if (nextPoke === 2) return 0.25;
    if (nextPoke === 3) return 0.37;
    if (nextPoke === 4) return 0.52;
    return 0.68;
  }

  function renderShrekStage(a) {
    shrekState = {
      pokes: 0,
      wager: null,
      active: false,
      finished: false,
      snapped: false,
      gifts: []
    };

    a.innerHTML = `
      ${titleBlock("👹 Prik til Shrek", "Klik på Shrek for at få gaver fra sumpen – cash ud før han bliver RASENDE!")}
      <div class="shrek-stage" id="shrekStage">
        <div class="shrek-mood-wrap">
          <div class="shrek-mood-top">
            <span id="shrekMoodLabel">😌 Chill i sumpen</span>
            <span id="shrekRiskLabel">Næste risiko: 14%</span>
          </div>
          <div class="shrek-mood-bar"><div class="shrek-mood-fill" id="shrekMoodFill" style="width:12%"></div></div>
        </div>

        <button type="button" class="shrek-avatar" id="shrekTapBtn" aria-label="Prik til Shrek">
          <div class="shrek-ears"><span></span><span></span></div>
          <div class="shrek-head" id="shrekHead">
            <div class="shrek-brows"><i></i><i></i></div>
            <div class="shrek-eyes"><b></b><b></b></div>
            <div class="shrek-mouth" id="shrekMouth"></div>
          </div>
          <div class="shrek-tap-hint" id="shrekTapHint">👆 PRIK HER!</div>
        </button>

        <div class="shrek-bubble" id="shrekBubble">"${SHREK_QUOTES[0]}"</div>

        <div class="shrek-gift-bar" id="shrekGiftBar">
          <span class="muted">Ingen sump-gaver endnu — prik til Shrek for at starte!</span>
        </div>

        <div class="shrek-actions">
          <button type="button" class="btn primary" id="shrekCashBtn" disabled>🎁 TAG GAVE & CASH UD</button>
        </div>
      </div>
      <div id="gameResult"></div>`;

    const tapBtn = $("#shrekTapBtn");
    const cashBtn = $("#shrekCashBtn");

    function refreshShrekUI() {
      const s = shrekState;
      const w = s.wager || getWager();
      const rew = shrekReward(s.pokes, w);
      const nextRisk = Math.round(shrekSnapChance(s.pokes + 1) * 100);
      const stage = $("#shrekStage");

      if (s.snapped) {
        if (stage) stage.classList.add("angry");
        $("#shrekMoodLabel").textContent = "🤬 RASENDE SUMP-BRØL!";
        $("#shrekRiskLabel").textContent = "BOOM!";
        $("#shrekMoodFill").style.width = "100%";
        $("#shrekBubble").textContent = '"UD AF MIN SUMP!! 😡💥"';
        $("#shrekTapHint").textContent = "💥 FOR SENT!";
        cashBtn.disabled = true;
        return;
      }

      const moodLabels = ["😌 Chill i sumpen", "😏 Mildt irriteret", "🤨 Øjnene kniber sig", "😠 Koger snart over!", "🌋 EKSTREM FARE!"];
      const mIdx = Math.min(moodLabels.length - 1, s.pokes);
      $("#shrekMoodLabel").textContent = moodLabels[mIdx];
      $("#shrekRiskLabel").textContent = `Næste risiko: ${nextRisk}%`;
      $("#shrekMoodFill").style.width = Math.min(95, 14 + s.pokes * 20) + "%";

      if (s.pokes >= 3 && stage) stage.classList.add("tense");

      const qIdx = Math.min(SHREK_QUOTES.length - 1, s.pokes);
      $("#shrekBubble").textContent = `"${SHREK_QUOTES[qIdx]}"`;

      if (s.gifts.length) {
        $("#shrekGiftBar").innerHTML = s.gifts.map(g => `<span class="shrek-gift-chip">${g.ico} ${g.name}</span>`).join("");
      }

      if (s.pokes >= 2 && !s.finished) {
        const bonusTxt = s.pokes >= 3 ? " + 🎁 Giv 1 ekstra tår!" : "";
        cashBtn.disabled = false;
        cashBtn.textContent = `🎁 CASH UD: -${rew} TÅRER${bonusTxt}`;
      } else if (s.pokes === 1 && !s.finished) {
        cashBtn.disabled = true;
        cashBtn.textContent = "🔒 PRIK MIN. 2 GANGE FØR CASH OUT (1/2)";
      } else {
        cashBtn.disabled = true;
        cashBtn.textContent = "🎁 TAG GAVE & CASH UD";
      }
    }

    tapBtn.onclick = async () => {
      if ((state.busy && !shrekState.active) || shrekState.finished || shrekState.locked || state.balance <= 0) return;
      if (!shrekState.active) {
        shrekState.wager = getWager();
        if (shrekState.wager <= 0) return;
        shrekState.active = true;
        setBusy(true);
      }

      tapBtn.classList.remove("poked");
      void tapBtn.offsetWidth;
      tapBtn.classList.add("poked");

      const nextPoke = shrekState.pokes + 1;
      const snap = Math.random() < shrekSnapChance(nextPoke);

      if (snap) {
        shrekState.locked = true;
        shrekState.snapped = true;
        shrekState.finished = true;
        refreshShrekUI();
        beep(130, 0.35, 0.06);
        vibrate([80, 40, 120]);
        await sleep(320);

        const penalty = shrekState.wager + 1;
        const actual = updateBalance(penalty, `Prik til Shrek: Han eksploderede på prik #${nextPoke}!`, "bad", 900);
        showResult(
          "🤬 UD AF MIN SUMP!",
          `Shrek snappede på prik #${nextPoke}! Du fik sump-straf på +${actual}.`,
          "bad",
          { icon: "👹", title: "SHREK BLEV RASENDE!" }
        );
        return;
      }

      shrekState.pokes = nextPoke;
      const gift = SHREK_GIFTS[Math.min(SHREK_GIFTS.length - 1, Math.floor(Math.random() * SHREK_GIFTS.length))];
      shrekState.gifts.push(gift);
      beep(460 + nextPoke * 85, 0.08, 0.03);
      vibrate(25);
      refreshShrekUI();
    };

    cashBtn.onclick = () => {
      if (!shrekState.active || shrekState.finished || shrekState.pokes < 2) return;
      shrekState.finished = true;
      const rew = shrekReward(shrekState.pokes, shrekState.wager);
      const bonusGive = shrekState.pokes >= 3 ? 1 : 0;
      const actual = updateBalance(
        -rew,
        `Prik til Shrek: Cashede ud efter ${shrekState.pokes} prik!`,
        "good",
        900,
        bonusGive ? { giveAmount: bonusGive, giveLabel: `${bonusGive} ekstra tår` } : {}
      );
      confetti();
      beep(860, 0.14, 0.035);
      showResult(
        "👹 Shrek gav dig en gave!",
        `Du turde ${shrekState.pokes} ${shrekState.pokes === 1 ? "prik" : "prik"} og fik ${shrekState.gifts.map(g => g.ico).join(" ")} (${Math.abs(actual)} sparet${bonusGive ? " + giv 1 ekstra tår" : ""})!`,
        "good",
        { icon: "👹", title: "SUMP-GAVE SIKRET!" }
      );
    };
  }

  // ==========================================================
  // GAME 29: KROKODILLE TANDLÆGE (CASHOUT + BORDRUNDE)
  // ==========================================================
  let crocModePref = "cashout"; // "cashout" | "table"
  let crocTrapsPref = 1;        // 1 | 2
  let crocState = null;

  function crocReward(safeCount, traps, w) {
    if (safeCount <= 0) return 0;
    const stepMult = traps === 2 ? 0.55 : 0.30;
    const bonus = safeCount >= (10 - traps) ? 1 : 0;
    return Math.max(1, Math.round(w * (safeCount * stepMult))) + bonus;
  }

  function renderCrocGame(a) {
    const trapsCount = crocModePref === "table" ? 1 : crocTrapsPref;
    const traps = new Set();
    while (traps.size < trapsCount) traps.add(Math.floor(Math.random() * 10));

    crocState = {
      mode: crocModePref,
      trapsCount,
      traps,
      pressed: new Set(),
      active: false,
      finished: false,
      snapped: false,
      wager: null
    };

    const topTeeth = [0, 1, 2, 3, 4];
    const botTeeth = [5, 6, 7, 8, 9];

    a.innerHTML = `
      ${titleBlock("🐊 Krokodille Tandlæge", crocModePref === "table"
        ? "Bordrunde: Tryk 1 tand ned ad gangen og send telefonen rundt, til den bider!"
        : "Tryk sikre tænder ned én ad gangen og cash ud før krokodillen smækker kæben i!")}
      <div class="croc-toolbar">
        <div class="toggle-row" style="margin:0;width:100%">
          <button type="button" class="toggle-pill crocModeBtn ${crocModePref === "cashout" ? "active" : ""}" data-cmode="cashout">🎯 Solo Cashout</button>
          <button type="button" class="toggle-pill crocModeBtn ${crocModePref === "table" ? "active" : ""}" data-cmode="table">👥 Bordrunde</button>
        </div>
        ${crocModePref === "cashout" ? `
          <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:6px">
            <span style="font-size:11px;font-weight:900;color:var(--muted)">SKJULTE FÆLDETÆNDER:</span>
            <div style="display:flex;gap:6px">
              <button type="button" class="btn small crocTrapBtn ${crocTrapsPref === 1 ? "primary" : ""}" data-ctrap="1">1 🦷 Blød</button>
              <button type="button" class="btn small crocTrapBtn ${crocTrapsPref === 2 ? "primary" : ""}" data-ctrap="2">2 🦷 Vild</button>
            </div>
          </div>` : ""}
      </div>

      <div class="croc-mouth" id="crocMouth">
        <div class="croc-snout-top">
          <div class="croc-eyes">
            <div class="croc-eye"><i></i></div>
            <div class="croc-eye"><i></i></div>
          </div>
          <div class="croc-nostrils"><b></b><b></b></div>
        </div>

        <div class="croc-throat">
          <div class="croc-teeth-row upper">
            ${topTeeth.map(i => `<button type="button" class="croc-tooth upper" data-tooth="${i}" aria-label="Tand ${i + 1}">🦷</button>`).join("")}
          </div>

          <div class="croc-center-status" id="crocCenterStatus">
            ${crocModePref === "table" ? "Send rundt & tryk 1 tand ned!" : "Tryk en tand ned for at starte"}
          </div>

          <div class="croc-teeth-row lower">
            ${botTeeth.map(i => `<button type="button" class="croc-tooth lower" data-tooth="${i}" aria-label="Tand ${i + 1}">🦷</button>`).join("")}
          </div>
        </div>

        <div class="croc-snout-bot"></div>
      </div>

      <div id="crocAction" class="croc-action-bar">
        <span class="muted" style="font-size:12px" id="crocStatsText">Tænder nede: 0 / 10</span>
        ${crocModePref === "cashout" ? `<button type="button" class="btn good" id="crocCashBtn" disabled>💰 CASH UD</button>` : ""}
      </div>
      <div id="gameResult"></div>`;

    $$(".crocModeBtn").forEach(b => {
      b.onclick = () => {
        if (state.busy || crocState.active) return;
        crocModePref = b.dataset.cmode;
        renderCrocGame(a);
      };
    });

    $$(".crocTrapBtn").forEach(b => {
      b.onclick = () => {
        if (state.busy || crocState.active) return;
        crocTrapsPref = +b.dataset.ctrap;
        renderCrocGame(a);
      };
    });

    function lockSetupControls() {
      $$(".crocModeBtn, .crocTrapBtn").forEach(btn => { btn.disabled = true; });
    }

    function refreshCrocUI() {
      const s = crocState;
      const n = s.pressed.size;
      const w = s.wager || getWager();
      const minSafe = s.trapsCount === 1 ? 3 : 2;
      if ($("#crocStatsText")) {
        $("#crocStatsText").textContent = `Tænder nede: ${n} / ${10 - s.trapsCount} sikre`;
      }
      if (s.mode === "cashout" && $("#crocCashBtn")) {
        const cashBtn = $("#crocCashBtn");
        if (n >= minSafe && !s.finished) {
          const rew = crocReward(n, s.trapsCount, w);
          cashBtn.disabled = false;
          cashBtn.textContent = `💰 CASH UD (-${rew} tårer)`;
        } else if (n > 0 && !s.finished) {
          cashBtn.disabled = true;
          cashBtn.textContent = `🔒 MIN. ${minSafe} TÆNDER (${n}/${minSafe})`;
        } else {
          cashBtn.disabled = true;
          cashBtn.textContent = "💰 CASH UD";
        }
      }
      if (s.mode === "table" && !s.finished && n > 0) {
        $("#crocCenterStatus").textContent = `✓ Sikkert! (${n} nede) → Giv telefonen videre!`;
      }
    }

    $$(".croc-tooth").forEach(btn => {
      btn.onclick = async () => {
        const idx = +btn.dataset.tooth;
        if ((state.busy && !crocState.active) || crocState.finished || crocState.locked || crocState.pressed.has(idx) || state.balance <= 0) return;

        if (!crocState.active) {
          crocState.wager = getWager();
          if (crocState.wager <= 0) return;
          crocState.active = true;
          setBusy(true);
          lockSetupControls();
        }

        if (crocState.traps.has(idx)) {
          crocState.locked = true;
          crocState.snapped = true;
          crocState.finished = true;
          btn.classList.add("trap");
          btn.textContent = "💥";
          const mouth = $("#crocMouth");
          if (mouth) mouth.classList.add("snapped");
          $("#crocCenterStatus").textContent = "🐊 CHOMP! KÆBEN KLAPPEDE I!";

          beep(125, 0.35, 0.065);
          vibrate([90, 40, 120]);
          await sleep(360);

          const w = crocState.wager;
          const desc = crocState.mode === "table"
            ? `Den der trykkede tand #${idx + 1} blev bidt af krokodillen efter ${crocState.pressed.size} sikre tænder!`
            : `CHOMP! Tand #${idx + 1} var fældetanden efter ${crocState.pressed.size} sikre tænder.`;
          const actual = updateBalance(w, `Krokodille Tandlæge: Blev bidt!`, "bad", 900);
          showResult(
            "🐊 CHOMP! KROKODILLEN BED!",
            `${desc} (+${actual} straf)`,
            "bad",
            { icon: "🐊", title: crocState.mode === "table" ? "BORD-TABER FUNDET!" : "DU BLEV BIDT!" }
          );
          return;
        }

        crocState.pressed.add(idx);
        btn.classList.add("down");
        btn.disabled = true;
        beep(520 + crocState.pressed.size * 55, 0.06, 0.025);
        vibrate(20);
        refreshCrocUI();

        // Hvis alle sikre tænder blev trykket ned!
        if (crocState.pressed.size >= 10 - crocState.trapsCount) {
          crocState.finished = true;
          await sleep(250);
          if (crocState.mode === "table") {
            updateBalance(-crocState.wager, "Krokodille Bordrunde: Alle sikre tænder klaret!", "good", 900);
            showResult("🏆 ALLE SIKRE TÆNDER KLARET!", "Ingen blev bidt — sidste trykker vinder potten!", "good", { icon: "🐊" });
          } else {
            const rew = crocReward(crocState.pressed.size, crocState.trapsCount, crocState.wager);
            const actual = updateBalance(-rew, "Krokodille Tandlæge: Alle sikre tænder klaret!", "good", 900);
            showResult("🏆 KROKODILLE-MESTER!", `Du fik ALLE ${crocState.pressed.size} sikre tænder ned og vandt ${Math.abs(actual)}!`, "good", { icon: "🐊" });
          }
        }
      };
    });

    if ($("#crocCashBtn")) {
      $("#crocCashBtn").onclick = () => {
        const minSafe = crocState ? (crocState.trapsCount === 1 ? 3 : 2) : 3;
        if (!crocState.active || crocState.finished || crocState.pressed.size < minSafe) return;
        crocState.finished = true;
        const n = crocState.pressed.size;
        const rew = crocReward(n, crocState.trapsCount, crocState.wager);
        const actual = updateBalance(-rew, `Krokodille Tandlæge: Cashede ud ved ${n} tænder!`, "good", 900);
        confetti();
        beep(840, 0.14, 0.035);
        showResult(
          "🐊 Tænder overlevet!",
          `Du stoppede i tide efter ${n} sikre tænder og reddede ${Math.abs(actual)}!`,
          "good",
          { icon: "🐊", title: "DU SLAP MED FINGRENE!" }
        );
      };
    }
  }

  registerGame({
    id: "shrek",
    name: "Prik til Shrek",
    icon: "👹",
    desc: "Sump-gaver eller vildt brøl",
    category: "arcade",
    render: renderShrekStage
  });

  registerGame({
    id: "croc",
    name: "Krokodille Tandlæge",
    icon: "🐊",
    desc: "Tryk tænder ned · solo & bordrunde",
    category: "arcade",
    render: renderCrocGame
  });
})();
