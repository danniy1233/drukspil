(() => {
  const { $, $$, sleep, state, registerGame, beep, vibrate, confetti, titleBlock, setBusy, getWager, updateBalance, showResult, renderTransferBox } = window.Arcade;

  // ==========================================================
  // 1. RISK WHEEL
  // ==========================================================
  const wheelOptions = [
    { label: "0x", kind: "delta", delta: w => -w, text: "Hele indsatsen forsvinder" },
    { label: "½x", kind: "delta", delta: w => -Math.max(1, Math.floor(w / 2)), text: "Halvdelen af indsatsen forsvinder" },
    { label: "1x", kind: "delta", delta: () => 0, text: "Ingen ændring" },
    { label: "1½x", kind: "delta", delta: w => Math.max(1, Math.ceil(w / 2)), text: "En halv indsats bliver lagt oveni" },
    { label: "2x", kind: "delta", delta: w => w, text: "Indsatsen bliver lagt oveni" },
    { label: "3x", kind: "delta", delta: w => 2 * w, text: "Dobbelt indsats bliver lagt oveni" },
    { label: "-1", kind: "fixed", amount: -1, text: "Ét point forsvinder" },
    { label: "+1", kind: "fixed", amount: 1, text: "Ét point bliver lagt oveni" },
    { label: "GIV UD", kind: "give", text: "Giv den gamblede indsats ud til andre" },
    { label: "GIV ½", kind: "giveHalf", text: "Giv halvdelen af indsatsen ud til andre" },
    { label: "3 SIP", kind: "sips", amount: 3, text: "Tag 3 slurke som særudfald" },
    { label: "1 SHOT", kind: "shot", text: "Tag 1 shot som særudfald" },
    { label: "HALV PULJE", kind: "halfPool", text: "Halvdelen af hele puljen forsvinder" },
    { label: "CLEAR", kind: "clear", text: "Hele puljen går i 0" },
    { label: "RE-SPIN", kind: "respin", text: "Hjulet spinner én gang til" },
    { label: "+2", kind: "fixed", amount: 2, text: "To point bliver lagt oveni" }
  ];

  function renderWheel(a) {
    const step = 360 / wheelOptions.length;
    const radius = 108;
    const labels = wheelOptions.map((o, i) => {
      const angle = i * step;
      return `<div class="wheel-label" style="transform:rotate(${angle}deg) translateY(-${radius}px) rotate(${-angle}deg)">${o.label}</div>`;
    }).join("");

    const colors = [
      "#273547", "#315585", "#5f4592", "#923c7f",
      "#2f7b61", "#8a5b27", "#7a3448", "#365e75",
      "#466f45", "#72508c", "#6a4b8c", "#8e5260",
      "#2f665a", "#9b762e", "#43556b", "#7c3d58"
    ];
    const slices = colors.map((color, i) => `${color} ${i * step}deg ${(i + 1) * step}deg`).join(",");
    const tickCount = 48;
    const ticks = Array.from({ length: tickCount }, (_, i) =>
      `<i class="tick" style="transform:translate(-50%,-50%) rotate(${i * (360 / tickCount)}deg) translateY(-140px)"></i>`
    ).join("");

    a.innerHTML = `
      ${titleBlock("🎡 Risk Wheel", "16 udfald: store saves, GIV UD, HALV PULJE, CLEAR og RE-SPIN.")}
      <div class="wheel-stage">
        <div class="wheel-shell">
          <div class="wheel-pointer"></div>
          <div class="wheel" id="wheel" style="background:conic-gradient(from -${step / 2}deg,${slices})">${labels}</div>
          <div class="wheel-ticks">${ticks}</div>
        </div>
      </div>
      <button class="big-button" id="wheelBtn">SPIN HJULET</button>
      <div id="gameResult"></div>`;
    $("#wheel").style.transform = `rotate(${state.wheelRotation}deg)`;
    $("#wheelBtn").onclick = () => spinWheel(false);
  }

  async function spinWheel(isRespin = false) {
    if ((state.busy && !isRespin) || state.balance <= 0) return;
    const w = getWager();
    const index = Math.floor(Math.random() * wheelOptions.length);
    const opt = wheelOptions[index];

    if (!isRespin) setBusy(true);
    $("#wheelBtn").disabled = true;
    const localResult = $("#gameResult");
    if (localResult) localResult.innerHTML = "";

    const step = 360 / wheelOptions.length;
    const segmentCenter = index * step;
    const currentMod = ((state.wheelRotation % 360) + 360) % 360;
    const targetMod = ((360 - segmentCenter) % 360 + 360) % 360;
    const correction = (targetMod - currentMod + 360) % 360;
    const turns = 5 + Math.floor(Math.random() * 3);
    state.wheelRotation += turns * 360 + correction;

    const wheel = $("#wheel");
    wheel.style.transition = "transform 4.6s cubic-bezier(.08,.72,.08,1)";
    wheel.style.transform = `rotate(${state.wheelRotation}deg)`;

    let t = 0;
    const ticker = setInterval(() => { beep(500 + (t++ % 6) * 26, 0.025, 0.013); }, 105);
    await sleep(4620);
    clearInterval(ticker);
    beep(840, 0.12, 0.04);

    if (opt.kind === "delta") {
      const actual = updateBalance(opt.delta(w), `Risk Wheel: ${opt.label}.`);
      showResult(`🎡 ${opt.label}`,
        actual < 0 ? `${Math.abs(actual)} point forsvandt fra puljen.` :
        actual > 0 ? `${actual} point blev lagt oveni puljen.` : "Puljen ændrede sig ikke.",
        actual < 0 ? "good" : actual > 0 ? "bad" : "");
    } else if (opt.kind === "fixed") {
      const actual = updateBalance(opt.amount, `Risk Wheel: ${opt.label}.`);
      showResult(`🎡 ${opt.label}`,
        actual < 0 ? `${Math.abs(actual)} point forsvandt.` :
        actual > 0 ? `${actual} point blev lagt oveni.` : "Ingen ændring.",
        actual < 0 ? "good" : actual > 0 ? "bad" : "");
    } else if (opt.kind === "give") {
      const actual = updateBalance(-w, `Risk Wheel: Giv ${w} point ud.`, "auto", null, { giveAmount: w, giveLabel: `${w} tårer` });
      showResult("🎁 GIV UD", `Giv ${Math.abs(actual)} point ud til de andre. De er fjernet fra din egen pulje.`, "good");
    } else if (opt.kind === "giveHalf") {
      const amount = Math.max(1, Math.ceil(w / 2));
      const actual = updateBalance(-amount, `Risk Wheel: Giv ${amount} point ud.`, "auto", null, { giveAmount: amount, giveLabel: `${amount} tårer` });
      showResult("🎁 GIV HALVDELEN UD", `Giv ${Math.abs(actual)} point ud til de andre. De er fjernet fra din egen pulje.`, "good");
    } else if (opt.kind === "shot") {
      const actual = updateBalance(-w, `Risk Wheel: 1 shot. Indsats fjernet.`, "none");
      showResult("🥃 1 SHOT", `Tag 1 shot! Samtidig fjernes ${Math.abs(actual)} point fra din pulje.`, "special");
      vibrate([60, 50, 60]);
    } else if (opt.kind === "sips") {
      const actual = updateBalance(-w, `Risk Wheel: ${opt.amount} slurke. Indsats fjernet.`, "none");
      showResult(`🍻 ${opt.amount} SLURKE`, `Tag ${opt.amount} slurke! Samtidig fjernes ${Math.abs(actual)} point fra din pulje.`, "special");
      vibrate([40, 40, 40]);
    } else if (opt.kind === "halfPool") {
      const amount = Math.max(1, Math.ceil(state.balance / 2));
      const actual = updateBalance(-amount, `Risk Wheel: Halv pulje forsvandt.`);
      showResult("✂️ HALV PULJE", `${Math.abs(actual)} point forsvandt fra hele din pulje.`, "good");
    } else if (opt.kind === "clear") {
      const actual = updateBalance(-state.balance, `Risk Wheel: CLEAR! Hele puljen i 0.`);
      showResult("🔥 CLEAR", `Hele puljen blev fjernet. ${Math.abs(actual)} point forsvandt.`, "good");
    } else if (opt.kind === "respin") {
      if (isRespin) {
        showResult("🔁 RE-SPIN", "Du ramte RE-SPIN igen. Denne gang bliver det til 1x, så puljen ændrer sig ikke.", "special");
      } else {
        showResult("🔁 RE-SPIN", "Ingen ændring endnu. Hjulet spinner automatisk én gang til.", "special", { skipModal: true });
        await sleep(850);
        return spinWheel(true);
      }
    }

    setBusy(false);
    if ($("#wheelBtn")) $("#wheelBtn").disabled = false;
  }

  registerGame({
    id: "wheel",
    name: "Risk Wheel",
    icon: "🎡",
    desc: "Roterende lykkehjul",
    category: "wheel_cases",
    render: renderWheel
  });

  // ==========================================================
  // 2. CS:GO CASE OPENING (ALL 138 SKINS PRESERVED)
  // ==========================================================
  const rarityMeta = {
    common: { label: "Mil-Spec", quality: "Grå / Almindelig", color: "#aeb8c5", chance: "54.0%" },
    blue:   { label: "Restricted", quality: "Blå / Lidt sjælden", color: "#5ea1ff", chance: "24.0%" },
    purple: { label: "Classified", quality: "Lilla / Sjælden", color: "#a578ff", chance: "13.0%" },
    pink:   { label: "Covert", quality: "Pink / Meget sjælden", color: "#eb63cf", chance: "6.0%" },
    gold:   { label: "Special Rare ★", quality: "Guld / Kniv & Handsker", color: "#ffc857", chance: "3.0%" }
  };

  const lootTable = [
    // MIL-SPEC (40 skins · 1.35% hver)
    {name:"P250 | Sand Dune",e:"🔫",cls:"common",kind:"delta",mult:.5,weight:1.35,desc:"+50% indsats til puljen"},
    {name:"MP9 | Storm",e:"🔫",cls:"common",kind:"delta",mult:1,weight:1.35,desc:"+100% indsats til puljen"},
    {name:"MAG-7 | Rust Coat",e:"🔫",cls:"common",kind:"delta",mult:.25,weight:1.35,desc:"+25% indsats til puljen"},
    {name:"Nova | Predator",e:"🍻",cls:"common",kind:"sips",amount:1,weight:1.35,desc:"Tag 1 tåre selv"},
    {name:"Dual Berettas | Colony",e:"🔫",cls:"common",kind:"delta",mult:.5,weight:1.35,desc:"+50% indsats til puljen"},
    {name:"UMP-45 | Mud-Spec",e:"➖",cls:"common",kind:"delta",mult:0,weight:1.35,desc:"Dud! Puljen ændres ikke"},
    {name:"SG 553 | Waves Perforated",e:"🔫",cls:"common",kind:"delta",mult:.75,weight:1.35,desc:"+75% indsats til puljen"},
    {name:"G3SG1 | Polar Camo",e:"💥",cls:"common",kind:"delta",mult:1.5,weight:1.35,desc:"Heavy Debt! +150% indsats"},
    {name:"Negev | Army Sheen",e:"🍻",cls:"common",kind:"sips",amount:2,weight:1.35,desc:"Tag 2 tårer selv!"},
    {name:"P90 | Grim",e:"🔫",cls:"common",kind:"delta",mult:.5,weight:1.35,desc:"+50% indsats til puljen"},
    {name:"Five-SeveN | Forest Night",e:"📈",cls:"common",kind:"delta",mult:1,weight:1.35,desc:"+100% indsats til puljen"},
    {name:"FAMAS | Colony",e:"😮‍💨",cls:"common",kind:"delta",mult:0,weight:1.35,desc:"Close Call! Slap med skrækken"},
    {name:"Sawed-Off | Forest DDPAT",e:"🍻",cls:"common",kind:"sips",amount:2,mult:.5,weight:1.35,desc:"Tag 2 tårer + 50% til puljen"},
    {name:"PP-Bizon | Water Sigil",e:"🔫",cls:"common",kind:"delta",mult:.75,weight:1.35,desc:"+75% indsats til puljen"},
    {name:"MP7 | Cirrus",e:"🔫",cls:"common",kind:"delta",mult:.5,weight:1.35,desc:"+50% indsats til puljen"},
    {name:"CZ75-Auto | Pole Position",e:"🔫",cls:"common",kind:"delta",mult:1,weight:1.35,desc:"+100% indsats til puljen"},
    {name:"SG 553 | Aloha",e:"🍻",cls:"common",kind:"sips",amount:1,weight:1.35,desc:"Tag 1 tåre selv"},
    {name:"MP9 | Black Sand",e:"🔫",cls:"common",kind:"delta",mult:.5,weight:1.35,desc:"+50% indsats til puljen"},
    {name:"P250 | Ripple",e:"🔫",cls:"common",kind:"delta",mult:.75,weight:1.35,desc:"+75% indsats til puljen"},
    {name:"Tec-9 | Ice Cap",e:"🍻",cls:"common",kind:"sips",amount:2,weight:1.35,desc:"Tag 2 kolde tårer!"},
    {name:"R8 Revolver | Bone Mask",e:"💥",cls:"common",kind:"delta",mult:1.25,weight:1.35,desc:"+125% indsats til puljen"},
    {name:"SCAR-20 | Sand Mesh",e:"🔫",cls:"common",kind:"delta",mult:.5,weight:1.35,desc:"+50% indsats til puljen"},
    {name:"P2000 | Oceanic",e:"🍻",cls:"common",kind:"sips",amount:1,weight:1.35,desc:"Tag 1 tåre selv"},
    {name:"Negev | Man-o'-war",e:"🔫",cls:"common",kind:"delta",mult:1,weight:1.35,desc:"+100% indsats til puljen"},
    {name:"MP5-SD | Dirt Drop",e:"➖",cls:"common",kind:"delta",mult:0,weight:1.35,desc:"Dud! Ingenting sker"},
    {name:"M249 | System Lock",e:"💥",cls:"common",kind:"delta",mult:1.5,weight:1.35,desc:"System Crash! +150% indsats"},
    {name:"Glock-18 | Ironwork",e:"🔫",cls:"common",kind:"delta",mult:.5,weight:1.35,desc:"+50% indsats til puljen"},
    {name:"AWP | Capillary",e:"🍻",cls:"common",kind:"sips",amount:2,mult:.25,weight:1.35,desc:"Tag 2 tårer + 25% til puljen"},
    {name:"AK-47 | Uncharted",e:"🔫",cls:"common",kind:"delta",mult:.75,weight:1.35,desc:"+75% indsats til puljen"},
    {name:"UMP-45 | Exposure",e:"📈",cls:"common",kind:"delta",mult:1,weight:1.35,desc:"+100% indsats til puljen"},
    {name:"Desert Eagle | Blue Ply",e:"🔫",cls:"common",kind:"delta",mult:.5,weight:1.35,desc:"+50% indsats til puljen"},
    {name:"Galil AR | Black Sand",e:"🔫",cls:"common",kind:"delta",mult:.75,weight:1.35,desc:"+75% indsats til puljen"},
    {name:"SSG 08 | Mainframe 001",e:"➖",cls:"common",kind:"delta",mult:0,weight:1.35,desc:"Safe! Puljen er urørt"},
    {name:"FAMAS | Decommissioned",e:"💥",cls:"common",kind:"delta",mult:1.25,weight:1.35,desc:"+125% indsats til puljen"},
    {name:"MAC-10 | Classic Cranberry",e:"🍻",cls:"common",kind:"sips",amount:1,weight:1.35,desc:"Tag 1 tåre selv"},
    {name:"USP-S | Lead Conduit",e:"🔫",cls:"common",kind:"delta",mult:.5,weight:1.35,desc:"+50% indsats til puljen"},
    {name:"Dual Berettas | Ventilators",e:"🔫",cls:"common",kind:"delta",mult:.5,weight:1.35,desc:"+50% indsats til puljen"},
    {name:"Nova | Wild Six",e:"🍻",cls:"common",kind:"sips",amount:2,weight:1.35,desc:"Tag 2 tårer selv!"},
    {name:"MAG-7 | Heaven Guard",e:"😮‍💨",cls:"common",kind:"delta",mult:0,weight:1.35,desc:"Close Call! Slap med skrækken"},
    {name:"XM1014 | Scumbria",e:"🔫",cls:"common",kind:"delta",mult:.75,weight:1.35,desc:"+75% indsats til puljen"},
    // RESTRICTED (32 skins · 0.75% hver)
    {name:"Glock-18 | Water Elemental",e:"🔹",cls:"blue",kind:"delta",mult:-.5,weight:0.75,desc:"Fjern 50% af indsatsen"},
    {name:"M4A4 | Evil Daimyo",e:"⚡",cls:"blue",kind:"delta",mult:-.75,weight:0.75,desc:"Fjern 75% af indsatsen"},
    {name:"USP-S | Guardian",e:"🛡️",cls:"blue",kind:"delta",mult:-1,weight:0.75,desc:"Fuld Save: Fjern 100% indsats"},
    {name:"Desert Eagle | Light Rail",e:"🔹",cls:"blue",kind:"delta",mult:-.5,weight:0.75,desc:"Fjern 50% af indsatsen"},
    {name:"MAC-10 | Ensnared",e:"🍻",cls:"blue",kind:"giveSips",amount:2,weight:0.75,desc:"Giv 2 tårer ud til andre"},
    {name:"FAMAS | Valence",e:"🔹",cls:"blue",kind:"delta",mult:-.5,weight:0.75,desc:"Fjern 50% af indsatsen"},
    {name:"Galil AR | Stone Cold",e:"⚡",cls:"blue",kind:"delta",mult:-.75,weight:0.75,desc:"Fjern 75% af indsatsen fra puljen"},
    {name:"SSG 08 | Abyss",e:"⚡",cls:"blue",kind:"delta",mult:-.75,weight:0.75,desc:"Fjern 75% af indsatsen"},
    {name:"M4A1-S | Flashback",e:"🍻",cls:"blue",kind:"giveSips",amount:2,mult:-.5,weight:0.75,desc:"Giv 2 tårer ud + 50% save"},
    {name:"AK-47 | Safari Mesh",e:"🛡️",cls:"blue",kind:"delta",mult:-1,weight:0.75,desc:"Fuld Save: Fjern 100% indsats"},
    {name:"AWP | Safari Mesh",e:"🍻",cls:"blue",kind:"giveSips",amount:3,weight:0.75,desc:"Giv 3 tårer ud til bordet"},
    {name:"AK-47 | Slate",e:"🛡️",cls:"blue",kind:"delta",mult:-1,weight:0.75,desc:"Clean Slate: Fjern 100% indsats"},
    {name:"M4A4 | Spider Lily",e:"⚡",cls:"blue",kind:"delta",mult:-.75,weight:0.75,desc:"Fjern 75% af indsatsen"},
    {name:"Desert Eagle | Conspiracy",e:"🛡️",cls:"blue",kind:"delta",mult:-1,weight:0.75,desc:"Fuld Save: Fjern 100% indsats"},
    {name:"AWP | Worm God",e:"🔹",cls:"blue",kind:"delta",mult:-.5,weight:0.75,desc:"Fjern 50% af indsatsen"},
    {name:"Glock-18 | High Beam",e:"🍻",cls:"blue",kind:"giveSips",amount:2,weight:0.75,desc:"Giv 2 tårer ud til andre"},
    {name:"USP-S | Cyrex",e:"⚡",cls:"blue",kind:"delta",mult:-.75,weight:0.75,desc:"Fjern 75% af indsatsen"},
    {name:"M4A1-S | Night Terror",e:"🍻",cls:"blue",kind:"giveSips",amount:2,mult:-.5,weight:0.75,desc:"Giv 2 tårer ud + 50% save"},
    {name:"P250 | Supernova",e:"🔹",cls:"blue",kind:"delta",mult:-.5,weight:0.75,desc:"Fjern 50% af indsatsen"},
    {name:"MAC-10 | Disco Tech",e:"🍻",cls:"blue",kind:"giveSips",amount:2,mult:-.5,weight:0.75,desc:"Giv 2 tårer ud + 50% save"},
    {name:"Five-SeveN | Monkey Business",e:"🍌",cls:"blue",kind:"giveSips",amount:3,weight:0.75,desc:"Giv 3 banan-tårer ud!"},
    {name:"P90 | Chopper",e:"⚡",cls:"blue",kind:"delta",mult:-.75,weight:0.75,desc:"Fjern 75% af indsatsen"},
    {name:"Galil AR | Signal",e:"🔹",cls:"blue",kind:"delta",mult:-.5,weight:0.75,desc:"Fjern 50% af indsatsen"},
    {name:"SSG 08 | Fever Dream",e:"🍻",cls:"blue",kind:"giveSips",amount:2,weight:0.75,desc:"Giv 2 tårer ud til bordet"},
    {name:"UMP-45 | Primal Saber",e:"🛡️",cls:"blue",kind:"delta",mult:-1,weight:0.75,desc:"Fuld Save: Fjern 100% indsats"},
    {name:"SG 553 | Darkwing",e:"🔹",cls:"blue",kind:"delta",mult:-.5,weight:0.75,desc:"Fjern 50% af indsatsen"},
    {name:"FAMAS | Eye of Athena",e:"⚡",cls:"blue",kind:"delta",mult:-.75,weight:0.75,desc:"Fjern 75% af indsatsen"},
    {name:"Nova | Hyper Beast",e:"🍻",cls:"blue",kind:"giveSips",amount:3,mult:-.5,weight:0.75,desc:"Giv 3 tårer ud + 50% save"},
    {name:"CZ75-Auto | Red Astor",e:"🔹",cls:"blue",kind:"delta",mult:-.5,weight:0.75,desc:"Fjern 50% af indsatsen"},
    {name:"Tec-9 | Isaac",e:"🛡️",cls:"blue",kind:"delta",mult:-1,weight:0.75,desc:"Fuld Save: Fjern 100% indsats"},
    {name:"MP7 | Bloodsport",e:"🍻",cls:"blue",kind:"giveSips",amount:2,weight:0.75,desc:"Giv 2 tårer ud til en modstander"},
    {name:"M4A4 | Magnesium",e:"🔹",cls:"blue",kind:"delta",mult:-.5,weight:0.75,desc:"Fjern 50% af indsatsen"},
    // CLASSIFIED (26 skins · 0.50% hver)
    {name:"AWP | Atheris",e:"🟣",cls:"purple",kind:"delta",mult:-1.5,weight:0.5,desc:"Fjern 1.5× indsatsen fra puljen!"},
    {name:"M4A1-S | Leaded Glass",e:"🟣",cls:"purple",kind:"delta",mult:-1.75,weight:0.5,desc:"Fjern 1.75× indsatsen fra puljen!"},
    {name:"AK-47 | Point Disarray",e:"🟣",cls:"purple",kind:"delta",mult:-2,weight:0.5,desc:"Fjern 2× indsatsen fra puljen!"},
    {name:"Desert Eagle | Mecha Industries",e:"🟣",cls:"purple",kind:"delta",mult:-1.5,weight:0.5,desc:"Fjern 1.5× indsatsen fra puljen!"},
    {name:"USP-S | Cortex",e:"🎁",cls:"purple",kind:"giveSips",amount:3,mult:-1,weight:0.5,desc:"Giv 3 tårer ud + fjern hele indsatsen!"},
    {name:"Glock-18 | Bullet Queen",e:"🟣",cls:"purple",kind:"delta",mult:-2,weight:0.5,desc:"Fjern 2× indsatsen fra puljen!"},
    {name:"AK-47 | Frontside Misty",e:"🎁",cls:"purple",kind:"giveSips",amount:4,mult:-1.5,weight:0.5,desc:"Giv 4 tårer ud + fjern 1.5× indsats!"},
    {name:"SSG 08 | Dragonfire",e:"🔮",cls:"purple",kind:"delta",mult:-1.75,weight:0.5,desc:"Fjern 1.75× indsatsen fra puljen!"},
    {name:"P90 | Asiimov",e:"🎁",cls:"purple",kind:"giveSips",amount:3,mult:-1.5,weight:0.5,desc:"Giv 3 tårer ud + fjern 1.5× indsats!"},
    {name:"CZ75-Auto | Xiangliu",e:"🟣",cls:"purple",kind:"delta",mult:-2,weight:0.5,desc:"Fjern 2× indsatsen fra puljen!"},
    {name:"AK-47 | Redline",e:"🟣",cls:"purple",kind:"delta",mult:-2,weight:0.5,desc:"Fjern 2× indsatsen fra puljen!"},
    {name:"AWP | Mortis",e:"🟣",cls:"purple",kind:"delta",mult:-1.75,weight:0.5,desc:"Fjern 1.75× indsatsen fra puljen!"},
    {name:"M4A4 | Neo-Noir",e:"🟣",cls:"purple",kind:"delta",mult:-2,weight:0.5,desc:"Fjern 2× indsatsen fra puljen!"},
    {name:"USP-S | Neo-Noir",e:"🎁",cls:"purple",kind:"giveSips",amount:4,mult:-1,weight:0.5,desc:"Giv 4 tårer ud + fjern hele indsatsen!"},
    {name:"Desert Eagle | Kumicho Dragon",e:"🟣",cls:"purple",kind:"delta",mult:-1.75,weight:0.5,desc:"Fjern 1.75× indsatsen fra puljen!"},
    {name:"Glock-18 | Vogue",e:"🟣",cls:"purple",kind:"delta",mult:-1.5,weight:0.5,desc:"Fjern 1.5× indsatsen fra puljen!"},
    {name:"M4A1-S | Hyper Beast",e:"🎁",cls:"purple",kind:"giveSips",amount:4,mult:-1.5,weight:0.5,desc:"Giv 4 tårer ud + fjern 1.5× indsats!"},
    {name:"Galil AR | Chatterbox",e:"🎁",cls:"purple",kind:"giveSips",amount:4,mult:-1,weight:0.5,desc:"Giv 4 tårer ud + fjern hele indsatsen!"},
    {name:"SSG 08 | Blood in the Water",e:"🟣",cls:"purple",kind:"delta",mult:-2,weight:0.5,desc:"Fjern 2× indsatsen fra puljen!"},
    {name:"P90 | Death by Kitty",e:"🐱",cls:"purple",kind:"giveSips",amount:4,mult:-1.5,weight:0.5,desc:"Giv 4 killinge-tårer ud + 1.5× save!"},
    {name:"Five-SeveN | Hyper Beast",e:"🟣",cls:"purple",kind:"delta",mult:-1.75,weight:0.5,desc:"Fjern 1.75× indsatsen fra puljen!"},
    {name:"MP9 | Hydra",e:"🟣",cls:"purple",kind:"delta",mult:-1.5,weight:0.5,desc:"Fjern 1.5× indsatsen fra puljen!"},
    {name:"MAC-10 | Stalker",e:"🎁",cls:"purple",kind:"giveSips",amount:3,mult:-1.5,weight:0.5,desc:"Giv 3 tårer ud + 1.5× save!"},
    {name:"AWP | Hyper Beast",e:"🟣",cls:"purple",kind:"delta",mult:-2,weight:0.5,desc:"Fjern 2× indsatsen fra puljen!"},
    {name:"M4A4 | Desolate Space",e:"🟣",cls:"purple",kind:"delta",mult:-1.75,weight:0.5,desc:"Fjern 1.75× indsatsen fra puljen!"},
    {name:"Desert Eagle | Code Red",e:"🎁",cls:"purple",kind:"giveSips",amount:5,mult:-1,weight:0.5,desc:"Giv 5 tårer ud + fjern hele indsatsen!"},
    // COVERT (20 skins · 0.30% hver)
    {name:"AK-47 | Vulcan",e:"💖",cls:"pink",kind:"delta",mult:-3.5,weight:0.3,desc:"Mega Save! Fjern 3.5× indsatsen!"},
    {name:"M4A4 | The Emperor",e:"👑",cls:"pink",kind:"delta",mult:-4,weight:0.3,desc:"Mega Save! Fjern 4× indsatsen!"},
    {name:"AWP | Asiimov",e:"🎁",cls:"pink",kind:"giveSips",amount:6,mult:-2.5,weight:0.3,desc:"Giv 6 tårer ud + fjern 2.5× indsats!"},
    {name:"Desert Eagle | Printstream",e:"🥃",cls:"pink",kind:"giveShot",mult:-2,weight:0.3,desc:"UDDEL 1 SHOT til en modstander + 2× save!"},
    {name:"USP-S | Kill Confirmed",e:"💀",cls:"pink",kind:"halve",weight:0.3,desc:"HALVER PULJEN! Fjern 50% af hele din pulje!"},
    {name:"AK-47 | The Empress",e:"👑",cls:"pink",kind:"delta",mult:-4,weight:0.3,desc:"Mega Save! Fjern 4× indsatsen!"},
    {name:"M4A1-S | Player Two",e:"🌟",cls:"pink",kind:"giveSips",amount:5,mult:-3,weight:0.3,desc:"Giv 5 tårer ud + fjern 3× indsats!"},
    {name:"AK-47 | Bloodsport",e:"🥃",cls:"pink",kind:"giveShot",mult:-3,weight:0.3,desc:"UDDEL 1 SHOT til en modstander + 3× save!"},
    {name:"AWP | Lightning Strike",e:"⚡",cls:"pink",kind:"delta",mult:-4,weight:0.3,desc:"Lynnedslag! Fjern 4× indsatsen!"},
    {name:"AWP | Wildfire",e:"🔥",cls:"pink",kind:"giveShot",mult:-2.5,weight:0.3,desc:"UDDEL 1 SHOT til en modstander + 2.5× save!"},
    {name:"AWP | Fade",e:"💖",cls:"pink",kind:"delta",mult:-4.5,weight:0.3,desc:"Fade Jackpot! Fjern 4.5× indsatsen!"},
    {name:"AK-47 | Fire Serpent",e:"🐉",cls:"pink",kind:"halve",weight:0.3,desc:"DRAGE KRAFT! Fjern 50% af hele din pulje!"},
    {name:"AK-47 | Gold Arabesque",e:"👑",cls:"pink",kind:"delta",mult:-4,weight:0.3,desc:"Guld Salg! Fjern 4× indsatsen!"},
    {name:"AK-47 | Fuel Injector",e:"🎁",cls:"pink",kind:"giveSips",amount:6,mult:-3,weight:0.3,desc:"Giv 6 tårer ud + fjern 3× indsats!"},
    {name:"AK-47 | Case Hardened (Blue Gem)",e:"💎",cls:"pink",kind:"halve",weight:0.3,desc:"BLUE GEM TIER 1! Fjern 50% af hele din pulje!"},
    {name:"M4A4 | Howl (Contraband)",e:"🐺",cls:"pink",kind:"giveShot",mult:-3.5,weight:0.3,desc:"CONTRABAND HOWL! Uddel 1 SHOT + 3.5× save!"},
    {name:"M4A4 | In Living Color",e:"🎨",cls:"pink",kind:"giveSips",amount:5,mult:-3,weight:0.3,desc:"Giv 5 tårer ud + fjern 3× indsats!"},
    {name:"M4A1-S | Printstream",e:"🌟",cls:"pink",kind:"delta",mult:-4,weight:0.3,desc:"Perlemor Save! Fjern 4× indsatsen!"},
    {name:"USP-S | Printstream",e:"🥃",cls:"pink",kind:"giveShot",mult:-2.5,weight:0.3,desc:"UDDEL 1 SHOT til en modstander + 2.5× save!"},
    {name:"Glock-18 | Gamma Doppler",e:"💚",cls:"pink",kind:"delta",mult:-3.5,weight:0.3,desc:"Gamma Emerald Save! Fjern 3.5× indsatsen!"},
    // GOLD (20 skins · 0.15% hver)
    {name:"★ Karambit | Fade",e:"🔪",cls:"gold",kind:"clear",bonusShot:1,weight:0.15,desc:"CLEAR HELE PULJEN + Uddel 1 SHOT til en modstander!"},
    {name:"★ Butterfly Knife | Doppler",e:"🔪",cls:"gold",kind:"clear",weight:0.15,desc:"CLEAR HELE PULJEN TIL 0! Direkte sejr!"},
    {name:"★ M9 Bayonet | Lore",e:"🔪",cls:"gold",kind:"clear",bonusGive:6,weight:0.15,desc:"CLEAR HELE PULJEN + Giv 6 tårer ud!"},
    {name:"★ Sport Gloves | Vice",e:"🧤",cls:"gold",kind:"clear",bonusGive:8,weight:0.15,desc:"CLEAR HELE PULJEN + Giv 8 tårer ud!"},
    {name:"★ Skeleton Knife | Crimson Web",e:"🔪",cls:"gold",kind:"clear",bonusGive:5,weight:0.15,desc:"CLEAR HELE PULJEN + Giv 5 tårer ud!"},
    {name:"★ AWP | Dragon Lore (Souvenir)",e:"🏆",cls:"gold",kind:"clear",bonusShot:2,weight:0.15,desc:"CLEAR PULJEN + Uddel 2 SHOTS til modstanderne!"},
    {name:"★ Karambit | Blue Gem #387",e:"💎",cls:"gold",kind:"clear",bonusShot:1,bonusGive:4,weight:0.15,desc:"LEGENDARISK BLUE GEM! CLEAR PULJEN + 1 shot + 4 tårer ud!"},
    {name:"★ Butterfly Knife | Gamma Doppler Emerald",e:"💚",cls:"gold",kind:"clear",bonusShot:1,bonusGive:6,weight:0.15,desc:"EMERALD JACKPOT! CLEAR PULJEN + 1 shot ud + 6 tårer ud!"},
    {name:"★ Butterfly Knife | Marble Fade",e:"🔪",cls:"gold",kind:"clear",bonusGive:7,weight:0.15,desc:"CLEAR HELE PULJEN + Giv 7 tårer ud!"},
    {name:"★ M9 Bayonet | Slaughter",e:"🔪",cls:"gold",kind:"clear",bonusShot:1,weight:0.15,desc:"CLEAR HELE PULJEN + Uddel 1 SHOT til en modstander!"},
    {name:"★ Bayonet | Tiger Tooth",e:"🐯",cls:"gold",kind:"clear",bonusGive:6,weight:0.15,desc:"TIGER STRIKE! CLEAR PULJEN + Giv 6 tårer ud!"},
    {name:"★ Talon Knife | Doppler Ruby",e:"🩸",cls:"gold",kind:"clear",bonusShot:2,weight:0.15,desc:"RUBY JACKPOT! CLEAR PULJEN + Uddel 2 SHOTS til modstanderne!"},
    {name:"★ Skeleton Knife | Fade",e:"🔪",cls:"gold",kind:"clear",bonusGive:6,weight:0.15,desc:"CLEAR HELE PULJEN + Giv 6 tårer ud!"},
    {name:"★ Nomad Knife | Case Hardened",e:"🔪",cls:"gold",kind:"clear",bonusGive:5,weight:0.15,desc:"CLEAR HELE PULJEN + Giv 5 tårer ud!"},
    {name:"★ Stiletto Knife | Doppler",e:"🔪",cls:"gold",kind:"clear",bonusShot:1,weight:0.15,desc:"STILETTO CHOP! CLEAR PULJEN + Uddel 1 SHOT!"},
    {name:"★ Sport Gloves | Pandora's Box",e:"🧤",cls:"gold",kind:"clear",bonusShot:2,bonusGive:4,weight:0.15,desc:"PANDORA'S BOX! CLEAR PULJEN + Uddel 2 shots + 4 tårer ud!"},
    {name:"★ Moto Gloves | Spearmint",e:"🧤",cls:"gold",kind:"clear",bonusGive:6,weight:0.15,desc:"MINT SEJR! CLEAR PULJEN + Giv 6 tårer ud!"},
    {name:"★ Specialist Gloves | Crimson Kimono",e:"🧤",cls:"gold",kind:"clear",bonusGive:8,weight:0.15,desc:"KIMONO SEJR! CLEAR PULJEN + Giv 8 tårer ud!"},
    {name:"★ AWP | Gungnir",e:"⚡",cls:"gold",kind:"clear",bonusShot:2,weight:0.15,desc:"ODINS SPYD! CLEAR PULJEN + Uddel 2 SHOTS til modstanderne!"},
    {name:"★ AWP | Medusa",e:"🐍",cls:"gold",kind:"clear",bonusShot:1,bonusGive:5,weight:0.15,desc:"MEDUSAS BLIK! CLEAR PULJEN + 1 shot ud + 5 tårer ud!"}
  ];

  function loot() {
    let total = lootTable.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const x of lootTable) {
      r -= x.weight;
      if (r <= 0) return x;
    }
    return lootTable[0];
  }

  function lootChancePercent(x) {
    const total = lootTable.reduce((s, item) => s + item.weight, 0);
    return ((x.weight / total) * 100).toFixed(2);
  }

  function lootHtml(x) {
    const meta = rarityMeta[x.cls] || { label: x.cls, quality: "" };
    const m = x.desc || "";
    return `<div class="loot ${x.cls}">
      <div class="tier">${meta.label}</div>
      <div class="e">${x.e}</div>
      <div><div class="n" title="${x.name}">${x.name}</div><div class="m" title="${m}">${m}</div></div>
    </div>`;
  }

  function renderCase(a) {
    a.innerHTML = `
      ${titleBlock("📦 CS:GO Case Opening", "138 skins fordelt på 5 tiers med 3.0% kniv-chance! Tryk for at låse kassen op og spinne.")}
      <div class="cs-case-stage" id="csCaseStage">
        <div class="cs-crate-closed" id="csCrateClosed">
          <div class="cs-crate-hazard-stripe"></div>
          <div class="cs-crate-main-panel">
            <div class="cs-crate-emblem">
              <div class="cs-crate-stars">★ ★ ★</div>
              <div class="cs-crate-title">CS:GO WEAPON CASE</div>
              <div class="cs-crate-sub">TRYK FOR AT LÅSE OP MED NØGLE</div>
            </div>
          </div>
          <div class="cs-padlock-wrap" id="csPadlock">
            <div class="cs-padlock-shackle" id="csShackle"></div>
            <div class="cs-padlock-body">
              <div class="cs-padlock-keyhole"></div>
              <div class="cs-padlock-status" id="csLockLabel">🔒 LÅST</div>
            </div>
          </div>
          <div class="cs-crate-hazard-stripe"></div>
        </div>
        <div class="cs-crate-open-view" id="csCrateOpenView">
          <div class="cs-light-flare" id="csLightFlare"></div>
          <div class="case-box cs-case-box">
            <div class="case-pointer"></div>
            <div class="case-track" id="caseTrack">${Array.from({ length: 20 }, () => lootHtml(loot())).join("")}</div>
          </div>
        </div>
      </div>
      <button class="big-button" id="caseBtn">ÅBN CASE</button>
      <div id="gameResult"></div>`;
    $("#caseBtn").onclick = openCase;
    $("#csCrateClosed").onclick = openCase;
  }

  async function openCase() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager();
    setBusy(true);

    const stage = $("#csCaseStage");
    const lockLabel = $("#csLockLabel");
    if (stage) {
      stage.classList.add("unlocking");
      if (lockLabel) lockLabel.textContent = "LÅSER OP...";
    }
    beep(480, 0.04, 0.02);
    vibrate(30);
    await sleep(340);

    if (lockLabel) lockLabel.textContent = "🔓 ÅBNET!";
    beep(880, 0.06, 0.02);
    await sleep(70);
    beep(1150, 0.07, 0.025);
    vibrate([30, 25, 40]);
    await sleep(200);

    if (stage) {
      stage.classList.remove("unlocking");
      stage.classList.add("opening");
    }
    beep(380, 0.14, 0.04);
    await sleep(420);

    const win = loot();
    const items = Array.from({ length: 62 }, () => loot());
    const target = 46;
    items[target] = win;
    const track = $("#caseTrack");
    track.innerHTML = items.map(lootHtml).join("");
    track.style.transition = "none";
    track.style.transform = "translateX(0)";
    void track.offsetWidth;

    const box = track.parentElement;
    const itemWidth = 124, gap = 8, startPad = 12;
    const targetCenter = startPad + target * (itemWidth + gap) + itemWidth / 2;
    const safeEdge = 10;
    const landingOffset = (Math.random() * 2 - 1) * (itemWidth / 2 - safeEdge);
    const end = box.clientWidth / 2 - targetCenter + landingOffset;

    const spinDuration = 7000;
    track.style.transition = `transform ${spinDuration / 1000}s cubic-bezier(.08,.35,.50,1)`;
    track.style.transform = `translateX(${end}px)`;

    const startTime = performance.now();
    let tickCount = 0;
    while (performance.now() - startTime < spinDuration - 110) {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / spinDuration;
      const interval = 35 + Math.pow(progress, 2.6) * 520;
      beep(360 + (tickCount++ % 8) * 22, 0.018, 0.010);
      await sleep(interval);
    }
    const remaining = spinDuration - (performance.now() - startTime);
    if (remaining > 0) await sleep(remaining);

    const cards = [...track.children];
    if (cards[target]) cards[target].classList.add("winner");

    if (win.cls === "gold") { beep(990, 0.25, 0.05); await sleep(80); beep(1320, 0.35, 0.05); confetti(); }
    else if (win.cls === "pink") { beep(840, 0.2, 0.04); await sleep(80); beep(1050, 0.25, 0.04); confetti(); }
    else if (win.cls === "purple") { beep(740, 0.18, 0.04); }
    else { beep(580, 0.15, 0.03); }

    await sleep(320);
    handleCaseOutcome(win, w);
  }

  function handleCaseOutcome(win, w) {
    const meta = rarityMeta[win.cls] || { label: win.cls, quality: "", color: "#ffc857", chance: "" };
    const modes = window.Arcade && Arcade.modes;
    const isDrink = modes && typeof modes.isDrinkMode === "function" && modes.isDrinkMode();
    let actionTitle = "", actionDesc = "", extraRule = "", actual = 0;

    if (win.kind === "clear") {
      actual = updateBalance(-state.balance, `Case: ${win.name}.`, "auto", null, { isClear: true, giveAmount: win.bonusGive || 0, giveLabel: win.bonusGive ? `${win.bonusGive} tårer` : "" });
      actionTitle = isDrink ? "🥃 MEGA-JACKPOT: UDDEL 1 SHOT!" : "🏆 HELE PULJEN ER CLEARET TIL 0!";
      actionDesc = isDrink ? `Vildt drop! Uddel 1 SHOT + ${Math.abs(actual)} tårer til bordet!` : `Du har vundet runden! ${Math.abs(actual)} point forsvandt fra puljen.`;
      if (win.bonusShot && win.bonusGive) extraRule = `🎉 Samtidig skal du uddele ${win.bonusShot} shot OG give ${win.bonusGive} tårer ud!`;
      else if (win.bonusShot) extraRule = `🎉 Samtidig skal du uddele ${win.bonusShot} ${win.bonusShot > 1 ? "shots" : "shot"} til modstanderne!`;
      else if (win.bonusGive) extraRule = `🎉 Samtidig giver du ${win.bonusGive} tårer ud til de andre!`;
      confetti();
    } else if (win.kind === "halve") {
      const half = Math.max(1, Math.round(state.balance / 2));
      actual = updateBalance(-half, `Case: ${win.name}.`, "auto", null);
      actionTitle = isDrink ? `🎁 GIV ${Math.abs(actual)} TÅRER UD!` : "💀 HALVERING AF PULJEN!";
      actionDesc = isDrink ? `Du trak et stærkt skin! Uddel ${Math.abs(actual)} tårer!` : `Halvdelen af din pulje forsvandt! ${Math.abs(actual)} point blev fjernet.`;
      confetti();
    } else if (win.kind === "giveShot") {
      const amount = Math.max(1, Math.round(w * Math.abs(win.mult || 1)));
      actual = updateBalance(-amount, `Case: ${win.name}. Uddel shot.`, "auto", null, { giveShot: true });
      actionTitle = isDrink ? `🥃 UDDEL 1 SHOT + ${Math.abs(actual)} TÅRER!` : "🥃 UDDEL SHOT!";
      actionDesc = isDrink ? `Kæmpe gevinst! Uddel 1 SHOT og ${Math.abs(actual)} tårer!` : `Uddel 1 SHOT til en modstander! Samtidig forsvandt ${Math.abs(actual)} point fra din pulje.`;
      confetti();
    } else if (win.kind === "giveSips") {
      let delta = win.mult ? -Math.max(1, Math.round(w * Math.abs(win.mult))) : 0;
      actual = (delta !== 0 || isDrink) ? updateBalance(delta, `Case: ${win.name}.`, "auto", null, { giveAmount: win.amount, giveLabel: `${win.amount} tårer` }) : 0;
      actionTitle = isDrink ? `🎁 GIV ${Math.abs(actual || win.amount)} TÅRER UD!` : `🍻 GIV ${win.amount} TÅRER UD!`;
      actionDesc = isDrink
        ? `Uddel ${Math.abs(actual || win.amount)} tårer til hvem du vil!`
        : `Uddel ${win.amount} tårer til modstanderne!${actual < 0 ? ` Samtidig forsvandt ${Math.abs(actual)} point fra din pulje.` : ""}`;
    } else if (win.kind === "sips") {
      let delta = (win.mult && win.mult > 0) ? Math.max(1, Math.ceil(w * win.mult)) : 0;
      actual = (delta !== 0 || isDrink) ? updateBalance(delta, `Case: ${win.name}.`, "bad", null, { drinkSelf: win.amount }) : 0;
      actionTitle = isDrink ? `🍻 DRIK ${Math.abs(actual || win.amount)} TÅRER NU!` : `🍻 ${win.amount} TÅRER TIL DIG!`;
      actionDesc = isDrink
        ? `Du trak en strafting – tag ${Math.abs(actual || win.amount)} tårer selv!`
        : `Tag ${win.amount} ${win.amount > 1 ? "tårer" : "tåre"} selv!${actual > 0 ? ` Samtidig blev ${actual} point lagt til din pulje.` : ""}`;
      vibrate([40, 40, 40]);
    } else {
      let delta = win.mult > 0 ? Math.max(1, Math.ceil(w * win.mult)) : win.mult === 0 ? 0 : -Math.max(1, Math.round(w * Math.abs(win.mult)));
      actual = updateBalance(delta, `Case: ${win.name} (${meta.label}).`, "auto", null);
      if (actual < 0) {
        actionTitle = isDrink ? `🎁 GIV ${Math.abs(actual)} TÅRER UD!` : `🛡️ SAVE: ${Math.abs(actual)} POINT REDDET!`;
        actionDesc = isDrink ? `Flot skin! Uddel ${Math.abs(actual)} tårer til bordet!` : `${Math.abs(actual)} point blev fjernet fra din pulje!`;
      } else if (actual > 0) {
        actionTitle = isDrink ? `🍻 DRIK ${actual} TÅRER NU!` : `📈 STRAF: +${actual} POINT TIL PULJEN!`;
        actionDesc = isDrink ? `Øv drop – drik ${actual} ${actual > 1 ? "tårer" : "tår"} selv!` : `${actual} point blev lagt oveni din pulje.`;
      } else {
        actionTitle = isDrink ? `🤝 SLAP FRI · 0 TÅRER` : `➖ DUD: INGEN ÆNDRING`;
        actionDesc = isDrink ? `Ingen tårer denne gang!` : `Ingen point lagt til eller trukket fra.`;
      }
    }

    showResult(`${win.name} · ${meta.label}`, `${actionTitle}: ${actionDesc}${extraRule ? " " + extraRule : ""}`,
      actual < 0 || win.kind === "clear" ? "good" : actual > 0 ? "bad" : "special");

    showCaseModal(win, meta, actionTitle, actionDesc, extraRule);
  }

  function showCaseModal(win, meta, actionTitle, actionDesc, extraRule) {
    const modal = $("#caseModal");
    if (!modal) return;
    const card = $("#caseModalCard");
    if (card) card.style.setProperty("--rar", meta.color);

    $("#caseModalBadge").textContent = `${meta.label} · ${meta.quality}`;
    $("#caseModalIcon").textContent = win.e;
    $("#caseModalName").textContent = win.name;
    $("#caseModalTierSub").textContent = win.desc || meta.quality;
    $("#caseModalActionTitle").textContent = actionTitle;
    $("#caseModalActionDesc").textContent = actionDesc;

    const extraEl = $("#caseModalExtraRule");
    if (extraRule) { extraEl.textContent = extraRule; extraEl.style.display = "block"; }
    else { extraEl.style.display = "none"; }

    renderTransferBox($("#caseTransferBox"));

    const modes = window.Arcade && Arcade.modes;
    const isDrink = modes && typeof modes.isDrinkMode === "function" && modes.isDrinkMode();
    if ($("#casePoolLabel")) $("#casePoolLabel").textContent = isDrink ? "På højkant" : "Pulje nu";
    $("#caseModalPoolVal").textContent = isDrink ? `${modes.state.turnStake || 1} ${(modes.state.turnStake || 1) === 1 ? "tår" : "tårer"}` : `${state.balance} tårer`;
    $("#caseModalChanceVal").textContent = `${lootChancePercent(win)}% (${meta.chance})`;

    const btn = $("#caseModalCloseBtn");
    const switchBtn = $("#caseModalSwitchBtn");
    const modeInfo = modes ? modes.getModeOutcomeConfig() : {};

    if (modeInfo.isPartyOrChaosNext) {
      btn.innerHTML = modeInfo.nextBtnText;
      btn.className = state.debtBusted ? "btn bad case-modal-btn" : "btn primary case-modal-btn";
      if (switchBtn) switchBtn.style.display = modeInfo.showSwitch ? "block" : "none";
    } else if (state.balance === 0) {
      btn.innerHTML = "🏆 DU VANDT RUNDEN! SE VINDERSKÆRM ➔";
      btn.className = "btn primary case-modal-btn";
      if (switchBtn) switchBtn.style.display = "none";
    } else if (state.debtBusted) {
      btn.innerHTML = "💀 GÆLDSGRÆNSE NÅET · CASHOUT ➔";
      btn.className = "btn bad case-modal-btn";
      if (switchBtn) switchBtn.style.display = "none";
    } else {
      btn.innerHTML = "FORTSÆT TIL NÆSTE CASE ➔";
      btn.className = "btn primary case-modal-btn";
      if (switchBtn) switchBtn.style.display = modeInfo.showSwitch === false ? "none" : "block";
    }
    modal.classList.add("show");
  }

  function dismissCaseModal(action = "stay") {
    const modal = $("#caseModal");
    if (modal) modal.classList.remove("show");
    const stage = $("#csCaseStage");
    if (stage) {
      stage.classList.remove("opening", "unlocking");
      const lockLabel = $("#csLockLabel");
      if (lockLabel) lockLabel.textContent = "🔒 LÅST";
      beep(420, 0.05, 0.02);
    }

    const modes = window.Arcade && Arcade.modes;
    if (modes && modes.handleAfterOutcome(action)) return;

    if (state.balance === 0) {
      $("#zeroOverlay").classList.add("show");
      beep(780, 0.25, 0.05);
    } else if (state.debtBusted) {
      $("#debtBustAmount").textContent = state.balance;
      $("#debtOverlay").classList.add("show");
      beep(145, 0.28, 0.055);
    } else {
      setBusy(false);
      if (action === "switch" && Arcade.app) Arcade.app.switchView("games");
    }
  }

  window.Arcade.caseModal = { showCaseModal, dismissCaseModal };

  registerGame({
    id: "case",
    name: "Case Opening",
    icon: "📦",
    desc: "138 CS:GO skins & 3% kniv",
    category: "wheel_cases",
    render: renderCase
  });

  // ==========================================================
  // 3. COIN FLIP
  // ==========================================================
  function renderCoin(a) {
    a.innerHTML = `
      ${titleBlock("🪙 Coin Flip", "Gæt rigtigt og fjern indsatsen. Forkert lægger indsatsen oveni.")}
      <div class="coin-stage">
        <div class="coin3d" id="coin">
          <div class="coin-face front"><div>👑<small>KRONE</small></div></div>
          <div class="coin-face back"><div>★<small>PLAT</small></div></div>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn primary coinPick" style="flex:1" data-pick="heads">👑 Krone</button>
        <button class="btn primary coinPick" style="flex:1" data-pick="tails">★ Plat</button>
      </div>
      <div id="gameResult"></div>`;
    $$(".coinPick").forEach(b => b.onclick = () => flipCoin(b.dataset.pick));
  }

  async function flipCoin(choice) {
    if (state.busy || state.balance <= 0) return;
    const w = getWager();
    setBusy(true);
    const outcome = Math.random() < 0.5 ? "heads" : "tails";
    const coin = $("#coin");
    coin.className = "coin3d";
    coin.style.transition = "none";
    coin.style.transform = "rotateY(0deg) rotateX(0deg)";
    void coin.offsetWidth;

    const targetY = outcome === "heads" ? 1800 : 1980;
    coin.style.transition = "transform 1.8s cubic-bezier(.16,.78,.2,1)";
    coin.style.transform = `rotateY(${targetY}deg) rotateX(720deg)`;
    for (let i = 0; i < 9; i++) { await sleep(150); beep(420 + i * 30, 0.025, 0.014); }
    await sleep(450);

    coin.style.transition = "none";
    coin.style.transform = "none";
    coin.className = outcome === "heads" ? "coin3d final-heads" : "coin3d final-tails";
    beep(outcome === "heads" ? 760 : 660, 0.1, 0.035);

    const win = choice === outcome;
    const actual = updateBalance(win ? -w : w, `Coin Flip: ${outcome === "heads" ? "krone" : "plat"}.`);
    showResult(`${outcome === "heads" ? "👑 KRONE" : "★ PLAT"} · ${win ? "RIGTIGT" : "FORKERT"}`,
      win ? `${Math.abs(actual)} point forsvandt.` : `${actual} point blev lagt oveni.`, win ? "good" : "bad");
    setBusy(false);
  }

  registerGame({
    id: "coin",
    name: "Coin Flip",
    icon: "🪙",
    desc: "3D Krone eller Plat",
    category: "wheel_cases",
    duel: true,
    render: renderCoin
  });

  // ==========================================================
  // 4. DICE RISK
  // ==========================================================
  function renderDice(a) {
    a.innerHTML = `
      ${titleBlock("🎲 Dice Risk", "4–5 fjerner indsats. 6 er 2× JACKPOT! 2–3 koster ½ indsats, 1 koster fuld.")}
      <div class="dice-stage"><div class="die" id="die">⚄</div></div>
      <button class="big-button" id="diceBtn">KAST TERNINGEN</button>
      <div id="gameResult"></div>`;
    $("#diceBtn").onclick = rollDice;
  }

  async function rollDice() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager();
    setBusy(true);
    const d = 1 + Math.floor(Math.random() * 6);
    const die = $("#die");
    die.classList.remove("roll"); void die.offsetWidth; die.classList.add("roll");
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    let i = 0;
    const id = setInterval(() => { die.textContent = faces[Math.floor(Math.random() * 6)]; beep(330 + (i++ % 4) * 45, 0.022, 0.012); }, 95);
    await sleep(1350); clearInterval(id);
    die.textContent = faces[d - 1];
    beep(750, 0.1, 0.035);

    let delta = 0, title = "", type = "";
    if (d === 6) { delta = -2 * w; title = "🔥 6 · SUPER JACKPOT!"; type = "good"; confetti(); }
    else if (d >= 4) { delta = -w; title = `✅ DU SLOG ${d} · SEJR`; type = "good"; }
    else if (d >= 2) { delta = Math.max(1, Math.ceil(w / 2)); title = `LAVT KAST · ${d}`; type = "bad"; }
    else { delta = w; title = "💀 1 · SNAKE EYES"; type = "bad"; }

    const actual = updateBalance(delta, `Dice Risk: slog ${d}.`);
    showResult(title, actual < 0 ? `${Math.abs(actual)} point forsvandt fra puljen!` : `${actual} point blev lagt oveni.`, type);
    setBusy(false);
  }

  registerGame({
    id: "dice",
    name: "Dice Risk",
    icon: "🎲",
    desc: "3D terningekast",
    category: "dice",
    duel: true,
    render: renderDice
  });

  // ==========================================================
  // 5. SLOTS
  // ==========================================================
  const slotSymbols = ["🍒", "🍋", "🔔", "💎", "7️⃣"];

  function reelMarkup(id) {
    const items = [];
    for (let i = 0; i < 18; i++) items.push(slotSymbols[Math.floor(Math.random() * slotSymbols.length)]);
    return `<div class="reel-window"><div class="reel-strip" id="${id}">${items.map(s => `<div class="reel-symbol">${s}</div>`).join("")}</div></div>`;
  }

  function renderSlots(a) {
    a.innerHTML = `
      ${titleBlock("🎰 Slots", "Tre ens fjerner 2× indsats. To ens fjerner indsats. Intet match giver straf.")}
      <div class="slot-machine"><div class="slot-window">${reelMarkup("reel1")}${reelMarkup("reel2")}${reelMarkup("reel3")}</div></div>
      <button class="big-button" id="slotsBtn">SPIN REELS</button>
      <div id="gameResult"></div>`;
    $("#slotsBtn").onclick = spinSlots;
  }

  async function spinSlots() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager();
    setBusy(true);
    const result = [0, 0, 0].map(() => slotSymbols[Math.floor(Math.random() * slotSymbols.length)]);
    [1, 2, 3].map(i => $("#reel" + i)).forEach((r, idx) => {
      const targetIndex = 12 + idx;
      r.children[targetIndex].textContent = result[idx];
      r.style.transition = "none"; r.style.transform = "translateY(0)";
      void r.offsetWidth;
      r.style.transition = `transform ${1.45 + idx * 0.35}s cubic-bezier(.08,.72,.08,1)`;
      r.style.transform = `translateY(${-targetIndex * 110}px)`;
    });

    let ticks = 0;
    const ticker = setInterval(() => { beep(300 + (ticks++ % 6) * 35, 0.02, 0.01); }, 85);
    await sleep(2200); clearInterval(ticker); beep(780, 0.1, 0.035);

    const counts = {};
    result.forEach(x => { counts[x] = (counts[x] || 0) + 1; });
    const max = Math.max(...Object.values(counts));
    const actual = updateBalance(max === 3 ? -2 * w : max === 2 ? -w : w, `Slots: ${result.join(" ")}`);
    showResult(max === 3 ? "Tre ens!" : max === 2 ? "To ens" : "Ingen match",
      actual < 0 ? `${Math.abs(actual)} point forsvandt.` : `${actual} point blev lagt oveni.`, actual < 0 ? "good" : "bad");
    setBusy(false);
  }

  registerGame({
    id: "slots",
    name: "Slots",
    icon: "🎰",
    desc: "Tre rigtige reels",
    category: "wheel_cases",
    render: renderSlots
  });

  // ==========================================================
  // 6. DOUBLE OR NOTHING
  // ==========================================================
  function renderDouble(a) {
    a.innerHTML = `
      ${titleBlock("⚡ Double or Nothing", "Ren 50/50! Vinder du, forsvinder indsatsen. Taber du, lægges den oveni.")}
      <div class="double-stage"><div class="double-orb" id="orb">50/50</div></div>
      <button class="big-button" id="doubleBtn">GAMBLE</button>
      <div id="gameResult"></div>`;
    $("#doubleBtn").onclick = playDouble;
  }

  async function playDouble() {
    if (state.busy || state.balance <= 0) return;
    const w = getWager();
    setBusy(true);
    const win = Math.random() < 0.5;
    const orb = $("#orb");
    orb.classList.remove("spin"); void orb.offsetWidth; orb.classList.add("spin");
    let i = 0;
    const id = setInterval(() => { orb.textContent = i++ % 2 ? "WIN" : "LOSE"; beep(390 + (i % 2) * 110, 0.03, 0.014); }, 120);
    await sleep(1500); clearInterval(id);
    orb.textContent = win ? "WIN" : "LOSE";
    beep(win ? 850 : 220, 0.13, 0.04);
    const actual = updateBalance(win ? -w : w, `Double or Nothing: ${win ? "WIN" : "LOSE"}.`);
    showResult(win ? "Du vandt" : "Du tabte",
      win ? `${Math.abs(actual)} point forsvandt.` : `${actual} point blev lagt oveni.`, win ? "good" : "bad");
    setBusy(false);
  }

  registerGame({
    id: "double",
    name: "Double or Nothing",
    icon: "⚡",
    desc: "Alt eller intet 50/50",
    category: "arcade",
    render: renderDouble
  });
})();
