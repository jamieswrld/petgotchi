/* Gotchi — play-to-earn web app (Solana)
 * Entry: Connect Wallet (sign a message to verify ownership, then progress saves)
 * or Guest (in-memory only). Players name their Gotchi; it grows through evolution
 * stages on a slow XP curve, and a Bond stat multiplies $GOTCHI earnings.
 *
 * NOTE: $GOTCHI is an in-game demo token with no real-world value. Wallet connect
 * uses an injected Solana wallet (Phantom / Solflare / Backpack). The signature
 * proves wallet control client-side; the signed payload is kept in session so a
 * backend can verify it (Ed25519) once cross-device saves are enabled. No tokens
 * are minted or transferred on any chain.
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmt = (n) => Number(n).toLocaleString("en-US");

const TOKEN_CA = "4UeCUo8AarFJ9edENiy6sUp2ian9hHvpScceJTvWpump";

/* ===================== economy config ===================== */
const PLAYS_PER_DAY = 2;            // mini-game plays per UTC day
const COIN_XP = 3;                  // xp per coin caught
const COIN_GOTCHI = 5;             // base $GOTCHI per coin (before Bond multiplier)

const ACTION = {
  feed:  { stat: "satiety", amount: 16, xp: 5, cross: { hygiene: -3 }, label: "Yum! 🍙" },
  clean: { stat: "hygiene", amount: 28, xp: 7, label: "Squeaky clean 🫧" },
  heal:  { stat: "health",  amount: 20, xp: 6, label: "Feeling better 💊" },
};

// Claim milestones spread across the slow curve. First gate = Lv 3.
const CLAIM_TIERS = [
  [3, 150], [7, 400], [12, 800], [20, 1600], [32, 3500],
];

// Evolution stages, themed to the cherry-blossom brand.
const STAGES = [
  { min: 1,  name: "Seedling",     blurb: "A tiny sprout, full of promise." },
  { min: 3,  name: "Sprout",       blurb: "Reaching for the light." },
  { min: 6,  name: "Sapling",      blurb: "Growing stronger by the day." },
  { min: 11, name: "Budding",      blurb: "The first pink buds appear." },
  { min: 18, name: "Blossom",      blurb: "In full, fragrant bloom." },
  { min: 28, name: "Sakura",       blurb: "A radiant cherry spirit." },
  { min: 40, name: "Elder Sakura", blurb: "Ancient, serene, beloved." },
];

// Slow XP curve: cumulative XP to *reach* level L is 40n + 30n² (n = L-1), so each
// level costs more than the last. L2=70, L5=520, L10=2790, L20=11960, L32=31480.
function totalXpFor(L) { const n = Math.max(0, L - 1); return 40 * n + 30 * n * n; }
function level() { let L = 1; while (totalXpFor(L + 1) <= state.xp) L++; return L; }
function xpInfo() {
  const L = level(), base = totalXpFor(L), next = totalXpFor(L + 1);
  const into = state.xp - base, span = next - base;
  return { L, into, span, pct: Math.max(0, Math.min(100, (into / span) * 100)) };
}
function stage() { const L = level(); let s = STAGES[0]; for (const x of STAGES) if (L >= x.min) s = x; return s; }
const bondMult = () => 1 + (state.bond || 0) / 200; // 1.00 .. 1.50

const PET_FRAMES = Array.from({ length: 8 }, (_, i) => `assets/pet/tamagotchi-${i}.png`);

/* ===================== session + state ===================== */
const session = { mode: null, address: null, verified: false, auth: null };

function defaultState() {
  return {
    username: "",
    stats: { satiety: 100, hygiene: 100, happy: 100, health: 100 },
    bond: 50,
    xp: 0,
    balance: 0,
    pending: 0,
    claimedTiers: [],
    play: { day: "", count: 0 },
  };
}
let state = defaultState();

// Solana addresses are case-sensitive base58 — never lowercase them.
const storageKey = (addr) => `gotchi:${addr}`;

