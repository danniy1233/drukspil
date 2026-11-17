(() => {
  const { $, $$, clamp, sleep, state, registry, beep, vibrate, confetti, setBusy, getWager, updateDebtUI, syncWagerUI, pushHistory } = window.Arcade;

  const MODES = {
    classic: { id: "classic", name: "Classic",  icon: "🎲", desc: "Solo eller Party · Start 1–10 · Bust 11" },
    hardcore:{ id: "hardcore",name: "Hardcore", icon: "🔥", desc: "Solo eller Party · Start 1–20 · Bust 21" },
    drink:   { id: "drink",   name: "Drukspil", icon: "🍻", desc: "Ingen pulje · Spillet ruller tårer & spil" },
    duel:    { id: "duel",    name: "Duel 1v1", icon: "⚔️", desc: "2 spillere kæmper direkte mod hinanden" }
  };

  const CHAOS_MODIFIERS = [
    { id: "double",     label: "⚡ 2× GEVINST & STRAF",   desc: "Alt tæller dobbelt denne tur!" },
    { id: "forced_max", label: "💣 TVUNGEN MAX INDSATS",  desc: "Du SKAL satse hele din pulje på dette spil!" },
    { id: "shield",     label: "🛡️ KAOS-SKJOLD (-1)",     desc: "Taber du, slipper du med 1 point mindre i straf." },
    { id: "extra_save", label: "✨ GULD-BOOST (-1 EKSTRA)", desc: "Vinder du, fjerner du 1 ekstra point fra puljen!" },
    { id: "sip_first",  label: "🍻 DRIK 1 TÅR FØR SPIL",  desc: "Tag 1 tår inden du starter spillet. Normale point!" },
    { id: "normal",     label: "🎲 REN KAOS-TUR",         desc: "Standard odds på denne tur." }
  ];

  const modeState = {
    mode: "classic",
    classicSubMode: "solo",  // "solo" | "party"
    hardcoreSubMode: "solo", // "solo" | "party"
    drinkSubMode: "solo",    // "solo" | "party"
    drinkMaxStake: 5,
    duelSubMode: "pools",    // "pools" | "quick"
    chaosEnabled: false,
    surprisesEnabled: true,
    challengesEnabled: true,
    turnCount: 0,
    lastBetweenPopupTurn: -2,
    pendingBuff: null, // null | "double" | "shield"
    recentGames: [],
    promptBag: [],
    lastPromptId: null,
    players: [],
    turnIndex: 0,
    turnStake: 2,
    lastDrinkResult: null,
    activeModifier: null,
    duelSession: null
  };

  function isDrinkMode() {
    return modeState.mode === "drink";
  }

  function isChaosEnabled() {
    return Boolean(modeState.chaosEnabled && (modeState.mode === "classic" || modeState.mode === "hardcore"));
  }

  function isMultiplayer() {
    return (modeState.mode === "classic" && modeState.classicSubMode === "party")
      || (modeState.mode === "hardcore" && modeState.hardcoreSubMode === "party")
      || (modeState.mode === "drink" && modeState.drinkSubMode === "party");
  }

  function currentPlayer() {
    if (!modeState.players.length) return null;
    return modeState.players[modeState.turnIndex] || modeState.players[0];
  }

  function activePlayers() {
    return modeState.players.filter(p => p.status === "active");
  }

  function getBustLimit() {
    return modeState.mode === "hardcore" ? 21 : 11;
  }

  function getMaxStartPool() {
    return modeState.mode === "hardcore" ? 20 : 10;
  }

  function getMinWager(pool) {
    if (pool <= 1) return 1;
    if (modeState.mode === "hardcore") {
      return Math.max(2, Math.ceil(pool * 0.5));
    }
    if (isChaosEnabled() && modeState.activeModifier && modeState.activeModifier.id === "forced_max") {
      return pool;
    }
    return 1;
  }

  function transformDelta(rawDelta, currentBalance) {
    let d = rawDelta;
    if (modeState.mode === "hardcore" && d > 0) {
      d += 1; // Hardcore: +1 ekstra straftår ved tab
    }
    if (isChaosEnabled() && modeState.activeModifier) {
      const m = modeState.activeModifier.id;
      if (m === "double" && d !== 0) d = d * 2;
      else if (m === "shield" && d > 0) d = Math.max(0, d - 1);
      else if (m === "extra_save" && d < 0) d = d - 1;
    }
    if (modeState.pendingBuff === "double" && d !== 0) {
      d = d * 2;
    } else if (modeState.pendingBuff === "shield" && d > 0) {
      d = d > 1 ? Math.ceil(d / 2) : 0;
    }
    return d;
  }

  function syncCurrentPlayerPool(newBal) {
    const p = currentPlayer();
    if (!p) return;
    p.balance = newBal;
    const bust = getBustLimit();
    if (newBal <= 0) p.status = "safe";
    else if (newBal >= bust) p.status = "busted";
  }

  function canTransferSips() {
    return !isDrinkMode() && isMultiplayer() && activePlayers().filter(p => p.id !== currentPlayer()?.id).length > 0;
  }

  function getTransferTargets() {
    const cur = currentPlayer();
    return activePlayers().filter(p => !cur || p.id !== cur.id);
  }

  function transferPointsToPlayer(targetId, amount) {
    const target = modeState.players.find(p => p.id === targetId);
    if (!target) return null;
    target.balance = clamp(target.balance + amount, 0, 99);
    const bust = getBustLimit();
    if (target.balance >= bust) target.status = "busted";
    const sender = currentPlayer();
    pushHistory(`🎁 ${sender ? sender.name : "Spiller"} sendte +${amount} til ${target.name} (nu ${target.balance})`);
    return target;
  }

  function pickFreshGameId() {
    const allIds = [...registry.keys()];
    if (!allIds.length) return "wheel";
    const recent = new Set(modeState.recentGames.slice(-5));
    const pool = allIds.filter(id => !recent.has(id));
    const candidates = pool.length ? pool : allIds;
    const pickId = candidates[Math.floor(Math.random() * candidates.length)] || "wheel";
    modeState.recentGames.push(pickId);
    if (modeState.recentGames.length > 5) modeState.recentGames.shift();
    return pickId;
  }

  function rollChaosModifier() {
    modeState.activeModifier = CHAOS_MODIFIERS[Math.floor(Math.random() * CHAOS_MODIFIERS.length)];
    if (modeState.activeModifier.id === "forced_max") {
      state.desiredWager = Math.max(1, state.balance);
    }
  }

  function rollDrinkTurn() {
    state.game = pickFreshGameId();
    state.higherStreak = 0;
    const maxS = clamp(parseInt(modeState.drinkMaxStake || 5, 10), 1, 20);
    modeState.turnStake = 1 + Math.floor(Math.random() * maxS);
    modeState.lastDrinkResult = null;
    state.balance = 10;
    state.desiredWager = modeState.turnStake;
  }

  function applyDrinkOutcome(rawDelta, currentBal, opts = {}) {
    const cur = currentPlayer();
    const stake = modeState.turnStake || 2;
    const isClear = rawDelta <= -currentBal && currentBal > 0;
    let res;

    if (isClear) {
      const giveAmt = stake + 2 + (opts.giveAmount || 0);
      if (cur) cur.given += giveAmt;
      res = {
        outcomeType: "good",
        isJackpotClear: true,
        giveAmt,
        drinkAmt: 0,
        shotsToGive: 1,
        stake,
        signedAmount: -giveAmt,
        flyText: "🥃 SHOT!",
        historyText: `🥃 ${cur ? cur.name : "Du"}: Uddel 1 SHOT + ${giveAmt} tårer!`
      };
    } else if (opts.drinkSelf) {
      const drinkAmt = opts.drinkSelf + (rawDelta > 0 ? Math.max(1, Math.round(rawDelta)) : 0);
      if (cur) cur.drunk += drinkAmt;
      res = {
        outcomeType: "bad",
        isJackpotClear: false,
        giveAmt: 0,
        drinkAmt,
        shotsToGive: 0,
        stake,
        signedAmount: drinkAmt,
        flyText: `🍻 +${drinkAmt}`,
        historyText: `🍻 ${cur ? cur.name : "Du"}: Drik ${drinkAmt} tårer!`
      };
    } else if (opts.giveShot) {
      const giveAmt = Math.max(1, Math.abs(Math.round(rawDelta || stake)));
      if (cur) cur.given += giveAmt;
      res = {
        outcomeType: "good",
        isJackpotClear: true,
        giveAmt,
        drinkAmt: 0,
        shotsToGive: 1,
        stake,
        signedAmount: -giveAmt,
        flyText: "🥃 SHOT!",
        historyText: `🥃 ${cur ? cur.name : "Du"}: Uddel 1 SHOT + ${giveAmt} tårer!`
      };
    } else if (rawDelta < 0 || opts.giveAmount) {
      const giveAmt = Math.max(opts.giveAmount || 0, Math.abs(Math.round(rawDelta)));
      if (cur) cur.given += giveAmt;
      res = {
        outcomeType: "good",
        isJackpotClear: false,
        giveAmt,
        drinkAmt: 0,
        shotsToGive: 0,
        stake,
        signedAmount: -giveAmt,
        flyText: `🎁 ${giveAmt}`,
        historyText: `🎁 ${cur ? cur.name : "Du"}: Giv ${giveAmt} ${giveAmt === 1 ? "tår" : "tårer"} ud!`
      };
    } else if (rawDelta > 0) {
      const drinkAmt = Math.max(1, Math.round(rawDelta));
      if (cur) cur.drunk += drinkAmt;
      res = {
        outcomeType: "bad",
        isJackpotClear: false,
        giveAmt: 0,
        drinkAmt,
        shotsToGive: 0,
        stake,
        signedAmount: drinkAmt,
        flyText: `🍻 ${drinkAmt}`,
        historyText: `🍻 ${cur ? cur.name : "Du"}: Drik ${drinkAmt} ${drinkAmt === 1 ? "tår" : "tårer"}!`
      };
    } else {
      res = {
        outcomeType: "special",
        isJackpotClear: false,
        giveAmt: 0,
        drinkAmt: 0,
        shotsToGive: 0,
        stake,
        signedAmount: 0,
        flyText: "0",
        historyText: `🤝 ${cur ? cur.name : "Du"}: Slap fri (0 tårer)`
      };
    }

    if (modeState.pendingBuff === "double") {
      if (res.outcomeType === "good" && res.giveAmt > 0) {
        if (cur) cur.given += res.giveAmt;
        res.giveAmt *= 2;
        res.signedAmount = -res.giveAmt;
        res.flyText = `⚡ ${res.giveAmt}`;
        res.historyText += " (⚡ 2× Buff!)";
      } else if (res.outcomeType === "bad" && res.drinkAmt > 0) {
        if (cur) cur.drunk += res.drinkAmt;
        res.drinkAmt *= 2;
        res.signedAmount = res.drinkAmt;
        res.flyText = `⚡ +${res.drinkAmt}`;
        res.historyText += " (⚡ 2× Buff!)";
      }
    } else if (modeState.pendingBuff === "shield" && res.outcomeType === "bad" && res.drinkAmt > 0) {
      const saved = Math.max(1, Math.floor(res.drinkAmt / 2));
      if (cur) cur.drunk = Math.max(0, cur.drunk - saved);
      res.drinkAmt -= saved;
      res.signedAmount = res.drinkAmt;
      if (res.drinkAmt === 0) {
        res.outcomeType = "special";
        res.flyText = "🛡️ 0";
        res.historyText = `🛡️ ${cur ? cur.name : "Du"}: Skjold blokerede alle tårer!`;
      } else {
        res.flyText = `🛡️ ${res.drinkAmt}`;
        res.historyText += ` (🛡️ -${saved})`;
      }
    }

    res.doubleUsed = false;
    res.doubleWon = null;
    res.doubleOffered = !res.isJackpotClear && !opts.giveShot
      && ((res.outcomeType === "good" && res.giveAmt > 0) || (res.outcomeType === "bad" && res.drinkAmt > 0))
      && Math.random() < 0.4;

    modeState.lastDrinkResult = res;
    return res;
  }

  function resolveDrinkDoubleOrNothing() {
    const dr = modeState.lastDrinkResult;
    if (!dr || !dr.doubleOffered || dr.doubleUsed) return null;
    dr.doubleUsed = true;
    const cur = currentPlayer();
    const won = Math.random() < 0.5;
    dr.doubleWon = won;

    if (dr.outcomeType === "good") {
      const orig = dr.giveAmt;
      if (won) {
        if (cur) cur.given += orig;
        dr.giveAmt = orig * 2;
        dr.signedAmount = -dr.giveAmt;
        dr.historyText = `⚡ ${cur ? cur.name : "Du"}: Double or Nothing VANDT! Giv ${dr.giveAmt} tårer ud!`;
      } else {
        if (cur) cur.given = Math.max(0, cur.given - orig);
        dr.giveAmt = 0;
        dr.outcomeType = "special";
        dr.signedAmount = 0;
        dr.historyText = `💨 ${cur ? cur.name : "Du"}: Double or Nothing tabt → 0 tårer at give ud.`;
      }
    } else if (dr.outcomeType === "bad") {
      const orig = dr.drinkAmt;
      if (won) {
        if (cur) cur.drunk = Math.max(0, cur.drunk - orig);
        dr.drinkAmt = 0;
        dr.outcomeType = "special";
        dr.signedAmount = 0;
        dr.historyText = `🛡️ ${cur ? cur.name : "Du"}: Double or Nothing VANDT → Slap fri (0 tårer)!`;
      } else {
        if (cur) cur.drunk += orig;
        dr.drinkAmt = orig * 2;
        dr.signedAmount = dr.drinkAmt;
        dr.historyText = `⚡ ${cur ? cur.name : "Du"}: Double or Nothing TABT → DRIK ${dr.drinkAmt} TÅRER!`;
      }
    }

    pushHistory(dr.historyText);
    updateDebtUI();
    return dr;
  }

  function findNextActivePlayerIndex(fromIdx) {
    const n = modeState.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (fromIdx + step) % n;
      if (modeState.players[idx].status === "active") return idx;
    }
    return -1;
  }

  function shouldEndMultiplayerSession() {
    if (!isMultiplayer() || isDrinkMode()) return false;
    const active = activePlayers();
    // Stopper når 0 aktive eller kun 1 aktiv tilbage mens alle andre enten er sikre/busted (hvis >=2 spillere)
    if (active.length === 0) return true;
    if (modeState.players.length >= 2 && active.length === 1 && modeState.players.some(p => p.status !== "active")) {
      return true;
    }
    return false;
  }

  function getModeOutcomeConfig() {
    const cur = currentPlayer();
    if (isDrinkMode()) {
      if (isMultiplayer()) {
        const nextIdx = (modeState.turnIndex + 1) % modeState.players.length;
        const nextP = modeState.players[nextIdx];
        return {
          mode: "drink",
          playerLabel: cur ? cur.name : "",
          isPartyOrChaosNext: true,
          nextBtnText: `🍻 NÆSTE SPILLER: ${nextP.name} ➔`,
          showSwitch: false
        };
      }
      return {
        mode: "drink",
        playerLabel: "Drukspil Solo",
        isPartyOrChaosNext: true,
        nextBtnText: "🍻 NÆSTE TUR (NYT SPIL) ➔",
        showSwitch: false
      };
    }

    if (isMultiplayer()) {
      const ended = shouldEndMultiplayerSession();
      if (ended) {
        return {
          mode: modeState.mode,
          playerLabel: cur ? cur.name : "",
          isPartyOrChaosNext: true,
          nextBtnText: "🏆 SE PARTY SLUTRESULTAT ➔",
          showSwitch: false,
          extraNote: state.balance === 0 ? `${cur.name} ramte 0 og er SIKKER!` : state.debtBusted ? `${cur.name} bustede!` : ""
        };
      }
      const nextIdx = findNextActivePlayerIndex(modeState.turnIndex);
      const nextP = modeState.players[nextIdx];
      return {
        mode: modeState.mode,
        playerLabel: cur ? cur.name : "",
        isPartyOrChaosNext: true,
        nextBtnText: isChaosEnabled()
          ? `🌪️ NÆSTE KAOS-TUR: ${nextP.name} ➔`
          : modeState.mode === "hardcore"
            ? `🔥 NÆSTE SPILLER: ${nextP.name} ➔`
            : `👥 NÆSTE SPILLER: ${nextP.name} ➔`,
        showSwitch: true,
        extraNote: state.balance === 0
          ? `🏆 ${cur.name} er ude & sikker på 0 tårer!`
          : state.debtBusted
            ? `💀 ${cur.name} nåede gældsgrænsen og skal cashe ${state.balance} ud!`
            : ""
      };
    }

    const soloBadges = [];
    if (modeState.mode === "hardcore") soloBadges.push("🔥 Hardcore");
    if (isChaosEnabled()) soloBadges.push("🌪️ Kaos");

    return {
      mode: modeState.mode,
      playerLabel: soloBadges.join(" · "),
      isPartyOrChaosNext: false,
      showSwitch: true
    };
  }

  function showPartyFinalSummary() {
    const sorted = [...modeState.players].sort((a, b) => a.balance - b.balance);
    const winners = sorted.filter(p => p.balance === 0);
    const busted = sorted.filter(p => p.status === "busted");
    const lastActive = sorted.filter(p => p.status === "active");

    const zeroTitle = $("#zeroTitle");
    const zeroDesc = $("#zeroDesc");
    if (winners.length) {
      zeroTitle.textContent = winners.length > 1 ? "Party Vindere!" : `${winners[0].name} Vandt!`;
    } else {
      zeroTitle.textContent = "Party Afsluttet!";
    }

    const lines = sorted.map(p => {
      const tag = p.balance === 0 ? "🏆 Sikker (0)" : p.status === "busted" ? `💀 Bust (${p.balance})` : `⏳ Tilbage (${p.balance})`;
      return `<div style="display:flex;justify-content:space-between;padding:6px 8px;background:rgba(255,255,255,.04);border-radius:8px;margin-bottom:4px;font-size:13px"><strong>${p.name}</strong><span>${tag}</span></div>`;
    }).join("");

    let bottomNote = "";
    if (busted.length) bottomNote = `Taber-straf til: ${busted.map(p => `${p.name} (${p.balance})`).join(", ")}.`;
    else if (lastActive.length === 1) bottomNote = `${lastActive[0].name} er sidst tilbage med ${lastActive[0].balance} tårer!`;

    zeroDesc.innerHTML = `<div style="text-align:left;margin:10px 0">${lines}</div><div>${bottomNote}</div>`;
    $("#zeroOverlay").classList.add("show");
    beep(820, 0.25, 0.05);
    confetti();
  }

  const SURPRISE_EVENTS = [
    {
      id: "toast",
      icon: "🍻",
      badge: "⚡ FÆLLES SKÅL!",
      title: "Pludselig Skål!",
      color: "#ffc857",
      condition: () => true,
      run: () => {
        if (isDrinkMode()) {
          modeState.players.forEach(p => { p.drunk += 1; });
        }
        pushHistory("🍻 OVERRASKELSE: Fælles skål — alle tog 1 tår!");
        return {
          headline: "🍻 ALLE SKÅLER (1 TÅR NU!)",
          desc: "Hele selskabet skåler med det samme og tager 1 hurtig tår sammen!"
        };
      }
    },
    {
      id: "double_next",
      icon: "⚡",
      badge: "⚡ DOBBELT OP!",
      title: "Strømstød i næste tur!",
      color: "#a578ff",
      condition: () => true,
      run: () => {
        modeState.pendingBuff = "double";
        pushHistory("⚡ OVERRASKELSE: Næste runde tæller 2×!");
        return {
          headline: "⚡ NÆSTE TUR TÆLLER 2×!",
          desc: "Både din næste gevinst og dit næste tab bliver fordoblet!"
        };
      }
    },
    {
      id: "shield_next",
      icon: "🛡️",
      badge: "🛡️ SUMPENS SKJOLD!",
      title: "Gratis Beskyttelse!",
      color: "#45d483",
      condition: () => true,
      run: () => {
        modeState.pendingBuff = "shield";
        pushHistory("🛡️ OVERRASKELSE: Gratis beskyttelsesskjold til næste tur!");
        return {
          headline: "🛡️ SKJOLD AKTIVT NÆSTE TUR!",
          desc: "Hvis du taber næste runde, halverer eller blokerer skjoldet straffen automatisk."
        };
      }
    },
    {
      id: "bonus_gift",
      icon: "🎁",
      badge: "🎁 UVENTET GAVE!",
      title: "Shrek er i godt humør!",
      color: "#45d483",
      condition: () => isDrinkMode() || state.balance > 1,
      run: () => {
        const cur = currentPlayer();
        if (isDrinkMode()) {
          if (cur) cur.given += 2;
          pushHistory(`🎁 OVERRASKELSE: ${cur ? cur.name : "Du"} må straks uddele 2 bonus-tårer!`);
          return {
            headline: "🎁 UDDEL 2 TÅRER NU!",
            desc: `${cur ? cur.name : "Du"} får en pludselig gave — uddel 2 ekstra tårer til hvem som helst!`
          };
        }
        state.balance = Math.max(1, state.balance - 1);
        syncCurrentPlayerPool(state.balance);
        pushHistory(`🎁 OVERRASKELSE: ${cur ? cur.name : "Du"} fik -1 gratis tår fra puljen!`);
        return {
          headline: "🎁 -1 TÅR FJERNET FRA PULJEN!",
          desc: "Sump-bonus! Du får fjernet 1 punkt fra din aktuelle pulje uden at spille."
        };
      }
    },
    {
      id: "croc_ambush",
      icon: "🐊",
      badge: "🐊 KROKODILLE-BAGHOLD!",
      title: "Snip-snap i pausen!",
      color: "#ff6475",
      condition: () => isDrinkMode() || state.balance < getBustLimit() - 1,
      run: () => {
        const cur = currentPlayer();
        if (isDrinkMode()) {
          if (cur) cur.drunk += 1;
          pushHistory(`🐊 OVERRASKELSE: Krokodille-baghold — ${cur ? cur.name : "Du"} drak 1 tår!`);
          return {
            headline: "🐊 DRIK 1 HURTIG TÅR NU!",
            desc: `${cur ? cur.name : "Du"} blev nappet af en vild krokodille mellem runderne!`
          };
        }
        state.balance = state.balance + 1;
        syncCurrentPlayerPool(state.balance);
        pushHistory(`🐊 OVERRASKELSE: Krokodille-baghold — +1 straf til ${cur ? cur.name : "dig"}!`);
        return {
          headline: "🐊 +1 STRAFTÅR TIL PULJEN!",
          desc: "En krokodille snuppede dig mellem spillene (+1 lagt på puljen)!"
        };
      }
    },
    {
      id: "swap_pool",
      icon: "🔄",
      badge: "🔄 PULJE-BYTTE!",
      title: "Kaos mellem spillere!",
      color: "#5ea1ff",
      condition: () => !isDrinkMode() && isMultiplayer() && activePlayers().length >= 2,
      run: () => {
        const cur = currentPlayer();
        const others = activePlayers().filter(p => p.id !== cur.id);
        const other = others[Math.floor(Math.random() * others.length)];
        const tmp = cur.balance;
        cur.balance = other.balance;
        other.balance = tmp;
        state.balance = cur.balance;
        pushHistory(`🔄 OVERRASKELSE: ${cur.name} (${cur.balance}) byttede pulje med ${other.name} (${other.balance})!`);
        return {
          headline: `🔄 ${cur.name} BYTTEDE PULJE MED ${other.name}!`,
          desc: `${cur.name} har nu ${cur.balance} tårer · ${other.name} har nu ${other.balance} tårer.`
        };
      }
    },
    {
      id: "force_swamp",
      icon: "👹",
      badge: "👹 TVUNGET BONUS-SPIL!",
      title: "Du bliver trukket i sumpen!",
      color: "#ff9f43",
      condition: () => registry.has("shrek") && registry.has("croc"),
      run: () => {
        const forced = Math.random() < 0.5 ? "shrek" : "croc";
        state.game = forced;
        const g = registry.get(forced);
        pushHistory(`👹 OVERRASKELSE: Næste runde er tvunget til ${g.icon} ${g.name}!`);
        return {
          headline: `NÆSTE SPIL: ${g.icon} ${g.name.toUpperCase()}!`,
          desc: "Skæbnen har overtaget kontrollen og tvinger dig ind i dette minispil lige nu!",
          forcedArena: true
        };
      }
    },
    {
      id: "table_rule",
      icon: "😜",
      badge: "⚡ BORD-TWIST!",
      title: "Hurtig mini-udfordring!",
      color: "#eb63cf",
      condition: () => true,
      run: () => {
        const twists = [
          "Den der sidst drak vand eller rørte sin telefon tager 1 tår nu!",
          "Personen til venstre for den der holder telefonen uddeler 2 tårer!",
          "Alle der griner eller smiler lige nu drikker 1 tår!"
        ];
        const chosen = twists[Math.floor(Math.random() * twists.length)];
        pushHistory(`😜 OVERRASKELSE: ${chosen}`);
        return {
          headline: "😜 UDFØR REGELEN NU!",
          desc: chosen
        };
      }
    }
  ];

  const SOCIAL_PROMPTS = [
    // 9 hurtige gætte- & sidekammerat-opgaver (uden akavet teater)
    {
      id: "left_drink",
      kind: "challenge",
      icon: "🍹",
      title: "Bartender-test",
      text: "Lav en drink til personen til venstre for dig!",
      sub: "Hvis personen kan lide den → giv 2 tårer ud! Hvis ikke → tag selv 2 tårer.",
      winGive: 2,
      failDrink: 2
    },
    {
      id: "alpha_color",
      kind: "challenge",
      icon: "🎨",
      title: "Umuligt Gæt!",
      text: "På en skala fra 1–10: Hvad er personen til venstres yndlingsfarve i alfabetet?",
      sub: "Svarer du rigtigt (eller får selskabet til at godkende svaret) → giv 2 tårer ud! Forkert → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "battery_guess",
      kind: "challenge",
      icon: "🔋",
      title: "Batteri-gæt",
      text: "Gæt hvor mange % batteri personen til højre for dig har på sin telefon lige nu (inden for ±8%)!",
      sub: "Rammer du inden for ±8% → giv 2 tårer ud! Ved siden af → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "guess_time",
      kind: "challenge",
      icon: "⌚",
      title: "Indre Ur",
      text: "Gæt hvad klokken er lige nu inden for ±3 minutter (uden at kigge på nogen skærm)!",
      sub: "Rammer du inden for 3 min → giv 2 tårer ud! Ved siden af → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "notif_guess",
      kind: "challenge",
      icon: "📩",
      title: "Låseskærm-gæt",
      text: "Gæt hvor mange ulæste beskeder eller notifikationer personen til venstre har på skærmen lige nu (inden for ±3)!",
      sub: "Rammer du inden for ±3 → giv 2 tårer ud! Ellers → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "pizza_guess",
      kind: "challenge",
      icon: "🍕",
      title: "Pizza-profil",
      text: "Gæt hvilken pizza personen til højre for dig næsten altid bestiller!",
      sub: "Rigtigt → giv 2 tårer ud! Forkert → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "rps_side",
      kind: "challenge",
      icon: "✊",
      title: "Lyn-duel",
      text: "Spil én hurtig runde Sten-Saks-Papir mod personen til venstre for dig!",
      sub: "Vinder du → giv 2 tårer ud! Taber du → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "mobilepay_guess",
      kind: "challenge",
      icon: "💸",
      title: "MobilePay-gæt",
      text: "Gæt ca. hvor meget personen overfor dig sidst sendte eller betalte på MobilePay (inden for ±50 kr.)!",
      sub: "Inden for ±50 kr. → giv 2 tårer ud! Ellers → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "last_app",
      kind: "challenge",
      icon: "📱",
      title: "Sidste App",
      text: "Gæt den sidste app personen til venstre for dig havde åben før dette spil!",
      sub: "Rigtigt → giv 2 tårer ud! Forkert → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    // 9 skøre & ironiske spørgsmål
    {
      id: "coolest",
      kind: "question",
      icon: "😎",
      title: "Dagens Spørgsmål",
      text: "Fortæl de andre i selskabet, hvorfor du er den sejeste!",
      sub: "Giv dit bedste bud — eller spring over for 2 tårer.",
      skipDrink: 2
    },
    {
      id: "animal_fight",
      kind: "question",
      icon: "🐻",
      title: "Skørt Spørgsmål",
      text: "Hvad er det største dyr, du er 100% sikker på du kunne tæske i en slåskamp — uden våben?",
      sub: "Bordet vurderer om du overdriver!",
      skipDrink: 2
    },
    {
      id: "five_year_olds",
      kind: "question",
      icon: "🥊",
      title: "Skørt Spørgsmål",
      text: "Hvor mange 5-årige kunne du realistisk set kæmpe imod på én gang, før de fik dig ned?",
      sub: "Forklar din taktik kort!",
      skipDrink: 2
    },
    {
      id: "one_fastfood",
      kind: "question",
      icon: "🍔",
      title: "Skørt Spørgsmål",
      text: "Hvis du kun måtte spise én ret resten af livet — og kun fra én fastfood-kæde — hvad vælger du?",
      sub: "Står du ved dit valg?",
      skipDrink: 2
    },
    {
      id: "night_buy",
      kind: "question",
      icon: "🛒",
      title: "Natte-indkøb",
      text: "Hvad er det dummeste eller mærkeligste impulskøb, du har lavet sent om natten?",
      sub: "Fortæl historien kort!",
      skipDrink: 2
    },
    {
      id: "food_opinion",
      kind: "question",
      icon: "🍍",
      title: "Upopulær Holdning",
      text: "Hvad er din mest kontroversielle holdning til mad eller drikkelse (fx ananas på pizza eller lunkent øl)?",
      sub: "Forsvar din smag for bordet!",
      skipDrink: 2
    },
    {
      id: "roadtrip_12h",
      kind: "question",
      icon: "🚗",
      title: "12-Timers Bil-tur",
      text: "Hvis du kun måtte tage én person her fra bordet med på et 12-timers roadtrip — hvem vælger du og hvorfor?",
      sub: "Vælg taktisk!",
      skipDrink: 2
    },
    {
      id: "ten_mil",
      kind: "question",
      icon: "💰",
      title: "10 Mio. På Kontoen",
      text: "Hvis du vågnede op med 10 millioner kr. i morgen, hvad er den første totalt ligegyldige ting du køber?",
      sub: "Ingen fornuftige svar som 'investere i aktier'!",
      skipDrink: 2
    },
    {
      id: "worst_at_left",
      kind: "question",
      icon: "😂",
      title: "Ironisk Spørgsmål",
      text: "Hvad tror du personen til venstre for dig er absolut værst til her i livet?",
      sub: "Gæt med et smil!",
      skipDrink: 2
    },
    // +11 nye hurtige gætte- & sidekammerat-opgaver (ialt 20)
    {
      id: "shoe_size_right",
      kind: "challenge",
      icon: "👟",
      title: "Skostørrelse-gæt",
      text: "Gæt personen til højre for digs præcise skostørrelse inden for ±1 nummer!",
      sub: "Inden for ±1 → giv 2 tårer ud! Ved siden af → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "last_emoji_left",
      kind: "challenge",
      icon: "😜",
      title: "Seneste Emoji",
      text: "Gæt en af de 3 senest brugte emojis på personen til venstres tastatur!",
      sub: "Rammer du én af de 3 → giv 2 tårer ud! Ellers → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "photo_count",
      kind: "challenge",
      icon: "📸",
      title: "Kamerarulle-gæt",
      text: "Gæt hvor mange billeder personen overfor dig har i sin kamerarulle (inden for ±500)!",
      sub: "Inden for ±500 → giv 2 tårer ud! Ellers → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "mom_letter",
      kind: "challenge",
      icon: "🔠",
      title: "Fornavns-gæt",
      text: "Gæt hvilken af disse 3 bogstaver personen til venstres mors fornavn starter med (eller få 3 gæt på hele alfabetet)!",
      sub: "Rigtigt på max 3 gæt → giv 2 tårer ud! Forkert → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "last_takeaway",
      kind: "challenge",
      icon: "🥡",
      title: "Takeaway-gæt",
      text: "Gæt hvad personen til højre for dig sidst bestilte af fastfood eller take-away!",
      sub: "Rigtigt (eller tæt nok!) → giv 2 tårer ud! Forkert → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "mind_number",
      kind: "challenge",
      icon: "🔮",
      title: "Tankelæser (1–5)",
      text: "Personen til venstre tænker på et tal fra 1 til 5. Gæt tallet på 2 forsøg!",
      sub: "Rammer du → giv 2 tårer ud! Misser du → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "height_guess",
      kind: "challenge",
      icon: "📏",
      title: "Højde-gæt",
      text: "Gæt personen til højres højde i centimeter inden for ±3 cm!",
      sub: "Inden for ±3 cm → giv 2 tårer ud! Ved siden af → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "wake_time",
      kind: "challenge",
      icon: "⏰",
      title: "Morgen-gæt",
      text: "Gæt hvornår personen overfor dig vågnede i morges inden for ±30 minutter!",
      sub: "Inden for ±30 min → giv 2 tårer ud! Forkert → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "tabs_count",
      kind: "challenge",
      icon: "🌐",
      title: "Browser-faner",
      text: "Gæt om personen til venstre har OVER eller UNDER 15 åbne faner i sin telefon-browser lige nu!",
      sub: "Rigtigt → giv 2 tårer ud! Forkert → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "screen_time",
      kind: "challenge",
      icon: "📲",
      title: "Skærmtid-duel",
      text: "Gæt hvem af dig og personen til højre, der har HØJEST daglig skærmtid i snit denne uge!",
      sub: "Rigtigt → giv 2 tårer ud! Forkert → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    {
      id: "coin_mental",
      kind: "challenge",
      icon: "🪙",
      title: "Hoved-plat",
      text: "Personen til højre vælger hemmeligt Krone eller Plat i hovedet — gæt hvad de valgte!",
      sub: "Rigtigt → giv 2 tårer ud! Forkert → tag 1 tår selv.",
      winGive: 2,
      failDrink: 1
    },
    // +11 nye skøre & ironiske spørgsmål (ialt 20)
    {
      id: "dumbest_injury",
      kind: "question",
      icon: "🩹",
      title: "Skørt Spørgsmål",
      text: "Hvad er den dummeste eller mest pinligt ligegyldige måde, du nogensinde er kommet til skade på?",
      sub: "Kort historie til bordet!",
      skipDrink: 2
    },
    {
      id: "useless_expert",
      kind: "question",
      icon: "🎓",
      title: "Skørt Spørgsmål",
      text: "Hvilket fuldstændig ubrugeligt emne kunne du holde et 20 minutters foredrag om uden forberedelse?",
      sub: "Vis din indre nørd frem!",
      skipDrink: 2
    },
    {
      id: "pet_talk",
      kind: "question",
      icon: "🐶",
      title: "Ironisk Spørgsmål",
      text: "Hvis din hund, kat eller roomie kunne sladre om dig lige nu, hvad ville det første de sagde være?",
      sub: "Vær ærlig!",
      skipDrink: 2
    },
    {
      id: "heist_left",
      kind: "question",
      icon: "🦝",
      title: "Selskabets Kup",
      text: "Hvis du og personen til venstre skulle stjæle noget fuldstændig ubrugeligt (værdi under 50 kr.), hvad ville I gå efter?",
      sub: "Planlæg kuppet på 10 sekunder!",
      skipDrink: 2
    },
    {
      id: "worst_gift",
      kind: "question",
      icon: "🎁",
      title: "Skørt Spørgsmål",
      text: "Hvad er den mærkeligste eller dårligste gave, du nogensinde har fået (og måtte lade som om du blev glad for)?",
      sub: "Ingen ved bordet dømmer dig!",
      skipDrink: 2
    },
    {
      id: "survival_minutes",
      kind: "question",
      icon: "🧟",
      title: "Zombie-test",
      text: "Hvor mange timer ville du realistisk set overleve i en zombie-apokalypse, før du lavede en dum fejl?",
      sub: "Giv et ærligt gæt!",
      skipDrink: 2
    },
    {
      id: "pointless_company",
      kind: "question",
      icon: "💼",
      title: "Skørt Firma",
      text: "Hvis dig og personen til højre skulle starte et totalt åndssvagt firma sammen i morgen, hvad skulle I sælge?",
      sub: "Giv jeres bedste pitch!",
      skipDrink: 2
    },
    {
      id: "food_ban",
      kind: "question",
      icon: "🚫",
      title: "Skørt Spørgsmål",
      text: "Hvis du kunne forbyde én helt almindelig ting som alle andre elsker (fx koriander eller crocs), hvad ryger ud?",
      sub: "Forklar dit had!",
      skipDrink: 2
    },
    {
      id: "fake_iq",
      kind: "question",
      icon: "🧠",
      title: "Selvtillids-test",
      text: "Hvad er én simpel ting, du er overbevist om du er bedre til end alle andre her ved bordet?",
      sub: "Prøv at overbevise de andre!",
      skipDrink: 2
    },
    {
      id: "bad_advice",
      kind: "question",
      icon: "📣",
      title: "Ironisk Råd",
      text: "Hvad er det værste men sjoveste råd, du nogensinde har givet (eller fulgt) til en fest?",
      sub: "Del visdommen!",
      skipDrink: 2
    },
    {
      id: "search_history",
      kind: "question",
      icon: "🔍",
      title: "Google-gæt",
      text: "Hvad er det mest mærkelige eller random spørgsmål, du har googlet i denne uge?",
      sub: "Indrøm det nu bare!",
      skipDrink: 2
    },
    // 20 sjove "Vil du helst...?" dilemmaer
    {
      id: "wyr_battery_water",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst altid maks have 3% batteri på din telefon — eller kun kunne drikke lunkent vand resten af livet?",
      sub: "Vælg én og forsvar dit valg!",
      skipDrink: 2
    },
    {
      id: "wyr_frikadelle_spoon",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst altid lugte svagt af frikadelle — eller kun måtte spise al mad med en teske resten af livet?",
      sub: "Begge lyder træls — hvad vælger du?",
      skipDrink: 2
    },
    {
      id: "wyr_gps_sms",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst altid tale med GPS-stemme — eller at alle dine SMS'er automatisk blev læst højt på højttaler?",
      sub: "Vælg side!",
      skipDrink: 2
    },
    {
      id: "wyr_fries_cheese",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst aldrig mere spise pommes frites — eller aldrig mere spise smeltet ost (pizza inkl.)?",
      sub: "Tænk dig godt om!",
      skipDrink: 2
    },
    {
      id: "wyr_wet_socks",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst altid have let fugtige strømper på — eller altid have en myg i soveværelset når du skal sove?",
      sub: "Pure tortur — vælg én!",
      skipDrink: 2
    },
    {
      id: "wyr_loud_whisper",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst kun kunne tale ved at råbe 30% for højt — eller kun kunne hviske resten af livet?",
      sub: "Hvordan klarer du den på arbejde/skole?",
      skipDrink: 2
    },
    {
      id: "wyr_music_one_song",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst aldrig mere høre musik — eller kun måtte høre én bestemt sang på repeat resten af livet?",
      sub: "Og hvilken sang hvis du vælger den?",
      skipDrink: 2
    },
    {
      id: "wyr_duck_horse",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst kæmpe imod én and på størrelse med en hest — eller 100 heste på størrelse med ænder?",
      sub: "Klassikeren — forklar din kampplan!",
      skipDrink: 2
    },
    {
      id: "wyr_teleport_late",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst kunne teleportere hvorhen du vil (men altid komme 15 min for sent) — eller aldrig sidde i kø i trafikken?",
      sub: "Vælg superkraft!",
      skipDrink: 2
    },
    {
      id: "wyr_no_bed_shower",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst aldrig mere sove med dyne — eller kun måtte tage iskolde brusebade resten af livet?",
      sub: "Hvad overlever du bedst?",
      skipDrink: 2
    },
    {
      id: "wyr_tooth_hands",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst have tænder lavet af blødt gummi — eller altid have 12 fingre på hver hånd?",
      sub: "Vælg hurtigt!",
      skipDrink: 2
    },
    {
      id: "wyr_free_food_flights",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst få gratis take-away for livet — eller gratis flybilletter resten af livet?",
      sub: "Pengepungen skal vælge!",
      skipDrink: 2
    },
    {
      id: "wyr_pause_rewind",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst kunne pause tiden i 10 minutter om dagen — eller spole 10 sekunder tilbage når du siger noget dumt?",
      sub: "Hvilken knap redder dig mest?",
      skipDrink: 2
    },
    {
      id: "wyr_internet_no_phone",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst have super hurtigt internet uden mobil — eller en iPhone uden internet?",
      sub: "Vælg skærm-skæbne!",
      skipDrink: 2
    },
    {
      id: "wyr_hiccups_sneeze",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst have hikke i 10 minutter hver dag kl. 14 — eller nyse hver eneste gang du bliver glad?",
      sub: "Begge er irriterende — vælg!",
      skipDrink: 2
    },
    {
      id: "wyr_ketchup_hair",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst have skriggrønt hår i 2 år — eller kun måtte gå i crocs til alle fester i 2 år?",
      sub: "Mode eller værdighed!",
      skipDrink: 2
    },
    {
      id: "wyr_read_minds_animals",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst kunne læse folks tanker (men du kan ikke slå det fra) — eller kunne tale flydende med duer og måger?",
      sub: "Hvem vil du helst snakke med?",
      skipDrink: 2
    },
    {
      id: "wyr_coffee_beer",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst aldrig mere drikke kaffe/energidrik — eller aldrig mere spise chokolade/slik?",
      sub: "Hård prioritering!",
      skipDrink: 2
    },
    {
      id: "wyr_laugh_cry",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst grine ukontrolleret hver gang nogen falder — eller altid græde når du ser en sød hund?",
      sub: "Begge er ret realistiske!",
      skipDrink: 2
    },
    {
      id: "wyr_rich_ugly_hair",
      kind: "question",
      icon: "🤔",
      title: "Vil du helst...?",
      text: "Vil du helst vinde 5 millioner kr. i morgen (men med permanent grydehår i 5 år) — eller beholde dit liv præcis som nu?",
      sub: "Skål på det!",
      skipDrink: 2
    }
  ];

  function drawSocialPrompt() {
    if (!modeState.promptBag.length) {
      modeState.promptBag = Array.from({ length: SOCIAL_PROMPTS.length }, (_, i) => i);
      for (let i = modeState.promptBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [modeState.promptBag[i], modeState.promptBag[j]] = [modeState.promptBag[j], modeState.promptBag[i]];
      }
      if (modeState.promptBag.length > 1 && SOCIAL_PROMPTS[modeState.promptBag[modeState.promptBag.length - 1]].id === modeState.lastPromptId) {
        const last = modeState.promptBag.length - 1;
        [modeState.promptBag[last], modeState.promptBag[0]] = [modeState.promptBag[0], modeState.promptBag[last]];
      }
    }
    const idx = modeState.promptBag.pop();
    const chosen = SOCIAL_PROMPTS[idx];
    modeState.lastPromptId = chosen.id;
    return chosen;
  }

  function finishBetweenRoundModal(modal, forceArena, action) {
    modal.classList.remove("show");
    setBusy(false);
    updateDebtUI();
    syncWagerUI();
    if (forceArena || isDrinkMode() || action === "stay") {
      Arcade.app.renderActiveGame();
      Arcade.app.switchView("arena");
    } else if (action === "switch") {
      Arcade.app.switchView("games");
    }
  }

  function openSurprisePopup(action, forcedArenaFromCaller) {
    const modal = $("#surpriseModal");
    if (!modal) return false;

    const pool = SURPRISE_EVENTS.filter(ev => ev.condition());
    if (!pool.length) return false;
    const ev = pool[Math.floor(Math.random() * pool.length)];
    modeState.lastBetweenPopupTurn = modeState.turnCount;

    const out = ev.run();
    const card = $("#surpriseModalCard");
    if (card) card.style.setProperty("--outcome-color", ev.color || "#a578ff");
    if ($("#surpriseBadge")) $("#surpriseBadge").textContent = ev.badge;
    if ($("#surpriseIcon")) $("#surpriseIcon").textContent = ev.icon;
    if ($("#surpriseTitle")) $("#surpriseTitle").textContent = ev.title;
    if ($("#surpriseHeadline")) {
      $("#surpriseHeadline").textContent = out.headline;
      $("#surpriseHeadline").style.color = ev.color || "#a578ff";
    }
    if ($("#surpriseDesc")) $("#surpriseDesc").textContent = out.desc;

    setBusy(true);
    updateDebtUI();
    syncWagerUI();
    modal.classList.add("show");
    beep(ev.id === "croc_ambush" ? 210 : 780, 0.14, 0.035);
    if (ev.id === "bonus_gift" || ev.id === "shield_next") confetti();

    const forceArena = Boolean(out.forcedArena) || forcedArenaFromCaller;
    const btn = $("#surpriseContinueBtn");
    if (btn) {
      btn.onclick = () => finishBetweenRoundModal(modal, forceArena, action);
    }
    return true;
  }

  function openPromptPopup(action, forcedArenaFromCaller) {
    const modal = $("#promptModal");
    if (!modal) return false;

    const prompt = drawSocialPrompt();
    if (!prompt) return false;
    modeState.lastBetweenPopupTurn = modeState.turnCount;

    const cur = currentPlayer();
    const isChallenge = prompt.kind === "challenge";
    const accent = isChallenge ? "#f59e0b" : "#38bdf8";

    const card = $("#promptModalCard");
    if (card) card.style.setProperty("--outcome-color", accent);
    if ($("#promptBadge")) $("#promptBadge").textContent = isChallenge ? "🎯 UDFORDRING!" : "💬 SPØRGSMÅL!";
    if ($("#promptIcon")) $("#promptIcon").textContent = prompt.icon;
    if ($("#promptTitle")) $("#promptTitle").textContent = prompt.title;
    const playerSub = $("#promptPlayerSub");
    if (playerSub) {
      if (isMultiplayer() && cur) {
        playerSub.textContent = `Gælder nu: ${cur.name}`;
        playerSub.style.display = "block";
      } else {
        playerSub.style.display = "none";
      }
    }
    if ($("#promptHeadline")) {
      $("#promptHeadline").textContent = prompt.text;
      $("#promptHeadline").style.color = "#fff";
    }
    if ($("#promptDesc")) $("#promptDesc").textContent = prompt.sub || "";

    const sucBtn = $("#promptSuccessBtn");
    const failBtn = $("#promptFailBtn");
    const ansBtn = $("#promptAnswerBtn");
    const skipBtn = $("#promptSkipBtn");

    [sucBtn, failBtn, ansBtn, skipBtn].forEach(b => { if (b) b.classList.add("hidden"); });

    if (isChallenge) {
      const wg = prompt.winGive || 2;
      const fd = prompt.failDrink || 1;
      if (sucBtn) {
        sucBtn.classList.remove("hidden");
        sucBtn.textContent = `✅ KLARET! GIV ${wg} ${wg === 1 ? "TÅR" : "TÅRER"} UD`;
        sucBtn.onclick = () => {
          if (isDrinkMode() && cur) cur.given += wg;
          pushHistory(`✅ ${cur ? cur.name : "Du"} klarede udfordring: Giv ${wg} ${wg === 1 ? "tår" : "tårer"} ud!`);
          confetti();
          beep(840, 0.11, 0.03);
          finishBetweenRoundModal(modal, forcedArenaFromCaller, action);
        };
      }
      if (failBtn) {
        failBtn.classList.remove("hidden");
        failBtn.textContent = `❌ FEJLET! TAG ${fd} ${fd === 1 ? "TÅR" : "TÅRER"} SELV`;
        failBtn.onclick = () => {
          if (isDrinkMode() && cur) cur.drunk += fd;
          pushHistory(`❌ ${cur ? cur.name : "Du"} fejlede udfordring: Tag ${fd} ${fd === 1 ? "tår" : "tårer"} selv.`);
          beep(220, 0.14, 0.035);
          finishBetweenRoundModal(modal, forcedArenaFromCaller, action);
        };
      }
    } else {
      const sd = prompt.skipDrink || 2;
      if (ansBtn) {
        ansBtn.classList.remove("hidden");
        ansBtn.onclick = () => {
          pushHistory(`💬 ${cur ? cur.name : "Du"} svarede: "${prompt.text}"`);
          beep(680, 0.08, 0.025);
          finishBetweenRoundModal(modal, forcedArenaFromCaller, action);
        };
      }
      if (skipBtn) {
        skipBtn.classList.remove("hidden");
        skipBtn.textContent = `🙈 SPRINGER OVER · TAG ${sd} TÅRER`;
        skipBtn.onclick = () => {
          if (isDrinkMode() && cur) cur.drunk += sd;
          pushHistory(`🙈 ${cur ? cur.name : "Du"} sprang spørgsmål over (+${sd} tårer).`);
          beep(220, 0.12, 0.03);
          finishBetweenRoundModal(modal, forcedArenaFromCaller, action);
        };
      }
    }

    setBusy(true);
    updateDebtUI();
    syncWagerUI();
    modal.classList.add("show");
    beep(660, 0.1, 0.03);
    return true;
  }

  function maybeTriggerSurprise(action, forcedArenaFromCaller = false) {
    if (modeState.mode === "duel") return false;
    if (!modeState.surprisesEnabled && !modeState.challengesEnabled) return false;
    if (modeState.turnCount - modeState.lastBetweenPopupTurn < 2) return false;

    const both = modeState.surprisesEnabled && modeState.challengesEnabled;
    const chance = both ? 0.35 : 0.28;
    if (Math.random() >= chance) return false;

    if (both) {
      return Math.random() < 0.5
        ? openSurprisePopup(action, forcedArenaFromCaller)
        : openPromptPopup(action, forcedArenaFromCaller);
    }
    if (modeState.surprisesEnabled) return openSurprisePopup(action, forcedArenaFromCaller);
    return openPromptPopup(action, forcedArenaFromCaller);
  }

  function handleAfterOutcome(action) {
    modeState.pendingBuff = null;
    modeState.turnCount += 1;

    if (isDrinkMode()) {
      if (isMultiplayer()) {
        modeState.turnIndex = (modeState.turnIndex + 1) % modeState.players.length;
      }
      rollDrinkTurn();
      if (maybeTriggerSurprise(action, true)) return true;
      setBusy(false);
      updateDebtUI();
      syncWagerUI();
      Arcade.app.renderActiveGame();
      Arcade.app.switchView("arena");
      return true;
    }

    if (isMultiplayer()) {
      if (shouldEndMultiplayerSession()) {
        showPartyFinalSummary();
        return true;
      }
      const nextIdx = findNextActivePlayerIndex(modeState.turnIndex);
      if (nextIdx !== -1) {
        modeState.turnIndex = nextIdx;
        const nextP = currentPlayer();
        state.balance = nextP.balance;
        state.debtBusted = false;
        state.roundEnding = false;
        state.higherStreak = 0;
        const arena = $("#arena");
        if (arena) arena.classList.remove("round-ending");

        if (isChaosEnabled()) {
          rollChaosModifier();
        }
        if (maybeTriggerSurprise(action, false)) return true;
        setBusy(false);
        updateDebtUI();
        syncWagerUI();
        if (action === "switch") {
          Arcade.app.switchView("games");
        } else {
          Arcade.app.renderActiveGame();
          Arcade.app.switchView("arena");
        }
        return true;
      }
    }

    // Classic & Hardcore solo: opdater evt. Kaos-modifier og træk overraskelse mellem runder
    if (state.balance > 0 && !state.debtBusted) {
      if (isChaosEnabled()) {
        rollChaosModifier();
        updateDebtUI();
        syncWagerUI();
      }
      if (maybeTriggerSurprise(action, false)) {
        return true;
      }
    }

    return false;
  }

  function renderHudExtras() {
    const pill = $("#hudModePill");
    const nameEl = $("#hudPlayerName");
    const ctxBanner = $("#contextBanner");

    if (pill) {
      const m = MODES[modeState.mode] || MODES.classic;
      pill.textContent = `${m.icon} ${m.name}${isChaosEnabled() ? " · 🌪️" : ""}`;
      pill.className = `hud-mode-pill ${modeState.mode}`;
    }

    if (nameEl) {
      if (isDrinkMode()) {
        const p = currentPlayer();
        nameEl.textContent = isMultiplayer() ? `${p.name}s tur` : `${p.drunk} 🍻 · ${p.given} 🎁`;
      } else if (isMultiplayer()) {
        const p = currentPlayer();
        nameEl.textContent = p ? `${p.name}s tur` : "Party";
      } else if (modeState.mode === "duel") {
        const p1 = modeState.players[0]?.name || "Spiller 1";
        const p2 = modeState.players[1]?.name || "Spiller 2";
        nameEl.textContent = `${p1} vs ${p2}`;
      } else if (modeState.mode === "hardcore") {
        nameEl.textContent = "Min 50% · +1 tab";
      } else {
        nameEl.textContent = "Solo pulje";
      }
    }

    if (ctxBanner) {
      const buffBadge = modeState.pendingBuff === "double"
        ? " · ⚡ 2× AKTIV"
        : modeState.pendingBuff === "shield"
          ? " · 🛡️ SKJOLD"
          : "";
      if (isDrinkMode()) {
        const p = currentPlayer();
        const s = modeState.turnStake;
        ctxBanner.className = "context-banner drink";
        ctxBanner.innerHTML = `<span>🍻 DENNE TUR: ${s} ${s === 1 ? "TÅR" : "TÅRER"} PÅ HØJKANT${buffBadge}</span><small style="opacity:.88;font-weight:800">${p.drunk} 🍻 · ${p.given} 🎁</small>`;
        ctxBanner.classList.remove("hidden");
      } else if (isChaosEnabled() && modeState.activeModifier) {
        ctxBanner.className = "context-banner chaos";
        ctxBanner.innerHTML = `<span>${modeState.activeModifier.label}${buffBadge}</span><small style="opacity:.85;font-weight:700">${modeState.activeModifier.desc}</small>`;
        ctxBanner.classList.remove("hidden");
      } else if (modeState.mode === "duel") {
        const p1 = modeState.players[0];
        const p2 = modeState.players[1];
        const label = modeState.duelSubMode === "quick"
          ? `⚔️ Hurtig Duel (${p1.name} vs ${p2.name})`
          : `⚔️ ${p1.name}: ${p1.balance}  |  ${p2.name}: ${p2.balance}`;
        ctxBanner.className = "context-banner duel";
        ctxBanner.innerHTML = `<span>${label}</span>`;
        ctxBanner.classList.remove("hidden");
      } else if (modeState.pendingBuff) {
        ctxBanner.className = "context-banner buff";
        ctxBanner.innerHTML = modeState.pendingBuff === "double"
          ? "<span>⚡ OVERRASKELSE: NÆSTE TUR TÆLLER 2×!</span>"
          : "<span>🛡️ OVERRASKELSE: SKJOLD HALVERER NÆSTE TAB!</span>";
        ctxBanner.classList.remove("hidden");
      } else {
        ctxBanner.classList.add("hidden");
      }
    }
  }

  function startModeSession(config) {
    modeState.mode = config.mode || "classic";
    modeState.classicSubMode = config.classicSubMode || "solo";
    modeState.hardcoreSubMode = config.hardcoreSubMode || "solo";
    modeState.drinkSubMode = config.drinkSubMode || "solo";
    modeState.drinkMaxStake = clamp(parseInt(config.drinkMaxStake || 5, 10), 1, 20);
    modeState.duelSubMode = config.duelSubMode || "pools";
    modeState.chaosEnabled = Boolean(config.chaosEnabled);
    modeState.surprisesEnabled = config.surprisesEnabled !== false;
    modeState.challengesEnabled = config.challengesEnabled !== false;
    modeState.turnCount = 0;
    modeState.lastBetweenPopupTurn = -2;
    modeState.pendingBuff = null;
    modeState.recentGames = [];
    modeState.promptBag = [];
    modeState.lastPromptId = null;

    if (modeState.mode === "drink" && modeState.drinkSubMode === "solo") {
      modeState.players = [{ id: 1, name: "Dig", balance: 10, status: "active", drunk: 0, given: 0 }];
    } else {
      modeState.players = (config.players || []).map((p, idx) => ({
        id: idx + 1,
        name: p.name.trim() || `Spiller ${idx + 1}`,
        balance: clamp(parseInt(p.balance || (modeState.mode === "hardcore" ? 8 : 4), 10), 1, getMaxStartPool()),
        status: "active",
        drunk: 0,
        given: 0
      }));
    }
    modeState.turnIndex = 0;
    modeState.activeModifier = null;
    modeState.lastDrinkResult = null;

    if (modeState.mode === "drink") {
      rollDrinkTurn();
    } else if (modeState.mode === "duel") {
      const curDef = registry.get(state.game);
      if (!curDef || !curDef.duel) state.game = "rps";
      state.balance = modeState.players[0].balance;
    } else if (isMultiplayer()) {
      state.balance = modeState.players[0].balance;
    } else {
      state.balance = clamp(parseInt(config.soloAmount || (modeState.mode === "hardcore" ? 8 : 4), 10), 1, getMaxStartPool());
    }

    if (modeState.mode !== "drink") {
      state.initialStakeCap = state.balance;
      state.desiredWager = modeState.mode === "hardcore"
        ? getMinWager(state.balance)
        : isMultiplayer()
          ? Math.min(2, state.balance)
          : state.balance;
    }
    state.debtBusted = false;
    state.roundEnding = false;
    state.higherStreak = 0;
    state.history = [];

    if (isChaosEnabled()) {
      rollChaosModifier();
    }

    $("#zeroTitle").textContent = "Du gik i 0";
    $("#zeroDesc").textContent = "Din nuværende pulje er væk. Runden er slut.";
  }

  // ==========================================================
  // DUEL 1V1 ENGINE (DEDICATED HEAD-TO-HEAD FLOW)
  // ==========================================================
  const DUEL_PRIVACY_GAMES = new Set(["rps", "coin", "redblack", "picknumber", "blackjack"]);

  async function requestDuelPrivacy(nextPlayerName, hintText) {
    return new Promise(resolve => {
      const overlay = $("#duelPrivacyOverlay");
      $("#duelPrivacyTitle").textContent = `Giv telefonen til ${nextPlayerName}`;
      $("#duelPrivacyDesc").textContent = hintText || "Tryk på knappen når du holder telefonen alene.";
      overlay.classList.add("show");
      $("#duelPrivacyBtn").onclick = () => {
        overlay.classList.remove("show");
        beep(640, 0.05, 0.02);
        resolve();
      };
    });
  }

  function showDuelOutcomeModal({ winnerIdx, isTie, title, desc, icon }) {
    const modal = $("#outcomeModal");
    if (!modal) return;
    const p1 = modeState.players[0];
    const p2 = modeState.players[1];
    const w = getWager();

    let badge = "⚔️ DUEL AFGJORT";
    let color = "#5ea1ff";
    let headline = "";
    let fullDesc = desc;

    if (isTie) {
      color = "#ffc857";
      badge = "🤝 UAFGJORT DUEL";
      headline = "INGEN ÆNDRING";
    } else {
      const winner = modeState.players[winnerIdx];
      const loser = modeState.players[1 - winnerIdx];
      color = "#45d483";
      badge = `🏆 ${winner.name.toUpperCase()} VANDT!`;

      if (modeState.duelSubMode === "quick") {
        headline = `🍻 ${loser.name} tager ${w} ${w === 1 ? "tår" : "tårer"}!`;
        fullDesc = `${desc} Hurtig Duel: ${loser.name} drikker/tager indsatsen direkte.`;
      } else {
        winner.balance = clamp(winner.balance - w, 0, 99);
        loser.balance = clamp(loser.balance + w, 0, 99);
        headline = `🛡️ ${winner.name} (-${w}) · 💀 ${loser.name} (+${w})`;
        fullDesc = `${desc} ${winner.name}: ${winner.balance} tårer · ${loser.name}: ${loser.balance} tårer.`;
      }
      pushHistory(`⚔️ Duel (${title}): ${headline}`);
    }

    const p1Won = modeState.duelSubMode === "pools" && p1.balance === 0;
    const p2Won = modeState.duelSubMode === "pools" && p2.balance === 0;
    const p1Bust = modeState.duelSubMode === "pools" && p1.balance >= 11;
    const p2Bust = modeState.duelSubMode === "pools" && p2.balance >= 11;
    const duelOver = p1Won || p2Won || p1Bust || p2Bust;

    let finalWinner = null;
    if (duelOver) {
      if (p1Won || p2Bust) finalWinner = p1;
      else finalWinner = p2;
      badge = `🏆 ${finalWinner.name.toUpperCase()} VANDT HELE DUELLEN!`;
      confetti();
    }

    const card = $("#outcomeModalCard");
    if (card) card.style.setProperty("--outcome-color", color);
    $("#outcomeBadge").textContent = badge;
    $("#outcomeIcon").textContent = icon || "⚔️";
    $("#outcomeTitle").textContent = title;
    $("#outcomeGameSub").textContent = `DUEL · ${p1.name} vs ${p2.name}`;
    $("#outcomeHeadline").textContent = headline;
    $("#outcomeHeadline").style.color = color;
    $("#outcomeDesc").textContent = fullDesc;
    $("#outcomeExtraRule").style.display = "none";
    $("#outcomeTransferBox").classList.add("hidden");

    $("#outcomePoolVal").textContent = modeState.duelSubMode === "quick" ? "Hurtig Duel" : `${p1.name}: ${p1.balance} | ${p2.name}: ${p2.balance}`;
    $("#outcomeChangeVal").textContent = isTie ? "0 tårer" : `±${w} tårer`;
    $("#outcomeChangeVal").style.color = isTie ? "#fff" : "var(--gold)";

    const mainBtn = $("#outcomeMainBtn");
    const switchBtn = $("#outcomeSwitchBtn");
    if (duelOver) {
      mainBtn.innerHTML = "🏆 AFSLUT & START NY RUNDE ➔";
      mainBtn.className = "btn primary outcome-modal-btn";
      switchBtn.style.display = "none";
      mainBtn.onclick = () => {
        modal.classList.remove("show");
        Arcade.app.resetToStart();
      };
    } else {
      mainBtn.innerHTML = "NY DUEL I DETTE SPIL ↺";
      mainBtn.className = "btn primary outcome-modal-btn";
      switchBtn.style.display = "block";
      switchBtn.innerHTML = "VÆLG ET ANDET DUEL-SPIL ⚔️";
      mainBtn.onclick = () => {
        modal.classList.remove("show");
        setBusy(false);
        updateDebtUI();
        Arcade.app.renderActiveGame();
      };
      switchBtn.onclick = () => {
        modal.classList.remove("show");
        setBusy(false);
        updateDebtUI();
        Arcade.app.switchView("games");
      };
    }

    if (!isTie) beep(840, 0.12, 0.03);
    else beep(540, 0.08, 0.025);
    modal.classList.add("show");
  }

  function renderDuelGame(gameId, container) {
    const p1 = modeState.players[0];
    const p2 = modeState.players[1];
    const { casinoCard, cardHtml, createCardElement, blackjackValue } = Arcade.cards;
    const { dieFace } = Arcade.dice;

    if (gameId === "rps") {
      let c1 = null;
      const rpsMap = { rock: "✊", paper: "✋", scissors: "✌️" };
      container.innerHTML = `
        ${Arcade.titleBlock("⚔️ Sten Saks Papir Duel", "Vælg hemmeligt efter tur, og afslør begge hænder samtidigt!")}
        <div class="center"><div class="duel-turn-chip" id="duelTurnChip">🎯 ${p1.name}s valg (hemmeligt)</div></div>
        <div class="rps-stage"><div class="rps-hand" id="duelRps1">❔</div><div style="font-weight:1000">VS</div><div class="rps-hand" id="duelRps2">❔</div></div>
        <div class="bet-picks">
          <button class="btn rpsPick" data-rps="rock">✊ STEN</button>
          <button class="btn rpsPick" data-rps="paper">✋ PAPIR</button>
          <button class="btn rpsPick" data-rps="scissors">✌️ SAKS</button>
        </div>`;
      container.querySelectorAll(".rpsPick").forEach(b => b.onclick = async () => {
        if (state.busy) return;
        const pick = b.dataset.rps;
        if (!c1) {
          c1 = pick;
          $("#duelRps1").textContent = "🔒";
          await requestDuelPrivacy(p2.name, `${p1.name} har valgt! Nu er det ${p2.name}s tur til at vælge hemmeligt.`);
          $("#duelTurnChip").textContent = `🎯 ${p2.name}s valg (hemmeligt)`;
        } else {
          const c2 = pick;
          setBusy(true);
          const h1 = $("#duelRps1"), h2 = $("#duelRps2");
          h1.textContent = "✊"; h2.textContent = "✊";
          h1.classList.add("shake"); h2.classList.add("shake");
          await sleep(650);
          h1.classList.remove("shake"); h2.classList.remove("shake");
          h1.textContent = rpsMap[c1]; h2.textContent = rpsMap[c2];
          const tie = c1 === c2;
          const p1Win = (c1 === "rock" && c2 === "scissors") || (c1 === "paper" && c2 === "rock") || (c1 === "scissors" && c2 === "paper");
          await sleep(380);
          showDuelOutcomeModal({
            isTie: tie,
            winnerIdx: p1Win ? 0 : 1,
            icon: "✊",
            title: tie ? "Uafgjort!" : `${p1Win ? p1.name : p2.name} vandt!`,
            desc: `${p1.name} (${rpsMap[c1]}) mod ${p2.name} (${rpsMap[c2]}).`
          });
        }
      });
      return true;
    }

    if (gameId === "dice") {
      let r1 = 0;
      const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
      container.innerHTML = `
        ${Arcade.titleBlock("⚔️ Terning Duel", "Slå højere end din modstander!")}
        <div class="center"><div class="duel-turn-chip" id="duelTurnChip">🎲 ${p1.name} kaster først</div></div>
        <div class="dice-pair">
          <div style="text-align:center"><div class="mini-die" id="duelDie1">❔</div><small style="display:block;margin-top:6px;color:var(--muted)">${p1.name}</small></div>
          <div style="font-weight:1000">VS</div>
          <div style="text-align:center"><div class="mini-die" id="duelDie2">❔</div><small style="display:block;margin-top:6px;color:var(--muted)">${p2.name}</small></div>
        </div>
        <button class="big-button" id="duelDiceBtn">KAST FOR ${p1.name.toUpperCase()}</button>`;
      $("#duelDiceBtn").onclick = async () => {
        if (state.busy) return;
        setBusy(true);
        const val = 1 + Math.floor(Math.random() * 6);
        const el = r1 === 0 ? $("#duelDie1") : $("#duelDie2");
        el.classList.remove("roll"); void el.offsetWidth; el.classList.add("roll");
        const id = setInterval(() => { el.textContent = faces[Math.floor(Math.random() * 6)]; beep(360, 0.02, 0.01); }, 85);
        await sleep(1050); clearInterval(id);
        el.textContent = faces[val - 1];
        beep(720, 0.09, 0.03);
        if (r1 === 0) {
          r1 = val;
          $("#duelTurnChip").textContent = `🎲 Nu kaster ${p2.name} (skal slå over ${r1})`;
          $("#duelDiceBtn").textContent = `KAST FOR ${p2.name.toUpperCase()}`;
          setBusy(false);
        } else {
          await sleep(360);
          showDuelOutcomeModal({
            isTie: r1 === val,
            winnerIdx: r1 > val ? 0 : 1,
            icon: "🎲",
            title: r1 === val ? `Uafgjort (${r1}-${val})` : `${r1 > val ? p1.name : p2.name} slog højest!`,
            desc: `${p1.name} slog ${r1} mod ${p2.name}s ${val}.`
          });
        }
      };
      return true;
    }

    if (gameId === "war") {
      container.innerHTML = `
        ${Arcade.titleBlock("⚔️ War Duel", "Hver spiller trækker ét kort. Højeste kort vinder duellen!")}
        <div class="war-stage">
          <div class="war-side"><div class="hand-label">${p1.name}</div><div id="duelWar1" class="hand"><div class="muted">?</div></div></div>
          <div class="war-side"><div class="hand-label">${p2.name}</div><div id="duelWar2" class="hand"><div class="muted">?</div></div></div>
        </div>
        <button class="big-button" id="duelWarBtn">TRÆK BEGGE KORT</button>`;
      $("#duelWarBtn").onclick = async () => {
        if (state.busy) return;
        setBusy(true);
        const c1 = casinoCard(), c2 = casinoCard();
        $("#duelWar1").innerHTML = cardHtml(c1); beep(560, 0.05, 0.02);
        await sleep(480);
        $("#duelWar2").innerHTML = cardHtml(c2); beep(630, 0.05, 0.02);
        const v1 = c1.rank === 1 ? 14 : c1.rank;
        const v2 = c2.rank === 1 ? 14 : c2.rank;
        await sleep(450);
        showDuelOutcomeModal({
          isTie: v1 === v2,
          winnerIdx: v1 > v2 ? 0 : 1,
          icon: "⚔️",
          title: v1 === v2 ? "Lige kort · Uafgjort!" : `${v1 > v2 ? p1.name : p2.name} vandt War!`,
          desc: `${p1.name}: ${c1.label}${c1.suit} mod ${p2.name}: ${c2.label}${c2.suit}.`
        });
      };
      return true;
    }

    if (gameId === "coin") {
      container.innerHTML = `
        ${Arcade.titleBlock("⚔️ Møntkast Duel", `${p1.name} vælger Krone eller Plat – ${p2.name} får automatisk den anden side!`)}
        <div class="coin-stage">
          <div class="coin3d" id="coin">
            <div class="coin-face front"><div>👑<small>KRONE</small></div></div>
            <div class="coin-face back"><div>★<small>PLAT</small></div></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn primary duelCoinPick" data-pick="heads">${p1.name}: Krone</button>
          <button class="btn primary duelCoinPick" data-pick="tails">${p1.name}: Plat</button>
        </div>`;
      container.querySelectorAll(".duelCoinPick").forEach(b => b.onclick = async () => {
        if (state.busy) return;
        setBusy(true);
        const p1Choice = b.dataset.pick;
        const outcome = Math.random() < 0.5 ? "heads" : "tails";
        const coin = $("#coin");
        coin.className = "coin3d"; coin.style.transition = "none"; coin.style.transform = "rotateY(0deg) rotateX(0deg)";
        void coin.offsetWidth;
        coin.style.transition = "transform 1.7s cubic-bezier(.16,.78,.2,1)";
        coin.style.transform = `rotateY(${outcome === "heads" ? 1800 : 1980}deg) rotateX(720deg)`;
        for (let i = 0; i < 8; i++) { await sleep(150); beep(420 + i * 30, 0.025, 0.014); }
        await sleep(500);
        coin.style.transition = "none"; coin.style.transform = "none";
        coin.className = outcome === "heads" ? "coin3d final-heads" : "coin3d final-tails";
        const p1Win = outcome === p1Choice;
        await sleep(360);
        showDuelOutcomeModal({
          isTie: false,
          winnerIdx: p1Win ? 0 : 1,
          icon: "🪙",
          title: `${outcome === "heads" ? "👑 KRONE" : "★ PLAT"} · ${p1Win ? p1.name : p2.name} vandt!`,
          desc: `${p1.name} havde ${p1Choice === "heads" ? "Krone" : "Plat"}, ${p2.name} havde ${p1Choice === "heads" ? "Plat" : "Krone"}.`
        });
      });
      return true;
    }

    if (gameId === "redblack") {
      container.innerHTML = `
        ${Arcade.titleBlock("⚔️ Rød eller Sort Duel", `${p1.name} vælger farve – ${p2.name} får modsatte farve!`)}
        <div class="quick-card-stage"><div class="quick-card" id="rbCard">?</div></div>
        <div class="bet-picks">
          <button class="btn bet-red duelRbPick" data-rb="red">${p1.name}: RØD</button>
          <button class="btn bet-black duelRbPick" data-rb="black">${p1.name}: SORT</button>
        </div>`;
      container.querySelectorAll(".duelRbPick").forEach(b => b.onclick = async () => {
        if (state.busy) return;
        setBusy(true);
        const c = casinoCard(), p1Pick = b.dataset.rb;
        const el = $("#rbCard"); el.className = "quick-card"; el.textContent = "?";
        await sleep(160);
        el.className = `quick-card ${c.red ? "red" : ""} reveal`;
        el.textContent = `${c.label}${c.suit}`;
        beep(690, 0.09, 0.03);
        await sleep(650);
        const p1Win = (p1Pick === "red") === c.red;
        showDuelOutcomeModal({
          isTie: false,
          winnerIdx: p1Win ? 0 : 1,
          icon: "♦️",
          title: `${c.red ? "RØDT KORT" : "SORT KORT"} (${c.label}${c.suit})`,
          desc: `${p1Win ? p1.name : p2.name} ramte kortets farve!`
        });
      });
      return true;
    }

    if (gameId === "picknumber") {
      let n1 = null;
      container.innerHTML = `
        ${Arcade.titleBlock("⚔️ Pick a Number Duel", "Begge vælger et tal 1–6 hemmeligt. Tættest på det trukne tal vinder!")}
        <div class="center"><div class="duel-turn-chip" id="duelTurnChip">🔢 ${p1.name} vælger tal</div></div>
        <div class="big-number" id="numberReveal">?</div>
        <div class="number-picks">${[1, 2, 3, 4, 5, 6].map(n => `<button class="number-pick duelNumPick" data-num="${n}">${n}</button>`).join("")}</div>`;
      container.querySelectorAll(".duelNumPick").forEach(b => b.onclick = async () => {
        if (state.busy) return;
        const picked = +b.dataset.num;
        if (n1 === null) {
          n1 = picked;
          await requestDuelPrivacy(p2.name, `${p1.name} har valgt sit hemmelige tal! Nu vælger ${p2.name}.`);
          $("#duelTurnChip").textContent = `🔢 ${p2.name} vælger tal`;
        } else {
          const n2 = picked;
          setBusy(true);
          const n = 1 + Math.floor(Math.random() * 6);
          const el = $("#numberReveal");
          for (let i = 0; i < 10; i++) { el.textContent = 1 + Math.floor(Math.random() * 6); beep(400 + i * 22, 0.025, 0.01); await sleep(80); }
          el.textContent = n;
          const d1 = Math.abs(n - n1), d2 = Math.abs(n - n2);
          await sleep(420);
          showDuelOutcomeModal({
            isTie: d1 === d2,
            winnerIdx: d1 < d2 ? 0 : 1,
            icon: "🔢",
            title: d1 === d2 ? `Lige tæt på ${n}!` : `${d1 < d2 ? p1.name : p2.name} var tættest på ${n}!`,
            desc: `Tallet blev ${n}. ${p1.name} gættede ${n1}, ${p2.name} gættede ${n2}.`
          });
        }
      });
      return true;
    }

    if (gameId === "tridice") {
      let s1 = 0;
      container.innerHTML = `
        ${Arcade.titleBlock("⚔️ Triple Dice Duel", "Kast 3 terninger efter tur – højeste samlede sum vinder!")}
        <div class="center"><div class="duel-turn-chip" id="duelTurnChip">🎲 ${p1.name} kaster 3 terninger</div></div>
        <div class="dice-triple"><div class="mini-die" id="td1">⚀</div><div class="mini-die" id="td2">⚁</div><div class="mini-die" id="td3">⚂</div></div>
        <button class="big-button" id="duelTriBtn">KAST FOR ${p1.name.toUpperCase()}</button>`;
      $("#duelTriBtn").onclick = async () => {
        if (state.busy) return;
        setBusy(true);
        const ds = [0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6));
        const sum = ds.reduce((s, x) => s + x, 0);
        const els = [$("#td1"), $("#td2"), $("#td3")];
        els.forEach(e => { e.classList.remove("roll"); void e.offsetWidth; e.classList.add("roll"); });
        const id = setInterval(() => { els.forEach(e => e.textContent = dieFace(1 + Math.floor(Math.random() * 6))); beep(370, 0.02, 0.01); }, 85);
        await sleep(1050); clearInterval(id);
        els.forEach((e, i) => e.textContent = dieFace(ds[i]));
        beep(740, 0.09, 0.03);
        if (s1 === 0) {
          s1 = sum;
          $("#duelTurnChip").textContent = `${p1.name} slog ${s1} · Nu ${p2.name}s tur!`;
          $("#duelTriBtn").textContent = `KAST FOR ${p2.name.toUpperCase()}`;
          setBusy(false);
        } else {
          await sleep(420);
          showDuelOutcomeModal({
            isTie: s1 === sum,
            winnerIdx: s1 > sum ? 0 : 1,
            icon: "🎲",
            title: s1 === sum ? `Uafgjort (${s1}-${sum})` : `${s1 > sum ? p1.name : p2.name} slog højest!`,
            desc: `${p1.name} slog ${s1} mod ${p2.name}s ${sum}.`
          });
        }
      };
      return true;
    }

    if (gameId === "blackjack") {
      let turn = 0;
      const hands = [[casinoCard(), casinoCard()], [casinoCard(), casinoCard()]];
      container.innerHTML = `
        ${Arcade.titleBlock("⚔️ Blackjack Duel", "Begge spiller mod 21 på skift. Tættest på 21 uden at buste vinder!")}
        <div class="center"><div class="duel-turn-chip" id="duelTurnChip">🂡 ${p1.name}s hånd</div></div>
        <div class="casino-table">
          <div class="hand-label" id="duelBjLabel">${p1.name}s kort</div>
          <div class="hand" id="duelBjHand"></div>
          <div style="text-align:center"><span class="score-bubble" id="duelBjScore">0</span></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:center" id="duelBjCtrls">
          <button class="btn primary" id="duelBjHit">HIT</button>
          <button class="btn" id="duelBjStand">STAND</button>
        </div>`;

      const paintHand = () => {
        const h = hands[turn];
        $("#duelBjLabel").textContent = `${modeState.players[turn].name}s kort`;
        $("#duelBjHand").innerHTML = h.map(c => cardHtml(c)).join("");
        $("#duelBjScore").textContent = blackjackValue(h);
      };
      paintHand();

      const finishTurn = async () => {
        if (turn === 0) {
          turn = 1;
          await requestDuelPrivacy(p2.name, `${p1.name} er færdig med sin hånd! Giv telefonen til ${p2.name}.`);
          $("#duelTurnChip").textContent = `🂡 ${p2.name}s hånd`;
          paintHand();
        } else {
          setBusy(true);
          const v1 = blackjackValue(hands[0]), v2 = blackjackValue(hands[1]);
          const b1 = v1 > 21, b2 = v2 > 21;
          let tie = false, winnerIdx = 0;
          if (b1 && b2) tie = true;
          else if (b1) winnerIdx = 1;
          else if (b2) winnerIdx = 0;
          else if (v1 === v2) tie = true;
          else winnerIdx = v1 > v2 ? 0 : 1;
          await sleep(320);
          showDuelOutcomeModal({
            isTie: tie,
            winnerIdx,
            icon: "🂡",
            title: tie ? `Uafgjort (${v1} vs ${v2})` : `${modeState.players[winnerIdx].name} vandt!`,
            desc: `${p1.name}: ${v1}${b1 ? " (Bust)" : ""} · ${p2.name}: ${v2}${b2 ? " (Bust)" : ""}.`
          });
        }
      };

      $("#duelBjHit").onclick = async () => {
        hands[turn].push(casinoCard());
        beep(600, 0.05, 0.02);
        paintHand();
        if (blackjackValue(hands[turn]) >= 21) {
          await sleep(420);
          finishTurn();
        }
      };
      $("#duelBjStand").onclick = finishTurn;
      return true;
    }

    return false;
  }

  window.Arcade.modes = {
    MODES,
    CHAOS_MODIFIERS,
    SURPRISE_EVENTS,
    SOCIAL_PROMPTS,
    state: modeState,
    isMultiplayer,
    isDrinkMode,
    isChaosEnabled,
    rollDrinkTurn,
    applyDrinkOutcome,
    resolveDrinkDoubleOrNothing,
    maybeTriggerSurprise,
    currentPlayer,
    activePlayers,
    getBustLimit,
    getMaxStartPool,
    getMinWager,
    transformDelta,
    syncCurrentPlayerPool,
    canTransferSips,
    getTransferTargets,
    transferPointsToPlayer,
    getModeOutcomeConfig,
    handleAfterOutcome,
    renderHudExtras,
    startModeSession,
    renderDuelGame
  };
})();
