(() => {
  const { $, $$, clamp, sleep, state, registerGame, getBustLimit, beep, vibrate, confetti, titleBlock, setBusy, getWager, updateBalance, showResult } = window.Arcade;
  const { dieFace } = window.Arcade.dice;

  // ==========================================================
  // 1. CASINO ROULETTE
  // ==========================================================
  const rouletteRed = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const rouletteOrder = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  let rouletteRotation = 0;
  let rouletteBallRotation = 0;
  let rouletteBetView = "quick";
  let rouletteBet = {
    type: "outside",
    key: "red",
    label: "RØD",
    payout: 1,
    numbers: [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
  };

  function rouletteColor(n) { return n === 0 ? "green" : rouletteRed.has(n) ? "red" : "black"; }

  function roulettePointRule(bet = rouletteBet) {
    if (bet.type === "straight") {
      if (bet.numbers[0] === 0) return { winFraction: 1, lossFixed: 1, winLabel: "Clear puljen + giv 2×", lossLabel: "+1 ved miss", special: "green" };
      return { winFraction: 1, lossFixed: 1, winLabel: "Clear hele puljen", lossLabel: "+1 ved miss", special: "straight" };
    }
    if (bet.type === "outside") {
      if (bet.key === "green") return { winFraction: 1, lossFixed: 1, winLabel: "Clear puljen + giv 2×", lossLabel: "+1 ved miss", special: "green" };
      if (["d1", "d2", "d3", "c1", "c2", "c3"].includes(bet.key)) return { winFraction: 1, lossFraction: 0.50, winLabel: "-100% indsats", lossLabel: "+50% ved miss" };
    }
    if (bet.type === "combo") {
      if (bet.key.startsWith("six:")) return { winFraction: 1, lossFraction: 0.33, winLabel: "-100% indsats", lossLabel: "+33% ved miss" };
      if (bet.key.startsWith("corner:")) return { winFraction: 1, lossFraction: 0.25, winLabel: "-100% indsats", lossLabel: "+25% ved miss" };
      if (bet.key.startsWith("street:")) return { winFraction: 1, lossFraction: 0.20, winLabel: "-100% indsats", lossLabel: "+20% ved miss" };
      if (bet.key.startsWith("split:")) return { winFraction: 1, lossFraction: 0.15, winLabel: "-100% indsats", lossLabel: "+15% ved miss" };
    }
    return { winFraction: 1, lossFraction: 1, winLabel: "-100% indsats", lossLabel: "+100% ved miss" };
  }

  function roulettePointRuleText(bet = rouletteBet) {
    const r = roulettePointRule(bet);
    return `${r.winLabel} · ${r.lossLabel}`;
  }

  function updateRouletteBetSummary() {
    if ($("#rouletteDockBet")) $("#rouletteDockBet").textContent = rouletteBet.label;
    if ($("#rouletteDockRule")) $("#rouletteDockRule").textContent = roulettePointRuleText();
  }

  function rouletteSetBet(type, key, label, payout, numbers) {
    rouletteBet = { type, key, label, payout, numbers: [...numbers] };
    updateRouletteBetSummary();
    $$(".roulette-number").forEach(b => b.classList.toggle("active", type === "straight" && +b.dataset.num === numbers[0]));
    $$(".roulette-outside").forEach(b => b.classList.toggle("active", type === "outside" && b.dataset.bet === key));
  }

  function rouletteOutsideBet(key) {
    const all = Array.from({ length: 36 }, (_, i) => i + 1);
    const defs = {
      red: { label: "RØD", payout: 1, numbers: all.filter(n => rouletteRed.has(n)) },
      black: { label: "SORT", payout: 1, numbers: all.filter(n => !rouletteRed.has(n)) },
      green: { label: "GRØN 0", payout: 35, numbers: [0] },
      odd: { label: "ULIGE", payout: 1, numbers: all.filter(n => n % 2 === 1) },
      even: { label: "LIGE", payout: 1, numbers: all.filter(n => n % 2 === 0) },
      low: { label: "1-18", payout: 1, numbers: all.filter(n => n <= 18) },
      high: { label: "19-36", payout: 1, numbers: all.filter(n => n >= 19) },
      d1: { label: "1. DUSIN · 1-12", payout: 2, numbers: all.filter(n => n <= 12) },
      d2: { label: "2. DUSIN · 13-24", payout: 2, numbers: all.filter(n => n >= 13 && n <= 24) },
      d3: { label: "3. DUSIN · 25-36", payout: 2, numbers: all.filter(n => n >= 25) },
      c1: { label: "KOLONNE 1", payout: 2, numbers: all.filter(n => n % 3 === 1) },
      c2: { label: "KOLONNE 2", payout: 2, numbers: all.filter(n => n % 3 === 2) },
      c3: { label: "KOLONNE 3", payout: 2, numbers: all.filter(n => n % 3 === 0) }
    };
    const d = defs[key];
    if (d) rouletteSetBet("outside", key, d.label, d.payout, d.numbers);
  }

  function rouletteComboOptions(type) {
    const opts = [];
    if (type === "split") {
      opts.push({ label: "0 / 1", numbers: [0, 1] }, { label: "0 / 2", numbers: [0, 2] }, { label: "0 / 3", numbers: [0, 3] });
      for (let r = 0; r < 12; r++) {
        const a = 1 + r * 3;
        opts.push({ label: `${a} / ${a + 1}`, numbers: [a, a + 1] }, { label: `${a + 1} / ${a + 2}`, numbers: [a + 1, a + 2] });
      }
    } else if (type === "street") {
      opts.push({ label: "0-2-3 · Trio", numbers: [0, 2, 3] }, { label: "0-1-2 · Trio", numbers: [0, 1, 2] });
      for (let r = 0; r < 12; r++) {
        const a = 1 + r * 3;
        opts.push({ label: `${a}-${a + 2}`, numbers: [a, a + 1, a + 2] });
      }
    } else if (type === "corner") {
      opts.push({ label: "0-1-2-3 · First Four", numbers: [0, 1, 2, 3] });
      for (let r = 0; r < 11; r++) {
        const a = 1 + r * 3;
        opts.push({ label: `${a}-${a + 1}-${a + 3}-${a + 4}`, numbers: [a, a + 1, a + 3, a + 4] });
      }
    } else if (type === "six") {
      for (let r = 0; r < 11; r++) {
        const a = 1 + r * 3;
        opts.push({ label: `${a}-${a + 5}`, numbers: [a, a + 1, a + 2, a + 3, a + 4, a + 5] });
      }
    }
    return opts;
  }

  function renderRoulette(a) {
    const step = 360 / rouletteOrder.length;
    const slices = rouletteOrder.map((n, i) => {
      const c = rouletteColor(n) === "red" ? "#c23b45" : rouletteColor(n) === "green" ? "#177548" : "#171d27";
      const start = i * step - step / 2;
      return `${c} ${start}deg ${start + step}deg`;
    }).join(",");

    const labels = rouletteOrder.map((n, i) => {
      const angle = i * step;
      const color = rouletteColor(n);
      return `<span class="roulette-pocket-label ${color}${n === 0 ? " zero" : ""}" style="transform:rotate(${angle}deg) translateY(-102px) rotate(${-angle}deg)">${n}</span>`;
    }).join("");

    const numberButtons = [0, ...Array.from({ length: 36 }, (_, i) => i + 1)].map(n => {
      const color = rouletteColor(n);
      return `<button class="roulette-number ${color} ${n === 0 ? "zero" : ""} ${rouletteBet.type === "straight" && rouletteBet.numbers[0] === n ? "active" : ""}" data-num="${n}">${n === 0 ? "0 · GRØN JACKPOT" : n}</button>`;
    }).join("");

    const outside = [
      ["red", "RØD", "redbet"], ["black", "SORT", "blackbet"], ["green", "GRØN 0", "greenbet"],
      ["odd", "ULIGE", ""], ["even", "LIGE", ""], ["low", "1-18", ""], ["high", "19-36", ""],
      ["d1", "1-12", ""], ["d2", "13-24", ""], ["d3", "25-36", ""],
      ["c1", "KOLONNE 1", ""], ["c2", "KOLONNE 2", ""], ["c3", "KOLONNE 3", ""]
    ].map(([key, label, cls]) => `<button class="roulette-outside ${cls} ${rouletteBet.type === "outside" && rouletteBet.key === key ? "active" : ""}" data-bet="${key}">${label}</button>`).join("");

    a.innerHTML = `
      ${titleBlock("🎯 Casino Roulette", "Vælg bet nedenunder og spin hjulet! Sværere bets giver mindre straf ved miss.")}
      <div class="roulette-stage">
        <div class="roulette-shell">
          <div class="roulette-pointer"></div>
          <div class="roulette-disc" id="rouletteDisc" style="background:conic-gradient(from 0deg,${slices})">${labels}</div>
          <div class="roulette-ball-orbit" id="rouletteBallOrbit"><div class="roulette-ball"></div></div>
          <div class="roulette-result" id="rouletteResult">?</div>
        </div>
      </div>

      <div class="roulette-spin-dock">
        <div class="roulette-spin-dock-top">
          <div class="roulette-spin-dock-bet"><span>VALGT BET</span><strong id="rouletteDockBet">${rouletteBet.label}</strong></div>
          <span id="rouletteDockRule" style="font-size:10px;color:var(--muted);font-weight:900">${roulettePointRuleText()}</span>
        </div>
        <button class="big-button" id="rouletteBtn" style="margin:0">SPIN ROULETTE</button>
        <div class="roulette-inline-result" id="rouletteInlineResult"><strong id="rouletteInlineTitle"></strong><span id="rouletteInlineText"></span></div>
      </div>

      <div class="roulette-bet-panel">
        <div class="roulette-bet-tabs">
          <button class="roulette-bet-tab ${rouletteBetView === "quick" ? "active" : ""}" data-view="quick">HURTIGE</button>
          <button class="roulette-bet-tab ${rouletteBetView === "number" ? "active" : ""}" data-view="number">ET NUMMER</button>
          <button class="roulette-bet-tab ${rouletteBetView === "combo" ? "active" : ""}" data-view="combo">KOMBI</button>
        </div>
        <div class="roulette-bet-view ${rouletteBetView === "quick" ? "active" : ""}" data-view="quick">
          <div class="roulette-outside-grid">${outside}</div>
        </div>
        <div class="roulette-bet-view ${rouletteBetView === "number" ? "active" : ""}" data-view="number">
          <div class="roulette-number-grid">${numberButtons}</div>
        </div>
        <div class="roulette-bet-view ${rouletteBetView === "combo" ? "active" : ""}" data-view="combo">
          <div class="roulette-combo-builder">
            <select id="rouletteComboType">
              <option value="split">Split · 2 tal</option><option value="street">Street · 3 tal</option>
              <option value="corner">Corner · 4 tal</option><option value="six">Six Line · 6 tal</option>
            </select>
            <select id="rouletteComboOption"></select>
            <button class="btn" id="rouletteComboSet">VÆLG KOMBI</button>
          </div>
        </div>
      </div>
      <div id="gameResult"></div>`;

    $("#rouletteDisc").style.transform = `rotate(${rouletteRotation}deg)`;
    $("#rouletteBallOrbit").style.transform = `rotate(${rouletteBallRotation}deg)`;
    $$(".roulette-bet-tab").forEach(b => b.onclick = () => {
      rouletteBetView = b.dataset.view;
      $$(".roulette-bet-tab").forEach(x => x.classList.toggle("active", x === b));
      $$(".roulette-bet-view").forEach(p => p.classList.toggle("active", p.dataset.view === rouletteBetView));
    });
    $$(".roulette-number").forEach(b => b.onclick = () => { const n = +b.dataset.num; rouletteSetBet("straight", `n${n}`, `NUMMER ${n}`, 35, [n]); });
    $$(".roulette-outside").forEach(b => b.onclick = () => rouletteOutsideBet(b.dataset.bet));

    const populateCombos = () => {
      const opts = rouletteComboOptions($("#rouletteComboType").value);
      $("#rouletteComboOption").innerHTML = opts.map((o, i) => `<option value="${i}">${o.label}</option>`).join("");
    };
    $("#rouletteComboType").onchange = populateCombos;
    $("#rouletteComboSet").onclick = () => {
      const t = $("#rouletteComboType").value;
      const idx = +$("#rouletteComboOption").value;
      const opt = rouletteComboOptions(t)[idx];
      if (opt) rouletteSetBet("combo", `${t}:${idx}`, `${t.toUpperCase()} · ${opt.label}`, 5, opt.numbers);
    };
    populateCombos();
    $("#rouletteBtn").onclick = spinRoulette;
  }

  async function spinRoulette() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager();
    setBusy(true);
    const winIndex = Math.floor(Math.random() * rouletteOrder.length);
    const n = rouletteOrder[winIndex], color = rouletteColor(n);
    const disc = $("#rouletteDisc"), orbit = $("#rouletteBallOrbit"), result = $("#rouletteResult");
    const step = 360 / rouletteOrder.length;
    result.textContent = ""; orbit.classList.remove("settle");

    const currentDiscMod = ((rouletteRotation % 360) + 360) % 360;
    const targetDiscMod = ((-(winIndex * step)) % 360 + 360) % 360;
    rouletteRotation += 5 * 360 + ((targetDiscMod - currentDiscMod + 360) % 360);
    rouletteBallRotation -= 7 * 360 + (((rouletteBallRotation % 360) + 360) % 360);

    disc.style.transition = "transform 4.4s cubic-bezier(.08,.72,.08,1)";
    orbit.style.transition = "transform 4.15s cubic-bezier(.08,.68,.08,1)";
    disc.style.transform = `rotate(${rouletteRotation}deg)`;
    orbit.style.transform = `rotate(${rouletteBallRotation}deg)`;

    let t = 0;
    const id = setInterval(() => { beep(330 + (t++ % 6) * 35, 0.02, 0.011); }, 95);
    await sleep(3750); orbit.classList.add("settle"); await sleep(450); clearInterval(id);

    result.textContent = n;
    result.style.color = color === "red" ? "#ff7180" : color === "green" ? "#64e69a" : "#edf2f7";
    beep(800, 0.12, 0.04);

    const win = rouletteBet.numbers.includes(n), rule = roulettePointRule();
    if (win && rule.special === "green") {
      const poolBefore = state.balance, giveAmount = poolBefore * 2;
      updateBalance(-poolBefore, `Roulette: Grøn 0! Pulje clearet.`, "auto", null, { giveAmount, giveLabel: `${giveAmount} tårer` });
      showResult("🟢 0 · GRØN JACKPOT", `Hele puljen på ${poolBefore} point blev clearet! Giv ${giveAmount} tårer videre!`, "good");
      confetti();
    } else if (win && rule.special === "straight") {
      const poolBefore = state.balance;
      updateBalance(-poolBefore, `Roulette: Nummer ${n} ramte!`, "auto", null);
      showResult(`${n} · JACKPOT`, `Dit enkelt-tal ramte! Hele puljen på ${poolBefore} point blev clearet.`, "good");
      confetti();
    } else if (win) {
      const reward = Math.max(1, Math.ceil(w * rule.winFraction));
      const actual = updateBalance(-reward, `Roulette: ${n} ${color}.`);
      showResult(`${n} · ${color === "red" ? "RØD" : color === "black" ? "SORT" : "GRØN"}`, `${rouletteBet.label} ramte. ${Math.abs(actual)} point forsvandt.`, "good");
    } else {
      const penalty = rule.lossFixed || Math.max(1, Math.ceil(w * rule.lossFraction));
      const actual = updateBalance(penalty, `Roulette: ${n} ${color}.`);
      showResult(`${n} · ${color === "red" ? "RØD" : color === "black" ? "SORT" : "GRØN"}`, `${rouletteBet.label} missede. ${actual} point lagt oveni.`, "bad");
    }
    setBusy(false);
  }

  registerGame({ id: "roulette", name: "Casino Roulette", icon: "🎯", desc: "Rød, sort eller tal", category: "wheel_cases", render: renderRoulette });

  // ==========================================================
  // 2. PLINKO (ÆGTE 7-RÆKKE PEG-BOUNCE & 3 RISIKO-NIVEAUER)
  // ==========================================================
  const PLINKO_RISK = {
    low: {
      label: "🟢 Blød",
      mults: [-2, -1.5, -1, 1, 1, -1, -1.5, -2],
      slots: [
        { text: "-2×", cls: "mega" }, { text: "-1.5×", cls: "win" }, { text: "-1×", cls: "win" }, { text: "+1×", cls: "bad" },
        { text: "+1×", cls: "bad" }, { text: "-1×", cls: "win" }, { text: "-1.5×", cls: "win" }, { text: "-2×", cls: "mega" }
      ]
    },
    medium: {
      label: "🟡 Medium",
      mults: [-3, -2, -1, 1, 1, -1, -2, -3],
      slots: [
        { text: "-3×", cls: "mega" }, { text: "-2×", cls: "win" }, { text: "-1×", cls: "win" }, { text: "+1×", cls: "bad" },
        { text: "+1×", cls: "bad" }, { text: "-1×", cls: "win" }, { text: "-2×", cls: "win" }, { text: "-3×", cls: "mega" }
      ]
    },
    high: {
      label: "🔴 Høj",
      mults: [-6, -3, -1, 1.5, 1.5, -1, -3, -6],
      slots: [
        { text: "-6×", cls: "mega" }, { text: "-3×", cls: "win" }, { text: "-1×", cls: "win" }, { text: "+1.5×", cls: "bad" },
        { text: "+1.5×", cls: "bad" }, { text: "-1×", cls: "win" }, { text: "-3×", cls: "win" }, { text: "-6×", cls: "mega" }
      ]
    }
  };
  let plinkoRisk = "medium";

  function plinkoPosToX(pos) {
    return ((pos + 0.5) / 8) * 100;
  }

  function renderPlinko(a) {
    const cfg = PLINKO_RISK[plinkoRisk] || PLINKO_RISK.medium;
    let pegs = "";
    for (let r = 0; r < 7; r++) {
      const startPos = 3.5 - r * 0.5;
      const count = r + 1;
      const yPct = 15 + r * 9.5;
      for (let c = 0; c < count; c++) {
        const p = startPos + c;
        const xPct = plinkoPosToX(p);
        pegs += `<i class="peg" data-peg="${r}-${p}" style="left:${xPct}%;top:${yPct}%"></i>`;
      }
    }
    a.innerHTML = `
      ${titleBlock("🔻 Plinko", "Ægte 7-rækkes peg-fald! Store gevinster i yderkanterne, straf i midten.")}
      <div class="bet-picks" style="margin-bottom:8px">
        ${Object.entries(PLINKO_RISK).map(([k, v]) => `<button type="button" class="btn bet-pick plinkoRiskBtn ${plinkoRisk === k ? "active" : ""}" style="flex:1" data-prisk="${k}">${v.label}</button>`).join("")}
      </div>
      <div class="plinko-board" id="plinkoBoard">
        ${pegs}<div class="plinko-chip" id="plinkoChip"></div>
        <div class="plinko-slots">${cfg.slots.map((s, i) => `<div class="plinko-slot ${s.cls}" data-slot="${i}">${s.text}</div>`).join("")}</div>
      </div>
      <button class="big-button" id="plinkoBtn">DROP CHIP</button>
      <div id="gameResult"></div>`;
    $$(".plinkoRiskBtn").forEach(b => b.onclick = () => {
      if (state.busy) return;
      plinkoRisk = b.dataset.prisk;
      renderPlinko(a);
    });
    $("#plinkoBtn").onclick = playPlinko;
  }

  async function playPlinko() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager();
    setBusy(true);
    $$(".plinkoRiskBtn").forEach(b => { b.disabled = true; });
    $$(".plinko-slot.hit").forEach(s => s.classList.remove("hit"));

    const cfg = PLINKO_RISK[plinkoRisk] || PLINKO_RISK.medium;
    const chip = $("#plinkoChip");
    let pos = 3.5;
    chip.style.left = "50%";
    chip.style.top = "5%";
    await sleep(90);

    for (let r = 0; r < 7; r++) {
      const yPct = 15 + r * 9.5;
      const pegEl = document.querySelector(`.peg[data-peg="${r}-${pos}"]`);
      chip.style.left = `${plinkoPosToX(pos)}%`;
      chip.style.top = `${yPct - 1.5}%`;
      if (pegEl) pegEl.classList.add("hit");
      beep(380 + r * 42, 0.025, 0.014);
      await sleep(145);
      if (pegEl) pegEl.classList.remove("hit");

      const dir = Math.random() < 0.5 ? -0.5 : 0.5;
      pos += dir;
      chip.style.left = `${plinkoPosToX(pos)}%`;
      chip.style.top = `${yPct + 4.5}%`;
      await sleep(75);
    }

    const slotIdx = clamp(Math.round(pos), 0, 7);
    chip.style.left = `${plinkoPosToX(slotIdx)}%`;
    chip.style.top = "86%";
    const hitSlot = document.querySelector(`.plinko-slot[data-slot="${slotIdx}"]`);
    if (hitSlot) hitSlot.classList.add("hit");
    await sleep(260);

    const mult = cfg.mults[slotIdx];
    const slotInfo = cfg.slots[slotIdx];
    const delta = mult < 0 ? -Math.max(1, Math.round(w * Math.abs(mult))) : Math.max(1, Math.round(w * mult));
    const actual = updateBalance(delta, `Plinko (${cfg.label}): ramte ${slotInfo.text}.`);
    if (mult <= -2) confetti();
    beep(mult < 0 ? 820 : 210, 0.13, 0.035);
    showResult(
      mult < 0 ? `🎯 PLINKO HIT · ${slotInfo.text}` : `💥 PLINKO MIDTE · ${slotInfo.text}`,
      actual < 0 ? `${Math.abs(actual)} point forsvandt!` : `${actual} point lagt oveni.`,
      mult < 0 ? "good" : "bad"
    );
    $$(".plinkoRiskBtn").forEach(b => { b.disabled = false; });
    setBusy(false);
  }

  registerGame({ id: "plinko", name: "Plinko", icon: "🔻", desc: "Lad chippen falde", category: "arcade", render: renderPlinko });

  // ==========================================================
  // 3. SAFE BOXES
  // ==========================================================
  let boxState = null;
  function boxRewardAmount(safeCount, w) {
    return safeCount < 2 ? 0 : safeCount === 2 ? Math.max(1, Math.round(w * 1.6)) : Math.max(2, Math.round(w * 3.0));
  }

  function renderBoxes(a) {
    const bombSet = new Set(); while (bombSet.size < 2) bombSet.add(Math.floor(Math.random() * 5));
    boxState = { bombSet, opened: new Set(), safeCount: 0, active: false, finished: false, wager: null };
    a.innerHTML = `
      ${titleBlock("💣 Safe Boxes", "5 bokse: 3 diamanter og 2 bomber. Åbn mindst 2 bokse før du kan cashe ud!")}
      <div class="box-grid">${Array.from({ length: 5 }, (_, i) => `<button class="safe-box" data-box="${i}">?</button>`).join("")}</div>
      <div id="boxActionArea" style="text-align:center;min-height:48px;display:flex;justify-content:center;align-items:center"><span class="muted" style="font-size:12px">Vælg din første boks</span></div>
      <div id="gameResult"></div>`;
    $$(".safe-box").forEach(b => b.onclick = () => playBox(+b.dataset.box));
  }

  function revealAllBoxes(chosenIdx = -1) {
    $$(".safe-box").forEach((b, i) => {
      b.disabled = true;
      if (i !== chosenIdx && !boxState.opened.has(i)) {
        const isBomb = boxState.bombSet.has(i);
        b.classList.add("open", isBomb ? "bomb" : "safe");
        b.textContent = isBomb ? "💣" : "💎";
      }
    });
  }

  function renderBoxRestart() {
    $("#boxActionArea").innerHTML = `<button class="big-button" id="boxRestartBtn">SPIL IGEN</button>`;
    $("#boxRestartBtn").onclick = () => renderBoxes($("#arena"));
  }

  function cashoutBoxes() {
    if (!boxState || boxState.finished || boxState.safeCount <= 0) return;
    const reward = boxRewardAmount(boxState.safeCount, boxState.wager);
    boxState.finished = true;
    revealAllBoxes();
    const actual = updateBalance(-reward, `Safe Boxes: cash out (${boxState.safeCount}/3).`);
    showResult(`💰 CASH OUT · ${boxState.safeCount}/3 SIKRE`, `Du tog gevinsten! ${Math.abs(actual)} point forsvandt.`, "good");
    renderBoxRestart();
  }

  async function playBox(choice) {
    if (state.busy || state.balance <= 0 || !boxState || boxState.finished || boxState.opened.has(choice)) return;
    if (!boxState.active) { boxState.wager = getWager(); boxState.active = true; }
    const w = boxState.wager;
    boxState.opened.add(choice);
    const btn = document.querySelector(`.safe-box[data-box="${choice}"]`);
    btn.disabled = true;

    if (boxState.bombSet.has(choice)) {
      boxState.finished = true;
      btn.classList.add("open", "bomb"); btn.textContent = "💣";
      beep(200, 0.2, 0.05); vibrate([100, 50, 150]);
      revealAllBoxes(choice);
      const actual = updateBalance(w, `Safe Boxes: ramte bombe.`);
      showResult("💣 BOOM · BOMBE RAMT!", `Fuld indsats tabt: ${actual} point lagt oveni puljen.`, "bad");
      renderBoxRestart();
      return;
    }

    boxState.safeCount++;
    btn.classList.add("open", "safe"); btn.textContent = "💎";
    beep(680 + boxState.safeCount * 60, 0.09, 0.03);

    if (boxState.safeCount >= 3) {
      boxState.finished = true;
      revealAllBoxes();
      const actual = updateBalance(-boxRewardAmount(3, w), `Safe Boxes: alle 3 fundet! Jackpot.`);
      showResult("💎💎💎 ALL CLEAR JACKPOT!", `Alle 3 diamanter fundet! ${Math.abs(actual)} point forsvandt!`, "good");
      confetti();
      renderBoxRestart();
      return;
    }

    if (boxState.safeCount < 2) {
      $("#boxActionArea").innerHTML = `<span class="muted" style="font-size:12px;font-weight:800">🔒 Åbn 1 diamant mere (min. 2) for Cash Out</span>`;
      return;
    }

    const curReward = boxRewardAmount(boxState.safeCount, w);
    $("#boxActionArea").innerHTML = `<button class="btn cashout-btn" style="width:100%" id="boxCashoutBtn">💰 CASH UD NU (-${curReward} POINT)</button>`;
    $("#boxCashoutBtn").onclick = cashoutBoxes;
  }

  registerGame({ id: "boxes", name: "Safe Boxes", icon: "💣", desc: "Undgå bomberne", category: "arcade", render: renderBoxes });

  // ==========================================================
  // 4. LUCKY 7
  // ==========================================================
  function renderLucky7(a) {
    a.innerHTML = `
      ${titleBlock("7️⃣ Lucky 7", "Præcis 7 er 2.5× JACKPOT! 6 eller 8 fjerner ½ indsats. Andre summer koster fuld indsats.")}
      <div class="dice-pair"><div class="mini-die" id="l7d1">⚅</div><div class="mini-die" id="l7d2">⚀</div></div>
      <button class="big-button" id="lucky7Btn">ROLL FOR 7</button>
      <div id="gameResult"></div>`;
    $("#lucky7Btn").onclick = playLucky7;
  }

  async function playLucky7() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager(), d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6);
    setBusy(true);
    const els = [$("#l7d1"), $("#l7d2")];
    els.forEach(e => { e.classList.remove("roll"); void e.offsetWidth; e.classList.add("roll"); });
    const id = setInterval(() => { els[0].textContent = dieFace(1 + Math.floor(Math.random() * 6)); els[1].textContent = dieFace(1 + Math.floor(Math.random() * 6)); beep(360 + Math.random() * 140, 0.02, 0.011); }, 90);
    await sleep(1100); clearInterval(id);
    els[0].textContent = dieFace(d1); els[1].textContent = dieFace(d2);
    const sum = d1 + d2;
    if (sum === 7) {
      const actual = updateBalance(-Math.max(2, Math.round(w * 2.5)), `Lucky 7: 7 Jackpot!`);
      showResult("🎉 LUCKY 7 JACKPOT!", `${Math.abs(actual)} point forsvandt! (2.5× indsats)`, "good"); confetti();
    } else if (sum === 6 || sum === 8) {
      const actual = updateBalance(-Math.max(1, Math.round(w * 0.5)), `Lucky 7: near hit ${sum}.`);
      showResult(`✨ NEAR HIT · ${sum}`, `${Math.abs(actual)} point forsvandt.`, "good");
    } else {
      const actual = updateBalance(w, `Lucky 7: sum ${sum}.`);
      showResult(`SUM ${sum}`, `${actual} point blev lagt oveni.`, "bad");
    }
    setBusy(false);
  }

  registerGame({ id: "lucky7", name: "Lucky 7", icon: "7️⃣", desc: "Ram præcis 7", category: "dice", render: renderLucky7 });

  // ==========================================================
  // 5. OVER / UNDER 7
  // ==========================================================
  let overUnderPick = "over";
  function renderOverUnder(a) {
    a.innerHTML = `
      ${titleBlock("↕️ Over / Under 7", "UNDER/OVER er 50/50 (7 = Push). PRÆCIS 7 fjerner 3× indsatsen!")}
      <div class="dice-pair"><div class="mini-die" id="oud1">⚂</div><div class="mini-die" id="oud2">⚃</div></div>
      <div class="bet-picks">
        <button class="btn bet-pick ouPick ${overUnderPick === "under" ? "active" : ""}" data-ou="under">UNDER 7</button>
        <button class="btn bet-pick ouPick ${overUnderPick === "seven" ? "active" : ""}" data-ou="seven">🎯 7 (3×)</button>
        <button class="btn bet-pick ouPick ${overUnderPick === "over" ? "active" : ""}" data-ou="over">OVER 7</button>
      </div>
      <button class="big-button" id="ouBtn">ROLL</button>
      <div id="gameResult"></div>`;
    $$(".ouPick").forEach(b => b.onclick = () => { overUnderPick = b.dataset.ou; $$(".ouPick").forEach(x => x.classList.toggle("active", x === b)); });
    $("#ouBtn").onclick = playOverUnder;
  }

  async function playOverUnder() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager(), d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6), sum = d1 + d2;
    setBusy(true);
    const a = $("#oud1"), b = $("#oud2"); a.classList.add("roll"); b.classList.add("roll");
    const id = setInterval(() => { a.textContent = dieFace(1 + Math.floor(Math.random() * 6)); b.textContent = dieFace(1 + Math.floor(Math.random() * 6)); beep(390, 0.02, 0.01); }, 95);
    await sleep(1050); clearInterval(id); a.textContent = dieFace(d1); b.textContent = dieFace(d2);
    const kind = sum < 7 ? "under" : sum === 7 ? "seven" : "over";

    if (overUnderPick === "seven") {
      if (kind === "seven") { const actual = updateBalance(-3 * w, `Over/Under: 7 Jackpot!`); showResult("🎯 PRÆCIS 7 JACKPOT!", `${Math.abs(actual)} point forsvandt!`, "good"); confetti(); }
      else { const actual = updateBalance(Math.max(1, Math.ceil(w / 3)), `Over/Under: miss på 7.`); showResult(`SUM ${sum}`, `${actual} point lagt oveni.`, "bad"); }
    } else if (kind === "seven") {
      updateBalance(0, `Over/Under: sum 7, push.`); showResult("7 · PUSH", "Ingen ændring i puljen.", "special");
    } else {
      const win = kind === overUnderPick;
      const actual = updateBalance(win ? -w : w, `Over/Under: sum ${sum}.`);
      showResult(`SUM ${sum}`, win ? `${Math.abs(actual)} point forsvandt.` : `${actual} point lagt oveni.`, win ? "good" : "bad");
    }
    setBusy(false);
  }

  registerGame({ id: "overunder", name: "Over / Under 7", icon: "↕️", desc: "Gæt terningesummen", category: "dice", render: renderOverUnder });

  // ==========================================================
  // 6. TRIPLE DICE
  // ==========================================================
  let triPick = "high";
  function renderTriDice(a) {
    a.innerHTML = `
      ${titleBlock("🎲 Triple Dice", "3 terninger: LOW (3–9) eller HIGH (12–18). Sum 10–11 er Push.")}
      <div class="dice-triple"><div class="mini-die" id="td1">⚀</div><div class="mini-die" id="td2">⚁</div><div class="mini-die" id="td3">⚂</div></div>
      <div class="bet-picks">
        <button class="btn bet-pick triPick ${triPick === "low" ? "active" : ""}" style="flex:1" data-tri="low">LOW (3–9)</button>
        <button class="btn bet-pick triPick ${triPick === "high" ? "active" : ""}" style="flex:1" data-tri="high">HIGH (12–18)</button>
      </div>
      <button class="big-button" id="triBtn">ROLL 3 DICE</button>
      <div id="gameResult"></div>`;
    $$(".triPick").forEach(b => b.onclick = () => { triPick = b.dataset.tri; $$(".triPick").forEach(x => x.classList.toggle("active", x === b)); });
    $("#triBtn").onclick = playTriDice;
  }

  async function playTriDice() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager(), ds = [0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6)), sum = ds.reduce((s, x) => s + x, 0);
    setBusy(true);
    const els = [$("#td1"), $("#td2"), $("#td3")]; els.forEach(e => e.classList.add("roll"));
    const id = setInterval(() => { els.forEach(e => e.textContent = dieFace(1 + Math.floor(Math.random() * 6))); beep(350 + Math.random() * 130, 0.02, 0.009); }, 80);
    await sleep(1100); clearInterval(id); els.forEach((e, i) => e.textContent = dieFace(ds[i]));
    if (sum === 10 || sum === 11) {
      updateBalance(0, `Triple Dice: ${sum} push.`); showResult(`SUM ${sum} · PUSH`, "Ingen ændring.", "special");
    } else {
      const win = (sum <= 9 ? "low" : "high") === triPick;
      const actual = updateBalance(win ? -w : w, `Triple Dice: sum ${sum}.`);
      showResult(`SUM ${sum}`, win ? `${Math.abs(actual)} point forsvandt.` : `${actual} point lagt oveni.`, win ? "good" : "bad");
    }
    setBusy(false);
  }

  registerGame({ id: "tridice", name: "Triple Dice", icon: "🎲", desc: "Høj eller lav sum", category: "dice", duel: true, render: renderTriDice });

  // ==========================================================
  // 7. THREE CUPS (RIGTIG KOP-BYTNING)
  // ==========================================================
  const CUP_SLOT_X = [17, 50, 83];
  const CUP_SLOT_NAMES = ["venstre", "midterste", "højre"];
  let cupsSpeed = "normal"; // "normal" (1x) | "fast" (2x)
  let cupsState = { phase: "idle", ballCup: 1, slots: [0, 1, 2] };

  function renderCups(a) {
    const ballCup = Math.floor(Math.random() * 3);
    cupsState = { phase: "ready", ballCup, slots: [0, 1, 2], speed: cupsSpeed };

    a.innerHTML = `
      ${titleBlock("🥤 Three Cups", "Følg bolden med øjnene når kopperne bytter plads! Normal = 1× gevinst · Lynhurtig = 2× gevinst.")}
      <div class="bet-picks" style="margin-bottom:8px">
        <button type="button" class="btn bet-pick cupsSpeedBtn ${cupsSpeed === "normal" ? "active" : ""}" style="flex:1" data-cspeed="normal">🐢 Normal (1×)</button>
        <button type="button" class="btn bet-pick cupsSpeedBtn ${cupsSpeed === "fast" ? "active" : ""}" style="flex:1" data-cspeed="fast">⚡ Lynhurtig (2×)</button>
      </div>
      <div class="cups-stage" id="cupsStage">
        ${[0, 1, 2].map(i => `
          <button type="button" class="cup ${i === ballCup ? "has-ball lift" : ""}" id="cup-${i}" data-cup="${i}" style="left:${CUP_SLOT_X[i]}%">
            🥤<i class="ball"></i>
          </button>`).join("")}
      </div>
      <div id="cupsPrompt" style="text-align:center;font-weight:900;margin:8px auto 10px;color:var(--gold);font-size:13px">Bolden starter under den ${CUP_SLOT_NAMES[ballCup]} kop!</div>
      <button class="big-button" id="cupsBtn">BLAND KOPPERNE</button>
      <div id="gameResult"></div>`;

    $$(".cupsSpeedBtn").forEach(b => b.onclick = () => {
      if (state.busy || cupsState.phase !== "ready") return;
      cupsSpeed = b.dataset.cspeed;
      renderCups(a);
    });
    $("#cupsBtn").onclick = startCupsShuffle;
  }

  async function startCupsShuffle() {
    if (state.busy || state.balance <= 0 || cupsState.phase !== "ready") return;
    setBusy(true);
    cupsState.phase = "shuffling";
    $("#cupsBtn").disabled = true;
    $$(".cupsSpeedBtn").forEach(b => { b.disabled = true; });
    $("#cupsPrompt").textContent = "Hold øje med bolden...";

    const oldCup = $(`#cup-${cupsState.ballCup}`);
    if (oldCup) oldCup.classList.remove("lift");
    await sleep(340);
    $$(".cup").forEach(c => c.classList.remove("has-ball"));

    const isFast = cupsSpeed === "fast";
    const swaps = isFast ? 10 : 7;
    const swapDur = isFast ? 215 : 340;
    let lastPairKey = "";

    for (let s = 0; s < swaps; s++) {
      let sA, sB;
      const ballSlot = cupsState.slots[cupsState.ballCup];
      // Involvér næsten altid bold-koppen eller nabokopper for ægte udfordring, uden at gentage præcis samme swap 2× i træk
      do {
        if (Math.random() < 0.78) {
          sA = ballSlot;
          const others = [0, 1, 2].filter(x => x !== sA);
          sB = others[Math.floor(Math.random() * others.length)];
        } else {
          sA = Math.floor(Math.random() * 3);
          const others = [0, 1, 2].filter(x => x !== sA);
          sB = others[Math.floor(Math.random() * others.length)];
        }
      } while (`${Math.min(sA, sB)}-${Math.max(sA, sB)}` === lastPairKey);
      lastPairKey = `${Math.min(sA, sB)}-${Math.max(sA, sB)}`;

      const cupAId = cupsState.slots.indexOf(sA);
      const cupBId = cupsState.slots.indexOf(sB);
      const elA = $(`#cup-${cupAId}`);
      const elB = $(`#cup-${cupBId}`);

      cupsState.slots[cupAId] = sB;
      cupsState.slots[cupBId] = sA;

      if (elA && elB) {
        const trans = `left ${swapDur}ms cubic-bezier(.4,0,.2,1), transform ${Math.round(swapDur * 0.5)}ms ease`;
        elA.style.transition = trans;
        elB.style.transition = trans;
        elA.style.zIndex = "5";
        elB.style.zIndex = "2";
        elA.style.transform = "translate(-50%, -20px)";
        elB.style.transform = "translate(-50%, 10px)";
        elA.style.left = `${CUP_SLOT_X[sB]}%`;
        elB.style.left = `${CUP_SLOT_X[sA]}%`;
        beep(430 + (s % 4) * 55, 0.035, 0.015);
        await sleep(Math.round(swapDur * 0.55));
        elA.style.transform = "translate(-50%, 0)";
        elB.style.transform = "translate(-50%, 0)";
        await sleep(Math.round(swapDur * 0.52));
        elA.style.zIndex = "3";
        elB.style.zIndex = "3";
      }
    }

    cupsState.phase = "pick";
    $("#cupsPrompt").textContent = "Hvor er bolden? Vælg en kop!";
    $("#cupsBtn").classList.add("hidden");
    $$(".cup").forEach(c => { c.onclick = () => chooseCup(+c.dataset.cup); });
    setBusy(false);
  }

  async function chooseCup(choiceCupId) {
    if (state.busy || state.balance <= 0 || cupsState.phase !== "pick") return;
    const w = getWager();
    setBusy(true);
    cupsState.phase = "done";

    const winnerCupEl = $(`#cup-${cupsState.ballCup}`);
    const chosenCupEl = $(`#cup-${choiceCupId}`);
    if (winnerCupEl) winnerCupEl.classList.add("has-ball");
    if (chosenCupEl) {
      chosenCupEl.style.transition = "";
      chosenCupEl.style.transform = "";
      chosenCupEl.classList.add("lift");
    }

    const win = choiceCupId === cupsState.ballCup;
    if (!win && winnerCupEl) {
      await sleep(360);
      winnerCupEl.style.transition = "";
      winnerCupEl.style.transform = "";
      winnerCupEl.classList.add("lift");
    }

    beep(win ? 790 : 230, 0.12, 0.035);
    const reward = cupsSpeed === "fast" ? Math.max(2, Math.round(w * 2)) : w;
    const actual = updateBalance(win ? -reward : w, `Three Cups (${cupsSpeed === "fast" ? "Lynhurtig" : "Normal"}): ${win ? "ramte" : "missede"} bolden.`);
    const ballPosName = CUP_SLOT_NAMES[cupsState.slots[cupsState.ballCup]] || "";
    showResult(
      win ? "🎉 DU FANDT BOLDEN!" : `BOLDEN VAR UNDER DEN ${ballPosName.toUpperCase()} KOP`,
      win ? `${Math.abs(actual)} point forsvandt!` : `${actual} point lagt oveni.`,
      win ? "good" : "bad"
    );
    if (win) confetti();

    const btn = $("#cupsBtn");
    btn.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "SPIL IGEN";
    btn.onclick = () => { if (!state.busy) renderCups($("#arena")); };
    $$(".cupsSpeedBtn").forEach(b => { b.disabled = false; });
    setBusy(false);
  }

  registerGame({ id: "cups", name: "Three Cups", icon: "🥤", desc: "Find bolden", category: "arcade", render: renderCups });

  // ==========================================================
  // 8. PICK A NUMBER
  // ==========================================================
  let pickedNumber = 6;
  function renderPickNumber(a) {
    a.innerHTML = `
      ${titleBlock("🔢 Pick a Number", "Direkte hit = 3× JACKPOT! Nabotal = ½× save. Miss = fuld straf.")}
      <div class="big-number" id="numberReveal">?</div>
      <div class="number-picks">${[1, 2, 3, 4, 5, 6].map(n => `<button class="number-pick ${n === pickedNumber ? "active" : ""}" data-num="${n}">${n}</button>`).join("")}</div>
      <button class="big-button" id="numberBtn">TRÆK TAL</button>
      <div id="gameResult"></div>`;
    $$(".number-pick").forEach(b => b.onclick = () => { pickedNumber = +b.dataset.num; $$(".number-pick").forEach(x => x.classList.toggle("active", x === b)); });
    $("#numberBtn").onclick = playPickNumber;
  }

  async function playPickNumber() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager(), n = 1 + Math.floor(Math.random() * 6);
    setBusy(true); const el = $("#numberReveal");
    for (let i = 0; i < 12; i++) { el.textContent = 1 + Math.floor(Math.random() * 6); beep(400 + i * 20, 0.025, 0.01); await sleep(70 + i * 4); }
    el.textContent = n;
    const exact = n === pickedNumber, left = pickedNumber === 1 ? 6 : pickedNumber - 1, right = pickedNumber === 6 ? 1 : pickedNumber + 1;
    if (exact) {
      beep(850, 0.12, 0.04);
      const actual = updateBalance(-Math.max(2, Math.round(w * 3)), `Pick a Number: direkte hit ${n}!`);
      showResult(`🎯 DIREKTE HIT · ${n}`, `${Math.abs(actual)} point forsvandt! (3× jackpot)`, "good"); confetti();
    } else if (n === left || n === right) {
      beep(680, 0.12, 0.035);
      const actual = updateBalance(-Math.max(1, Math.round(w * 0.5)), `Pick a Number: nabotal ${n}.`);
      showResult(`✨ NABOTAL · ${n}`, `${Math.abs(actual)} point forsvandt (dit valg: ${pickedNumber}).`, "good");
    } else {
      beep(250, 0.12, 0.04);
      const actual = updateBalance(w, `Pick a Number: miss ${n}.`);
      showResult(`NUMMER ${n}`, `${actual} point lagt oveni (dit valg: ${pickedNumber}).`, "bad");
    }
    setBusy(false);
  }

  registerGame({ id: "picknumber", name: "Pick a Number", icon: "🔢", desc: "Ram tal 1–6", category: "dice", duel: true, render: renderPickNumber });

  // ==========================================================
  // 9. ROCK PAPER SCISSORS
  // ==========================================================
  const rpsMap = { rock: "✊", paper: "✋", scissors: "✌️" };
  function renderRps(a) {
    a.innerHTML = `
      ${titleBlock("✊ Rock Paper Scissors", "Slå huset! Sejr fjerner indsats, tab giver straf.")}
      <div class="rps-stage"><div class="rps-hand" id="rpsYou">❔</div><div style="font-weight:1000">VS</div><div class="rps-hand" id="rpsHouse">❔</div></div>
      <div class="bet-picks">
        <button class="btn rpsPick" style="flex:1" data-rps="rock">✊ STEN</button>
        <button class="btn rpsPick" style="flex:1" data-rps="paper">✋ PAPIR</button>
        <button class="btn rpsPick" style="flex:1" data-rps="scissors">✌️ SAKS</button>
      </div>
      <div id="gameResult"></div>`;
    $$(".rpsPick").forEach(b => b.onclick = () => playRps(b.dataset.rps));
  }

  async function playRps(choice) {
    if (state.busy || state.balance <= 0) return;
    const w = getWager(), opts = ["rock", "paper", "scissors"], house = opts[Math.floor(Math.random() * 3)];
    setBusy(true);
    const y = $("#rpsYou"), h = $("#rpsHouse");
    y.classList.remove("shake"); h.classList.remove("shake");
    y.textContent = "✊"; h.textContent = "✊"; void y.offsetWidth;
    y.classList.add("shake"); h.classList.add("shake");
    await sleep(650);
    y.classList.remove("shake"); h.classList.remove("shake");
    y.textContent = rpsMap[choice]; h.textContent = rpsMap[house];
    const tie = choice === house;
    const win = (choice === "rock" && house === "scissors") || (choice === "paper" && house === "rock") || (choice === "scissors" && house === "paper");
    const actual = updateBalance(tie ? 0 : win ? -w : w, `RPS: ${choice} mod ${house}.`);
    showResult(tie ? "UAFGJORT" : win ? "DU VINDER" : "HUSET VINDER",
      `${rpsMap[choice]} mod ${rpsMap[house]}. ${actual < 0 ? Math.abs(actual) + " point forsvandt." : actual > 0 ? actual + " point lagt oveni." : "Ingen ændring."}`, tie ? "special" : win ? "good" : "bad");
    setBusy(false);
  }

  registerGame({ id: "rps", name: "Rock Paper Scissors", icon: "✊", desc: "Sten, saks, papir", category: "arcade", duel: true, render: renderRps });

  // ==========================================================
  // 10. CRASH
  // ==========================================================
  let crashRunning = false, crashCashoutRequested = false;
  function renderCrash(a) {
    crashRunning = false; crashCashoutRequested = false;
    a.innerHTML = `
      ${titleBlock("📈 Crash", "Cash ud fra 1.67x før raketten crasher!")}
      <div class="crash-stage">
        <div class="crash-grid"></div><div class="crash-line" id="crashLine"></div>
        <div class="crash-mult" id="crashMult">1.000x</div>
        <div class="crash-note" id="crashNote">Cash out er klar fra 1.67x</div>
      </div>
      <button class="big-button" id="crashBtn">START CRASH</button>
      <div id="gameResult"></div>`;
    $("#crashBtn").onclick = () => {
      if (crashRunning) { if (!$("#crashBtn").disabled) crashCashoutRequested = true; return; }
      playCrash();
    };
  }

  function randomCrashPoint() {
    const r = Math.random();
    if (r < 0.22) return 1.01 + Math.random() * 0.18;
    if (r < 0.55) return 1.20 + Math.random() * 0.70;
    if (r < 0.80) return 1.90 + Math.random() * 1.60;
    if (r < 0.94) return 3.50 + Math.random() * 4.50;
    return 8.00 + Math.random() * 12.00;
  }

  function crashRewardFraction(mult) {
    if (mult < 2.00) return 1.00; if (mult < 3.00) return 1.70; if (mult < 5.00) return 2.40; return 3.50;
  }

  async function playCrash() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager(); setBusy(true); crashRunning = true; crashCashoutRequested = false;
    const btn = $("#crashBtn"), multEl = $("#crashMult"), dot = $("#crashLine"), note = $("#crashNote");
    const crashAt = randomCrashPoint();
    btn.disabled = true; btn.textContent = "STARTER..."; multEl.classList.remove("crashed");
    let mult = 1.000, cashed = false, tick = 0;

    while (mult < crashAt) {
      mult += 0.012 + mult * 0.0022;
      multEl.textContent = mult.toFixed(3) + "x";
      if (mult >= 1.670 && btn.disabled) { btn.disabled = false; btn.textContent = "💰 CASH OUT"; note.textContent = "Cash out er åben!"; beep(720, 0.05, 0.02); }
      if (crashCashoutRequested && mult >= 1.670) { cashed = true; break; }
      const progress = clamp(Math.log(mult) / Math.log(18), 0, 1);
      dot.style.left = `${4 + progress * 88}%`; dot.style.bottom = `${18 + progress * 175}px`;
      if (tick++ % 3 === 0) beep(285 + progress * 450, 0.012, 0.004);
      await sleep(55);
    }

    crashRunning = false; btn.disabled = true;
    if (cashed) {
      const fraction = crashRewardFraction(mult);
      const actual = updateBalance(-Math.max(1, Math.round(w * fraction)), `Crash: ${mult.toFixed(3)}x!`);
      showResult(`💰 CASH OUT ${mult.toFixed(3)}x!`, `${Math.abs(actual)} point forsvandt fra puljen!`, "good");
      if (fraction >= 1.5) confetti();
    } else {
      multEl.textContent = "CRASH"; multEl.classList.add("crashed"); beep(180, 0.18, 0.05); vibrate(100);
      const actual = updateBalance(w, `Crash: ${crashAt.toFixed(3)}x.`);
      showResult(`💥 CRASH VED ${crashAt.toFixed(3)}x`, `Raketten eksploderede! ${actual} point lagt oveni.`, "bad");
    }
    setBusy(false);
    if (state.game === "crash" && $("#crashBtn")) { $("#crashBtn").disabled = false; $("#crashBtn").textContent = "START IGEN"; }
  }

  registerGame({ id: "crash", name: "Crash", icon: "📈", desc: "Cash ud før crash", category: "arcade", render: renderCrash });

  // ==========================================================
  // 11. RABBIT ADVENTURE
  // ==========================================================
  let rabbitState = null;
  function rabbitRewardAmount(hops, w) {
    if (hops < 2) return 0;
    if (hops === 2) return w;
    if (hops === 3) return Math.max(2, Math.round(w * 1.6));
    if (hops === 4) return Math.max(2, Math.round(w * 2.4));
    return Math.max(3, Math.round(w * 3.5));
  }
  function rabbitProgressHtml(step) {
    return [1, 2, 3, 4, 5].map(i => `<i class="${i < step ? "done" : i === step ? "current" : ""}"></i>`).join("");
  }

  function renderRabbit(a) {
    rabbitState = { step: 1, traps: Array.from({ length: 5 }, () => Math.floor(Math.random() * 3)), active: false, finished: false, animating: false, wager: null };
    const rows = [5, 4, 3, 2, 1].map(step => `
      <div class="rabbit-row" data-step="${step}">
        ${[0, 1, 2].map(col => `<button class="rabbit-pad ${step === 1 ? "" : "locked"}" data-rabbit-step="${step}" data-rabbit-col="${col}" ${step === 1 ? "" : "disabled"}>${col + 1}</button>`).join("")}
      </div>`).join("");
    a.innerHTML = `
      ${titleBlock("🐇 Rabbit Adventure", "2 sikre, 1 fælde pr. række! Cash ud undervejs eller nå mål for 3× JACKPOT.")}
      <div class="rabbit-status"><strong id="rabbitStepText">Hop 1 af 5</strong><div class="rabbit-progress" id="rabbitProgress">${rabbitProgressHtml(1)}</div><span class="muted" id="rabbitStakeText" style="font-size:10.5px">Låses ved hop 1</span></div>
      <div class="rabbit-board" id="rabbitBoard"><div class="rabbit-goal">🏁 MÅL (3× JACKPOT)</div>${rows}<div class="rabbit-start">START</div><div class="rabbit-token" id="rabbitToken">🐇</div></div>
      <div class="rabbit-instruction" id="rabbitInstruction">Vælg en plade på første række.</div>
      <button class="big-button hidden" id="rabbitRestartBtn">START IGEN</button>
      <div id="gameResult"></div>`;
    $$(".rabbit-pad").forEach(p => p.onclick = () => rabbitChoose(+p.dataset.rabbitStep, +p.dataset.rabbitCol, p));
    $("#rabbitRestartBtn").onclick = () => { if (!state.busy) renderRabbit($("#arena")); };
  }

  function rabbitRevealRow(step, chosenCol, trapCol) {
    const row = document.querySelector(`.rabbit-row[data-step="${step}"]`);
    if (!row) return;
    row.querySelectorAll(".rabbit-pad").forEach(p => {
      const col = +p.dataset.rabbitCol;
      p.disabled = true; p.classList.remove("locked");
      if (col === trapCol) { p.classList.add("trap"); p.textContent = "💀"; }
      else { p.classList.add("safe"); p.textContent = "✓"; }
    });
  }

  async function rabbitChoose(step, col, pad) {
    if (!rabbitState || rabbitState.finished || rabbitState.animating || step !== rabbitState.step) return;
    if (!rabbitState.active) {
      rabbitState.wager = getWager(); rabbitState.active = true; setBusy(true);
      if ($("#rabbitStakeText")) $("#rabbitStakeText").textContent = `Indsats: ${rabbitState.wager}`;
    }
    const w = rabbitState.wager; rabbitState.animating = true;
    const row = document.querySelector(`.rabbit-row[data-step="${step}"]`);
    if (row) row.querySelectorAll(".rabbit-pad").forEach(p => { p.disabled = true; });

    const board = $("#rabbitBoard"), rabbit = $("#rabbitToken"), br = board.getBoundingClientRect(), pr = pad.getBoundingClientRect();
    rabbit.style.bottom = "auto";
    rabbit.style.left = `${pr.left - br.left + pr.width / 2}px`;
    rabbit.style.top = `${pr.top - br.top + pr.height / 2}px`;
    rabbit.style.transform = "translate(-50%,-50%)";
    beep(520, 0.055, 0.018); await sleep(580);

    const trap = rabbitState.traps[step - 1];
    rabbitRevealRow(step, col, trap);

    if (col === trap) {
      rabbitState.finished = true; rabbit.classList.add("falling"); beep(180, 0.2, 0.05); vibrate([90, 60, 120]);
      for (let s = 1; s <= 5; s++) rabbitRevealRow(s, -1, rabbitState.traps[s - 1]);
      const actual = updateBalance(w, `Rabbit: faldt på hop ${step}.`);
      showResult(`🐇💥 FALDT PÅ HOP ${step}`, `${actual} point lagt oveni.`, "bad");
      rabbitState.animating = false; setBusy(false);
      if (state.balance > 0 && state.balance < getBustLimit()) $("#rabbitRestartBtn").classList.remove("hidden");
      return;
    }

    beep(760, 0.08, 0.025);
    if (step >= 5) {
      rabbitState.finished = true;
      confetti();
      const actual = updateBalance(-rabbitRewardAmount(5, w), `Rabbit: mål nået! Jackpot.`);
      showResult("🏁🐇 MÅL NÅET · 3× JACKPOT!", `Alle 5 hop klaret! ${Math.abs(actual)} point forsvandt!`, "good");
      rabbitState.animating = false; setBusy(false);
      if (state.balance > 0 && state.balance < getBustLimit()) $("#rabbitRestartBtn").classList.remove("hidden");
      return;
    }

    rabbitState.step++;
    const nextStep = rabbitState.step, curReward = rabbitRewardAmount(step, w);
    $("#rabbitStepText").textContent = `Hop ${nextStep} af 5`;
    $("#rabbitProgress").innerHTML = rabbitProgressHtml(nextStep);
    const nextRow = document.querySelector(`.rabbit-row[data-step="${nextStep}"]`);
    if (nextRow) nextRow.querySelectorAll(".rabbit-pad").forEach(p => { p.disabled = false; p.classList.remove("locked"); });
    if (step < 2) {
      $("#rabbitInstruction").innerHTML = `<span class="muted" style="font-size:12px;font-weight:800">🔒 Klar mindst 2 hop før Cash Out låser op</span>`;
      rabbitState.animating = false;
      return;
    }
    $("#rabbitInstruction").innerHTML = `<button class="btn cashout-btn" style="width:100%" id="rabbitCashoutBtn">💰 CASH UD NU (-${curReward} POINT)</button>`;
    $("#rabbitCashoutBtn").onclick = () => {
      if (!rabbitState || rabbitState.finished) return;
      rabbitState.finished = true;
      for (let s = 1; s <= 5; s++) rabbitRevealRow(s, -1, rabbitState.traps[s - 1]);
      const actual = updateBalance(-curReward, `Rabbit: cash out efter hop ${step}.`);
      showResult(`💰 CASH OUT · HOP ${step} KLARET`, `${Math.abs(actual)} point forsvandt.`, "good");
      rabbitState.animating = false; setBusy(false);
      if (state.balance > 0 && state.balance < getBustLimit()) $("#rabbitRestartBtn").classList.remove("hidden");
    };
    rabbitState.animating = false;
  }

  registerGame({ id: "rabbit", name: "Rabbit Adventure", icon: "🐇", desc: "5 hop · undgå fælden", category: "arcade", render: renderRabbit });
})();