/* ---- cross-device sync (opt-in via window.GOTCHI_API) ---- */
const API_BASE = (window.GOTCHI_API || "").trim().replace(/\/$/, "");
const BACKEND_ENABLED = API_BASE !== "";
const SAVE_API = API_BASE + "/api/save";
let remoteOK = false;

async function fetchRemote(address) {
  if (!BACKEND_ENABLED) return undefined;
  try {
    const r = await fetch(`${SAVE_API}?address=${address}`, { cache: "no-store" });
    if (!r.ok) return undefined;
    const data = await r.json();
    remoteOK = true;
    return data.state || null;
  } catch (e) { return undefined; }
}

let remoteTimer = null;
function saveRemote() {
  if (!BACKEND_ENABLED || session.mode !== "wallet" || !session.address || !remoteOK) return;
  clearTimeout(remoteTimer);
  remoteTimer = setTimeout(() => {
    fetch(SAVE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: session.address, state, auth: session.auth }),
      keepalive: true,
    }).then((r) => {
      if (r.status === 401) {
        session.verified = false;
        session.auth = null;
        toast("Wallet signature expired — reconnect to save");
      }
    }).catch(() => {});
  }, 800);
}

function save() {
  if (session.mode !== "wallet" || !session.address) return; // guests never save
  try { localStorage.setItem(storageKey(session.address), JSON.stringify(state)); } catch (e) {}
  saveRemote();
}

function load(addr) {
  try {
    const raw = localStorage.getItem(storageKey(addr));
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) {}
  return defaultState();
}

/* ===================== claiming ===================== */
function claimableTiers() {
  const L = level();
  return CLAIM_TIERS.filter(([l]) => L >= l && !state.claimedTiers.includes(l));
}
function totalClaimable() { return state.pending + claimableTiers().reduce((s, [, r]) => s + r, 0); }
function canClaim() { return level() >= CLAIM_TIERS[0][0] && totalClaimable() > 0; }
function claimStatus() {
  if (level() < CLAIM_TIERS[0][0]) return `Reach Lv ${CLAIM_TIERS[0][0]} to unlock claiming`;
  if (totalClaimable() <= 0) return "Care & play to earn $GOTCHI";
  return `${fmt(totalClaimable())} $GOTCHI ready — tap Claim`;
}
function claim() {
  if (!canClaim()) return 0;
  const amount = totalClaimable();
  for (const [l] of claimableTiers()) state.claimedTiers.push(l);
  state.balance += amount;
  state.pending = 0;
  save();
  renderHud();
  return amount;
}

function reward(xp = 0, gotchi = 0) {
  const beforeL = level(), beforeStage = stage().name;
  if (xp) state.xp += xp;
  if (gotchi) state.pending += Math.round(gotchi * bondMult());
  if (level() > beforeL) toast(`Level up! Lv ${level()}`);
  if (stage().name !== beforeStage) toast(`✨ Evolved — ${stage().name}!`);
  renderHud();
  save();
}

/* ===================== daily play limit ===================== */
const todayStr = () => new Date().toISOString().slice(0, 10);
function playsLeft() {
  const p = state.play || (state.play = { day: "", count: 0 });
  if (p.day !== todayStr()) return PLAYS_PER_DAY;
  return Math.max(0, PLAYS_PER_DAY - p.count);
}
function consumePlay() {
  const t = todayStr();
  if (!state.play || state.play.day !== t) state.play = { day: t, count: 0 };
  state.play.count += 1;
  save();
}

/* ===================== screen routing ===================== */
let lastScreen = "screen-entry";
function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  if (id !== "screen-earn") lastScreen = id;
  window.scrollTo(0, 0);
}

/* ===================== wallet (Solana) ===================== */
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function getSolanaProvider() {
  if (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) return window.phantom.solana;
  if (window.solflare && window.solflare.isSolflare) return window.solflare;
  if (window.backpack && window.backpack.isBackpack) return window.backpack;
  if (window.solana) return window.solana;
  return null;
}

