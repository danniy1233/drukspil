(() => {
  const { $, $$, sleep, state, registerGame, beep, vibrate, confetti, titleBlock, setBusy, getWager, updateBalance, showResult } = window.Arcade;

  // ==========================================================
  // NEW GAME 1: MINES (4x4 MINESTRYGER MED CASH OUT)
  // ==========================================================
  let minesState = null;
  let minesBombsPref = 3;

  function minesRewardAmount(safeCount, bombCount, w) {
    const stepMult = bombCount === 2 ? 0.25 : bombCount === 3 ? 0.38 : 0.65;
    return Math.max(1, Math.round(w * (safeCount * stepMult)));
  }

  function renderMines(a) {
    const total = 16;
    const bombs = new Set();
    while (bombs.size < minesBombsPref) bombs.add(Math.floor(Math.random() * total));
    minesState = { bombs, opened: new Set(), safeCount: 0, active: false, finished: false, bombCount: minesBombsPref, wager: null };

    a.innerHTML = `
      ${titleBlock("💎 Mines", "4×4 gitter med skjulte bomber. Find diamanter og cash ud, før det siger BOOM!")}
      <div class="mines-toolbar">
        <span style="font-size:11.5px;font-weight:900;color:var(--muted)">BOMBER:</span>
        <div style="display:flex;gap:6px">
          ${[2, 3, 5].map(n => `<button class="btn small mineBombBtn ${minesBombsPref === n ? "primary" : ""}" data-bombs="${n}">${n} 💣</button>`).join("")}
        </div>
      </div>
      <div class="mines-grid" id="minesGrid">
        ${Array.from({ length: total }, (_, i) => `<button class="mine-cell" data-idx="${i}">?</button>`).join("")}
      </div>
      <div id="minesAction" style="text-align:center;min-height:48px;display:flex;justify-content:center;align-items:center">
        <span class="muted" style="font-size:12px">Tap et felt for at starte (låser indsats)</span>
      </div>
      <div id="gameResult"></div>`;

    $$(".mineBombBtn").forEach(b => b.onclick = () => {
      if (minesState.active || state.busy) return;
      minesBombsPref = +b.dataset.bombs;
      renderMines(a);
    });
    $$(".mine-cell").forEach(c => c.onclick = () => clickMineCell(+c.dataset.idx, c));
  }

  function revealAllMines(explodedIdx = -1) {
    $$(".mine-cell").forEach((c, i) => {
      c.disabled = true;
      if (i !== explodedIdx && !minesState.opened.has(i)) {
        const isBomb = minesState.bombs.has(i);
        c.classList.add(isBomb ? "boom" : "safe");
        c.textContent = isBomb ? "💣" : "💎";
      }
    });
    $("#minesAction").innerHTML = `<button class="big-button" id="minesRestartBtn">SPIL MINES IGEN</button>`;
    $("#minesRestartBtn").onclick = () => { if (!state.busy) renderMines($("#arena")); };
  }

  function clickMineCell(idx, cell) {
    if (!minesState || minesState.finished || minesState.opened.has(idx) || state.balance <= 0) return;
    if (!minesState.active) {
      minesState.wager = getWager();
      minesState.active = true;
      setBusy(true);
      $$(".mineBombBtn").forEach(b => { b.disabled = true; });
    }

    const w = minesState.wager;
    minesState.opened.add(idx);
    cell.disabled = true;

    if (minesState.bombs.has(idx)) {
      minesState.finished = true;
      cell.classList.add("boom");
      cell.textContent = "💥";
      beep(190, 0.22, 0.05);
      vibrate([100, 50, 140]);
      revealAllMines(idx);
      const actual = updateBalance(w, `Mines: ramte en bombe efter ${minesState.safeCount} diamanter.`);
      setBusy(false);
      showResult("💥 BOOM · MINES!", `Du ramte en bombe! ${actual} point blev lagt oveni puljen.`, "bad");
      return;
    }

    minesState.safeCount++;
    cell.classList.add("safe");
    cell.textContent = "💎";
    beep(660 + minesState.safeCount * 45, 0.07, 0.025);

    const maxSafe = 16 - minesState.bombCount;
    const reward = minesRewardAmount(minesState.safeCount, minesState.bombCount, w);

    if (minesState.safeCount >= maxSafe) {
      minesState.finished = true;
      revealAllMines();
      const actual = updateBalance(-reward, `Mines: ryddede hele brættet!`);
      setBusy(false);
      confetti();
      showResult("💎 ALLE DIAMANTER FUNDET!", `Du ryddede brættet! ${Math.abs(actual)} point forsvandt!`, "good");
      return;
    }

    $("#minesAction").innerHTML = `<button class="btn cashout-btn" style="width:100%" id="minesCashoutBtn">💰 CASH UD NU (-${reward} POINT)</button>`;
    $("#minesCashoutBtn").onclick = () => {
      if (!minesState || minesState.finished) return;
      minesState.finished = true;
      revealAllMines();
      const actual = updateBalance(-reward, `Mines: cashede ud (${minesState.safeCount} diamanter).`);
      setBusy(false);
      showResult(`💰 MINES CASH OUT · ${minesState.safeCount} 💎`, `${Math.abs(actual)} point forsvandt fra puljen!`, "good");
    };
  }

  registerGame({
    id: "mines",
    name: "Mines",
    icon: "💎",
    desc: "4×4 minestryger & cashout",
    category: "arcade",
    render: renderMines
  });

  // ==========================================================
  // NEW GAME 2: LIMBO (GÆT MULTIPLIKATOR)
  // ==========================================================
  let limboTarget = 2.0;

  function renderLimbo(a) {
    const targets = [
      { mult: 1.5, reward: "0.7× save", loss: "1×" },
      { mult: 2.0, reward: "1.0× save", loss: "1×" },
      { mult: 3.0, reward: "2.0× save", loss: "½×" },
      { mult: 5.0, reward: "3.5× JACKPOT", loss: "½×" }
    ];
    a.innerHTML = `
      ${titleBlock("🚀 Limbo", "Vælg en mål-multiplikator! Når raketten over dit mål, vinder du.")}
      <div class="limbo-display">
        <span style="font-size:11px;font-weight:900;color:var(--muted);letter-spacing:.1em">RESULTAT</span>
        <div class="limbo-val" id="limboVal">1.00x</div>
        <span id="limboSub" style="font-size:12px;color:var(--muted)">Mål: ${limboTarget.toFixed(1)}x</span>
      </div>
      <div class="limbo-targets">
        ${targets.map(t => `<button class="limbo-target-btn ${limboTarget === t.mult ? "active" : ""}" data-target="${t.mult}">${t.mult.toFixed(1)}x<small style="display:block;font-size:9px;opacity:.75">${t.reward}</small></button>`).join("")}
      </div>
      <button class="big-button" id="limboBtn">SKYD LIMBO 🚀</button>
      <div id="gameResult"></div>`;

    $$(".limbo-target-btn").forEach(b => b.onclick = () => {
      if (state.busy) return;
      limboTarget = +b.dataset.target;
      $$(".limbo-target-btn").forEach(x => x.classList.toggle("active", x === b));
      if ($("#limboSub")) $("#limboSub").textContent = `Mål: ${limboTarget.toFixed(1)}x`;
    });
    $("#limboBtn").onclick = playLimbo;
  }

  async function playLimbo() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager();
    setBusy(true);

    // Klassisk Limbo fordeling: ~96% RTP formet som 0.96 / U
    const raw = 0.96 / Math.max(0.05, Math.random());
    const outcome = Math.min(25, Math.max(1.00, Math.round(raw * 100) / 100));

    const valEl = $("#limboVal");
    valEl.className = "limbo-val";
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const cur = 1 + ((outcome - 1) * (i / steps));
      valEl.textContent = cur.toFixed(2) + "x";
      beep(340 + i * 28, 0.02, 0.01);
      await sleep(45);
    }
    valEl.textContent = outcome.toFixed(2) + "x";

    const win = outcome >= limboTarget;
    valEl.classList.add(win ? "win" : "lose");
    beep(win ? 860 : 210, 0.14, 0.04);

    let delta = 0;
    if (win) {
      const mult = limboTarget === 1.5 ? 0.7 : limboTarget === 2.0 ? 1.0 : limboTarget === 3.0 ? 2.0 : 3.5;
      delta = -Math.max(1, Math.round(w * mult));
      if (limboTarget >= 3) confetti();
    } else {
      const lossMult = limboTarget >= 3 ? 0.5 : 1.0;
      delta = Math.max(1, Math.ceil(w * lossMult));
    }

    const actual = updateBalance(delta, `Limbo: ${outcome.toFixed(2)}x (mål ${limboTarget.toFixed(1)}x).`);
    showResult(win ? `🚀 LIMBO RAMTE ${outcome.toFixed(2)}x!` : `💥 STOPPEDE VED ${outcome.toFixed(2)}x`,
      win ? `${Math.abs(actual)} point forsvandt (mål: ${limboTarget.toFixed(1)}x).` : `Målet var ${limboTarget.toFixed(1)}x. ${actual} point lagt oveni.`,
      win ? "good" : "bad");
    setBusy(false);
  }

  registerGame({
    id: "limbo",
    name: "Limbo",
    icon: "🚀",
    desc: "Ram mål-multiplikator",
    category: "arcade",
    render: renderLimbo
  });

  // ==========================================================
  // NEW GAME 3: SKRABELOD (SCRATCH 3X3)
  // ==========================================================
  let scratchState = null;

  function buildScratchPool() {
    // Byg 9 felter: ca. 52% chance for 3 ens af én af de gode/sjove typer
    const r = Math.random();
    const syms = ["🛡️", "💎", "🎁", "🍻", "🏆", "💀"];
    let winSym = null;
    if (r < 0.08) winSym = "🏆";       // Halv pulje
    else if (r < 0.22) winSym = "💎";  // 2x Save
    else if (r < 0.36) winSym = "🎁";  // Giv 3 tårer + Save
    else if (r < 0.54) winSym = "🛡️";  // 1x Save
    else if (r < 0.64) winSym = "🍻";  // Tag 2 tårer (neutral pulje)

    const cells = [];
    if (winSym) {
      cells.push(winSym, winSym, winSym);
      const others = syms.filter(s => s !== winSym);
      const counts = {};
      while (cells.length < 9) {
        const s = others[Math.floor(Math.random() * others.length)];
        if ((counts[s] || 0) < 2) {
          counts[s] = (counts[s] || 0) + 1;
          cells.push(s);
        }
      }
    } else {
      const counts = {};
      while (cells.length < 9) {
        const s = syms[Math.floor(Math.random() * syms.length)];
        if ((counts[s] || 0) < 2) {
          counts[s] = (counts[s] || 0) + 1;
          cells.push(s);
        }
      }
    }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    return { cells, winSym };
  }

  function renderScratch(a) {
    const { cells, winSym } = buildScratchPool();
    scratchState = { cells, winSym, revealed: new Set(), finished: false, active: false, wager: null };

    a.innerHTML = `
      ${titleBlock("🎫 Skrabelod", "Skrab alle 9 felter og match 3 ens! 🏆=Halv pulje · 💎=2× Save · 🎁=Giv 3 tårer · 🛡️=1× Save")}
      <div class="scratch-grid" id="scratchGrid">
        ${cells.map((_, i) => `<button class="scratch-cell" data-s="${i}">SKRAB</button>`).join("")}
      </div>
      <button class="big-button" id="scratchAllBtn">SKRAB ALLE FELTER</button>
      <div id="gameResult"></div>`;

    $$(".scratch-cell").forEach(b => b.onclick = () => scratchCell(+b.dataset.s, b));
    $("#scratchAllBtn").onclick = scratchAll;
  }

  function scratchCell(idx, btn) {
    if (!scratchState || scratchState.finished || scratchState.revealed.has(idx) || state.balance <= 0) return;
    if (!scratchState.active) {
      scratchState.wager = getWager();
      scratchState.active = true;
      setBusy(true);
    }
    scratchState.revealed.add(idx);
    btn.classList.add("revealed");
    btn.textContent = scratchState.cells[idx];
    beep(540 + scratchState.revealed.size * 30, 0.035, 0.015);

    if (scratchState.revealed.size >= 9) {
      finishScratch();
    }
  }

  async function scratchAll() {
    if (!scratchState || scratchState.finished || state.balance <= 0) return;
    if (!scratchState.active) {
      scratchState.wager = getWager();
      scratchState.active = true;
      setBusy(true);
    }
    $("#scratchAllBtn").disabled = true;
    const cells = $$(".scratch-cell");
    for (let i = 0; i < 9; i++) {
      if (!scratchState.revealed.has(i)) {
        scratchState.revealed.add(i);
        cells[i].classList.add("revealed");
        cells[i].textContent = scratchState.cells[i];
        beep(540 + i * 32, 0.03, 0.014);
        await sleep(85);
      }
    }
    finishScratch();
  }

  function finishScratch() {
    if (!scratchState || scratchState.finished) return;
    scratchState.finished = true;
    const w = scratchState.wager;
    const sym = scratchState.winSym;

    if (sym) {
      $$(".scratch-cell").forEach((c, i) => {
        if (scratchState.cells[i] === sym) c.classList.add("match");
      });
    }

    let delta = 0, title = "", type = "bad", desc = "", opts = {};
    if (sym === "🏆") {
      delta = -Math.max(1, Math.round(state.balance / 2));
      title = "🏆 3× TROFÆ · HALV PULJE!"; type = "good"; confetti();
    } else if (sym === "💎") {
      delta = -2 * w;
      title = "💎 3× DIAMANT · 2× SAVE!"; type = "good"; confetti();
    } else if (sym === "🎁") {
      delta = -w;
      title = "🎁 3× GAVE · GIV 3 TÅRER UD!"; type = "good";
      opts = { giveAmount: 3, giveLabel: "3 tårer" };
    } else if (sym === "🛡️") {
      delta = -w;
      title = "🛡️ 3× SKJOLD · FULD SAVE!"; type = "good";
    } else if (sym === "🍻") {
      delta = 0;
      title = "🍻 3× SKÅL · TAG 2 TÅRER SELV!"; type = "special";
      desc = "Tag 2 tårer selv! Puljen er urørt.";
    } else {
      delta = Math.max(1, Math.ceil(w * 0.75));
      title = "🎫 Nitte · Ingen 3 ens"; type = "bad";
    }

    const actual = updateBalance(delta, `Skrabelod: ${title}`, "auto", null, opts);
    if (!desc) {
      desc = actual < 0 ? `${Math.abs(actual)} point forsvandt fra puljen!` :
             actual > 0 ? `${actual} point blev lagt oveni.` : "Ingen ændring i puljen.";
    }
    setBusy(false);
    showResult(title, desc, type);
    const btn = $("#scratchAllBtn");
    if (btn) { btn.disabled = false; btn.textContent = "NYT SKRABELOD 🎫"; btn.onclick = () => renderScratch($("#arena")); }
  }

  registerGame({
    id: "scratch",
    name: "Skrabelod",
    icon: "🎫",
    desc: "Skrab 3 ens & vind",
    category: "wheel_cases",
    render: renderScratch
  });
})();