async function connectWallet() {
  const provider = getSolanaProvider();
  if (provider && provider.connect) {
    try {
      const resp = await provider.connect();
      const pk = (resp && resp.publicKey) || provider.publicKey;
      if (pk) return { address: pk.toString(), real: true };
    } catch (e) {
      if (e && (e.code === 4001 || e.code === -32603)) { toast("Connection rejected"); return null; }
    }
  }
  let demo = localStorage.getItem("gotchi:demoAddress");
  if (!demo) {
    demo = Array.from({ length: 44 }, () => B58[(Math.random() * B58.length) | 0]).join("");
    try { localStorage.setItem("gotchi:demoAddress", demo); } catch (e) {}
  }
  return { address: demo, real: false };
}

const shortAddr = (a) => (a ? a.slice(0, 4) + "…" + a.slice(-4) : "");

function toB64(bytes) {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let s = "";
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s);
}

// Ask the wallet to sign a Sign-In message — proves the user controls the key.
async function verifyWallet(provider, address) {
  if (!provider || typeof provider.signMessage !== "function") return false;
  const nonce = Array.from({ length: 16 }, () => "0123456789abcdef"[(Math.random() * 16) | 0]).join("");
  const message =
`Gotchi — Sign in to petgotchi.xyz
Verify you own this wallet to load your Gotchi.
This request is free and will not move any funds.

Wallet: ${address}
Nonce: ${nonce}
Issued: ${new Date().toISOString()}`;
  try {
    const encoded = new TextEncoder().encode(message);
    const res = await provider.signMessage(encoded, "utf8");
    const sig = res && (res.signature || res);
    session.auth = { message, nonce, address, signature: toB64(sig) };
    return true;
  } catch (e) {
    return false;
  }
}

/* ===================== username ===================== */
function cleanName(raw) { return (raw || "").replace(/\s+/g, " ").trim(); }
function nameError(name) {
  if (name.length < 2) return "At least 2 characters.";
  if (name.length > 20) return "20 characters max.";
  if (!/^[\p{L}\p{N} _'-]+$/u.test(name)) return "Letters, numbers & spaces only.";
  return "";
}
let afterName = null;
function openNameModal(opts = {}) {
  $("#name-input").value = state.username || "";
  $("#name-error").classList.add("hidden");
  $("#name-sub").textContent = opts.first
    ? "A name to call your bloom. You can change it anytime."
    : "Rename your Gotchi.";
  afterName = opts.then || null;
  $("#name-modal").classList.remove("hidden");
  setTimeout(() => $("#name-input").focus(), 30);
}
function closeNameModal() { $("#name-modal").classList.add("hidden"); }

/* ===================== entry flows ===================== */
function enterAsWallet(address, real) {
  session.mode = "wallet";
  session.address = address;
  $("#wallet-chip").textContent = (real ? "◆ " : "🧪 ") + shortAddr(address) + (session.verified ? " ✓" : "");
  $("#guest-banner").classList.add("hidden");
  return fetchRemote(address).then((remote) => {
    if (remote && typeof remote === "object") state = Object.assign(defaultState(), remote);
    else { state = load(address); if (remoteOK && remote === null) saveRemote(); }
    if (!state.username) openNameModal({ first: true, then: startGame });
    else startGame();
  });
}

function enterAsGuest() {
  session.mode = "guest";
  session.address = null;
  session.verified = false;
  state = defaultState();
  $("#wallet-chip").textContent = "Guest";
  $("#guest-banner").classList.remove("hidden");
  openNameModal({ first: true, then: startGame });
}

function startGame() { renderHud(); showScreen("screen-game"); }

/* ===================== rendering ===================== */
function renderHud() {
  const info = xpInfo(), st = stage();
  $("#profile-name-text").textContent = state.username || "Your Gotchi";
  $("#hud-balance").textContent = fmt(state.balance);
  $("#hud-level").textContent = info.L;
  $("#hud-claimable").textContent = fmt(totalClaimable());
  $("#claim-status").textContent = claimStatus();
  $("#btn-claim").disabled = !canClaim();
  $("#stage-name").textContent = st.name;
  $("#stage-blurb").textContent = st.blurb;
  $("#xp-text").textContent = `${fmt(info.into)} / ${fmt(info.span)} XP`;
  $("#lvl-ring").style.setProperty("--pct", info.pct.toFixed(1));
  $("#bond-mult").textContent = `${bondMult().toFixed(2)}× earnings`;

  const s = state.stats;
  const avg = (s.satiety + s.hygiene + s.happy + s.health) / 4;
  $("#mood").textContent = avg > 75 ? "Thriving" : avg > 55 ? "Happy" : avg > 35 ? "Okay" : avg > 15 ? "Needs care" : "Critical!";
  $("#mood-dot").style.background = avg > 55 ? "var(--good)" : avg > 25 ? "var(--warn)" : "var(--bad)";

  for (const el of $$(".stat")) {
    const key = el.dataset.stat;
    const v = Math.max(0, Math.min(100, Math.round(key === "bond" ? (state.bond || 0) : s[key])));
    el.querySelector(".stat-val").textContent = v;
    const bar = el.querySelector(".bar");
    bar.querySelector("i").style.width = v + "%";
    if (key !== "bond") {
      bar.classList.toggle("low", v <= 25);
      bar.classList.toggle("mid", v > 25 && v <= 55);
    }
  }

  const playBtn = document.querySelector('.act[data-act="play"]');
  if (playBtn) {
    const left = playsLeft();
    playBtn.querySelector(".play-label").textContent = `Play (${left})`;
    playBtn.disabled = left <= 0;
  }
}

/* pet animation (entry uses the static logo; only the in-game pet animates) */
let petFrame = 0;
const gameImg = $("#game-pet");
gameImg.src = PET_FRAMES[0];
setInterval(() => {
  petFrame = (petFrame + 1) % PET_FRAMES.length;
  gameImg.src = PET_FRAMES[petFrame];
}, 140);

/* ===================== stat decay + bond ===================== */
setInterval(() => {
  if (session.mode === null) return;
  const s = state.stats;
  s.satiety = Math.max(0, s.satiety - 2);
  s.hygiene = Math.max(0, s.hygiene - 1.4);
  s.happy = Math.max(0, s.happy - 1.4);
  if (s.satiety <= 0 || s.hygiene <= 0) s.health = Math.max(0, s.health - 2);
  const avg = (s.satiety + s.hygiene + s.happy + s.health) / 4;
  if (avg > 70) state.bond = Math.min(100, (state.bond || 0) + 1.5);
  else if (s.satiety <= 0 || s.hygiene <= 0 || s.happy <= 0 || s.health <= 0) state.bond = Math.max(0, (state.bond || 0) - 3);
  renderHud();
  save();
}, 6000);

/* ===================== actions ===================== */
function doAction(act) {
  if (act === "play") {
    if (playsLeft() <= 0) { toast(`Daily limit: ${PLAYS_PER_DAY} plays — back tomorrow!`); return; }
    consumePlay();
    openMinigame();
    renderHud();
    return;
  }
  if (act === "how") { showScreen("screen-earn"); return; }
  const cfg = ACTION[act];
  if (!cfg) return;
  const s = state.stats;
  s[cfg.stat] = Math.min(100, s[cfg.stat] + cfg.amount);
  if (cfg.cross) for (const k in cfg.cross) s[k] = Math.max(0, s[k] + cfg.cross[k]);
  reward(cfg.xp, 0);
  toast(cfg.label);
  renderHud();
}

/* ===================== toast ===================== */
let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  // re-trigger entrance animation
  el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 1700);
}

/* ===================== mini-game (catch the coins) ===================== */
const mg = {
  running: false, raf: 0, canvas: null, ctx: null,
  basketX: 0, coins: [], score: 0, earned: 0,
  lastSpawn: 0, lastTick: 0, endAt: 0,
  coinImg: new Image(), basketImg: new Image(),
};
mg.coinImg.src = "assets/coin.png";
mg.basketImg.src = "assets/basket.png";
const BASKET_W = 90, BASKET_H = 40, COIN_R = 16, ROUND_MS = 30000;

function openMinigame() {
  $("#minigame").classList.remove("hidden");
  const c = $("#mg-canvas");
  mg.canvas = c; mg.ctx = c.getContext("2d");
  mg.basketX = c.width / 2; mg.coins = []; mg.score = 0; mg.earned = 0;
  mg.lastSpawn = 0; mg.lastTick = performance.now(); mg.endAt = performance.now() + ROUND_MS;
  mg.running = true;
  $("#mg-score").textContent = "0"; $("#mg-earned").textContent = "0"; $("#mg-time").textContent = "30";
  mg.raf = requestAnimationFrame(mgLoop);
}
function closeMinigame(awarded) {
  if (!mg.running && !awarded) { $("#minigame").classList.add("hidden"); return; }
  mg.running = false;
  cancelAnimationFrame(mg.raf);
  $("#minigame").classList.add("hidden");
  if (awarded) {
    state.stats.happy = Math.min(100, state.stats.happy + 12);
    state.stats.satiety = Math.max(0, state.stats.satiety - 4);
    if (mg.score > 0) reward(mg.score, 0); // completion XP bonus (coins already banked in-loop)
    renderHud(); save();
    toast(`Round over! +${fmt(mg.earned)} $GOTCHI`);
  }
}
function mgLoop(now) {
  if (!mg.running) return;
  const { ctx, canvas } = mg;
  const dt = (now - mg.lastTick) / 1000; mg.lastTick = now;

  const left = Math.max(0, Math.ceil((mg.endAt - now) / 1000));
  $("#mg-time").textContent = left;
  if (now >= mg.endAt) { closeMinigame(true); return; }

  if (now - mg.lastSpawn > 640) {
    mg.lastSpawn = now;
    mg.coins.push({ x: 30 + Math.random() * (canvas.width - 60), y: -20, v: 120 + Math.random() * 120 });
  }
  const basketY = canvas.height - BASKET_H - 6;
  for (const coin of mg.coins) coin.y += coin.v * dt;
  mg.coins = mg.coins.filter((coin) => {
    const caught = coin.y + COIN_R >= basketY &&
      coin.x > mg.basketX - BASKET_W / 2 && coin.x < mg.basketX + BASKET_W / 2 && coin.y < canvas.height;
    if (caught) {
      const gain = Math.round(COIN_GOTCHI * bondMult());
      mg.score += 1; mg.earned += gain;
      state.pending += gain; state.xp += COIN_XP;
      $("#mg-score").textContent = mg.score; $("#mg-earned").textContent = fmt(mg.earned);
      return false;
    }
    return coin.y < canvas.height + 30;
  });

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const coin of mg.coins) {
    if (mg.coinImg.complete && mg.coinImg.naturalWidth) ctx.drawImage(mg.coinImg, coin.x - COIN_R, coin.y - COIN_R, COIN_R * 2, COIN_R * 2);
    else { ctx.fillStyle = "#ffd45e"; ctx.beginPath(); ctx.arc(coin.x, coin.y, COIN_R, 0, 7); ctx.fill(); }
  }
  if (mg.basketImg.complete && mg.basketImg.naturalWidth) ctx.drawImage(mg.basketImg, mg.basketX - BASKET_W / 2, basketY, BASKET_W, BASKET_H);
  else { ctx.fillStyle = "#caa15a"; ctx.fillRect(mg.basketX - BASKET_W / 2, basketY, BASKET_W, BASKET_H); }

  mg.raf = requestAnimationFrame(mgLoop);
}
function moveBasketTo(clientX) {
  const r = mg.canvas.getBoundingClientRect();
  const x = ((clientX - r.left) / r.width) * mg.canvas.width;
  mg.basketX = Math.max(BASKET_W / 2, Math.min(mg.canvas.width - BASKET_W / 2, x));
}

/* ===================== wiring ===================== */
function setLoading(btn, on) { btn.classList.toggle("is-loading", on); btn.disabled = on; }

const connectBtn = $("#btn-connect");
connectBtn.addEventListener("click", async () => {
  setLoading(connectBtn, true);
  const res = await connectWallet();
  if (!res) { setLoading(connectBtn, false); return; }
  if (res.real) {
    toast("Approve the signature in your wallet");
    const ok = await verifyWallet(getSolanaProvider(), res.address);
    if (!ok) { setLoading(connectBtn, false); toast("Verification cancelled"); return; }
    session.verified = true;
  } else {
    session.verified = false;
  }
  setLoading(connectBtn, false);
  await enterAsWallet(res.address, res.real);
});

$("#btn-guest").addEventListener("click", enterAsGuest);
$("#btn-how-entry").addEventListener("click", () => showScreen("screen-earn"));

$("#btn-copy-ca").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(TOKEN_CA);
    toast("Contract address copied!");
  } catch (e) {
    toast("Copy failed — select CA manually");
  }
});
$$("[data-back]").forEach((b) => b.addEventListener("click", () => showScreen(lastScreen)));

$("#btn-logout").addEventListener("click", () => {
  save();
  session.mode = null; session.address = null; session.verified = false; session.auth = null;
  state = defaultState();
  showScreen("screen-entry");
});

$("#btn-claim").addEventListener("click", () => {
  const amt = claim();
  if (amt > 0) toast(`Claimed ${fmt(amt)} $GOTCHI!`);
});

$$(".actions .act").forEach((b) => b.addEventListener("click", () => doAction(b.dataset.act)));

/* username modal */
$("#profile-name").addEventListener("click", () => openNameModal({ first: false }));
$("#name-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = cleanName($("#name-input").value);
  const err = nameError(name);
  const errEl = $("#name-error");
  if (err) { errEl.textContent = err; errEl.classList.remove("hidden"); return; }
  state.username = name;
  save();
  closeNameModal();
  renderHud();
  const then = afterName; afterName = null;
  if (then) then();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("#name-modal").classList.contains("hidden") && state.username) closeNameModal();
});

/* minigame controls */
$("#mg-exit").addEventListener("click", () => closeMinigame(true));
document.addEventListener("pointermove", (e) => { if (mg.running) moveBasketTo(e.clientX); });
$("#mg-canvas").addEventListener("pointerdown", (e) => { if (mg.running) moveBasketTo(e.clientX); });
document.addEventListener("keydown", (e) => {
  if (!mg.running) return;
  if (e.key === "ArrowLeft") mg.basketX = Math.max(BASKET_W / 2, mg.basketX - 36);
  if (e.key === "ArrowRight") mg.basketX = Math.min(mg.canvas.width - BASKET_W / 2, mg.basketX + 36);
});

/* react to wallet account/disconnect changes */
const _sol = getSolanaProvider();
if (_sol && _sol.on) {
  _sol.on("accountChanged", async (pk) => {
    if (session.mode !== "wallet") return;
    if (!pk) { $("#btn-logout").click(); return; }
    save();
    session.verified = false;
    session.auth = null;
    const addr = pk.toString();
    toast("Approve the signature in your wallet");
    const ok = await verifyWallet(getSolanaProvider(), addr);
    if (!ok) { toast("Verification cancelled"); $("#btn-logout").click(); return; }
    session.verified = true;
    await enterAsWallet(addr, true);
  });
  _sol.on("disconnect", () => { if (session.mode === "wallet") $("#btn-logout").click(); });
}

/* persist on tab close */
window.addEventListener("beforeunload", () => {
  save();
  if (session.mode === "wallet" && session.address && remoteOK && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify({ address: session.address, state, auth: session.auth })], { type: "application/json" });
    navigator.sendBeacon(SAVE_API, blob);
  }
});
