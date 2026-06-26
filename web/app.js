/* Gotchi — play-to-earn web app (Solana)
 * Entry gate: Connect Wallet (saves progress) or Guest (in-memory only).
 * NOTE: $GOTCHI is an in-game demo token with no real-world value. The wallet
 * connect uses an injected Solana wallet (Phantom / Solflare / Backpack); if no
 * wallet is installed it falls back to a local demo address so the flow still
 * works end-to-end. No tokens are minted or transferred on any chain.
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// --- economy config (mirrors the desktop build) --------------------------
const XP_PER_LEVEL = 100;
const COIN_XP = 4;
const COIN_GOTCHI = 5;
const CLAIM_TIERS = [
  [2, 100],
  [5, 250],
  [10, 500],
  [25, 1000],
];
const ACTION = {
  feed:  { stat: "satiety", amount: 18, xp: 6,  label: "Yum!" },
  clean: { stat: "hygiene", amount: 30, xp: 10, label: "Squeaky clean!" },
  heal:  { stat: "health",  amount: 22, xp: 8,  label: "Feeling better!" },
};

const PET_FRAMES = Array.from({ length: 8 }, (_, i) => `assets/pet/tamagotchi-${i}.png`);

// --- session + state ------------------------------------------------------
const session = { mode: null, address: null }; // mode: 'wallet' | 'guest'

function defaultState() {
  return {
    stats: { satiety: 100, hygiene: 100, happy: 100, health: 100 },
    xp: 0,
    balance: 0,
    pending: 0,
    claimedTiers: [],
  };
}
let state = defaultState();

// Solana addresses are case-sensitive base58 — do NOT lowercase them.
const storageKey = (addr) => `gotchi:${addr}`;

// --- cross-device sync (Cloudflare Pages Function + KV) -------------------
// Wallet saves go to the backend (source of truth across devices) and are also
// mirrored to localStorage as an offline cache. If the backend is unreachable
// (e.g. local `python http.server`, or KV not yet configured) we fall back to
// the localStorage cache so the app keeps working. Guests never persist.
// Backend is OPT-IN: set window.GOTCHI_API (config.js) to a backend URL to enable
// cross-device saves. Empty = per-device localStorage only (current GitHub Pages setup),
// and we skip the network entirely so there are no stray requests.
const API_BASE = (window.GOTCHI_API || "").trim().replace(/\/$/, "");
const BACKEND_ENABLED = API_BASE !== "";
const SAVE_API = API_BASE + "/api/save";
let remoteOK = false; // backend reachable for this session?

async function fetchRemote(address) {
  if (!BACKEND_ENABLED) return undefined; // per-device mode -> localStorage only
  try {
    const r = await fetch(`${SAVE_API}?address=${address}`, { cache: "no-store" });
    if (!r.ok) return undefined;           // 404/503 -> treat as no backend
    const data = await r.json();
    remoteOK = true;
    return data.state || null;             // null = backend works but no save yet
  } catch (e) {
    return undefined;                      // network error -> backend unavailable
  }
}

let remoteTimer = null;
function saveRemote() {
  if (!BACKEND_ENABLED || session.mode !== "wallet" || !session.address || !remoteOK) return;
  clearTimeout(remoteTimer);
  remoteTimer = setTimeout(() => {
    fetch(SAVE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: session.address, state }),
      keepalive: true,
    }).catch(() => {});
  }, 800);
}

function save() {
  if (session.mode !== "wallet" || !session.address) return; // guests never save
  try {
    localStorage.setItem(storageKey(session.address), JSON.stringify(state));
  } catch (e) { /* storage full / blocked — ignore */ }
  saveRemote();
}

function load(addr) {
  try {
    const raw = localStorage.getItem(storageKey(addr));
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { /* ignore */ }
  return defaultState();
}

// --- economy helpers ------------------------------------------------------
const level = () => 1 + Math.floor(state.xp / XP_PER_LEVEL);
const xpIntoLevel = () => state.xp % XP_PER_LEVEL;

function claimableTiers() {
  const lvl = level();
  return CLAIM_TIERS.filter(([l]) => lvl >= l && !state.claimedTiers.includes(l));
}
function totalClaimable() {
  return state.pending + claimableTiers().reduce((s, [, r]) => s + r, 0);
}
function canClaim() {
  return level() >= CLAIM_TIERS[0][0] && totalClaimable() > 0;
}
function claimStatus() {
  if (level() < CLAIM_TIERS[0][0]) return `Reach Lv ${CLAIM_TIERS[0][0]} to unlock claiming`;
  if (totalClaimable() <= 0) return "Care & play to earn $GOTCHI";
  return `${totalClaimable()} $GOTCHI ready — press Claim!`;
}

function reward(xp = 0, gotchi = 0) {
  const before = level();
  state.xp += xp;
  state.pending += gotchi;
  if (level() > before) toast(`Level up! Now Lv ${level()}`);
  renderHud();
  save();
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

// --- screen routing -------------------------------------------------------
let lastScreen = "screen-entry";
function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  if (id !== "screen-earn") lastScreen = id;
  window.scrollTo(0, 0);
}

// --- wallet connect -------------------------------------------------------
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Pick whichever Solana wallet the browser has injected (Phantom / Solflare / Backpack).
function getSolanaProvider() {
  if (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) return window.phantom.solana;
  if (window.solflare && window.solflare.isSolflare) return window.solflare;
  if (window.backpack && window.backpack.isBackpack) return window.backpack;
  if (window.solana) return window.solana; // generic injected provider
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
      // other errors: fall through to demo so the flow still works
    }
  }
  // No Solana wallet installed: use a persistent demo address (base58, like a pubkey).
  let demo = localStorage.getItem("gotchi:demoAddress");
  if (!demo) {
    demo = Array.from({ length: 44 }, () => B58[(Math.random() * B58.length) | 0]).join("");
    try { localStorage.setItem("gotchi:demoAddress", demo); } catch (e) {}
  }
  return { address: demo, real: false };
}

const shortAddr = (a) => a ? a.slice(0, 4) + "…" + a.slice(-4) : "";

async function enterAsWallet(address, real) {
  session.mode = "wallet";
  session.address = address;
  $("#wallet-chip").textContent = (real ? "🟢 " : "🧪 ") + shortAddr(address);
  $("#guest-banner").classList.add("hidden");

  // Backend is the cross-device source of truth; fall back to local cache.
  const remote = await fetchRemote(address); // object=save, null=empty, undefined=offline
  if (remote && typeof remote === "object") {
    state = Object.assign(defaultState(), remote);
  } else {
    state = load(address);
    if (remoteOK && remote === null) saveRemote(); // seed backend from local cache
  }
  startGame();
}

function enterAsGuest() {
  session.mode = "guest";
  session.address = null;
  state = defaultState();
  $("#wallet-chip").textContent = "👤 Guest";
  $("#guest-banner").classList.remove("hidden");
  startGame();
}

// --- rendering ------------------------------------------------------------
function renderHud() {
  $("#hud-balance").textContent = state.balance;
  $("#hud-level").textContent = level();
  $("#hud-claimable").textContent = totalClaimable();
  $("#claim-status").textContent = claimStatus();
  $("#btn-claim").disabled = !canClaim();
  $("#xp-fill").style.width = `${(xpIntoLevel() / XP_PER_LEVEL) * 100}%`;
  $("#xp-text").textContent = `${xpIntoLevel()} / ${XP_PER_LEVEL} XP`;

  for (const el of $$(".stat")) {
    const key = el.dataset.stat;
    const v = Math.max(0, Math.min(100, Math.round(state.stats[key])));
    const bar = el.querySelector(".bar");
    bar.querySelector("i").style.width = v + "%";
    bar.classList.toggle("low", v <= 25);
  }

  const avg = (state.stats.satiety + state.stats.hygiene + state.stats.happy + state.stats.health) / 4;
  $("#mood").textContent = avg > 70 ? "Happy" : avg > 40 ? "Okay" : avg > 15 ? "Needs care" : "Critical!";
}

// --- pet animation --------------------------------------------------------
let petFrame = 0;
const heroImg = $("#hero-pet");
const gameImg = $("#game-pet");
heroImg.src = PET_FRAMES[0];
gameImg.src = PET_FRAMES[0];
setInterval(() => {
  petFrame = (petFrame + 1) % PET_FRAMES.length;
  heroImg.src = PET_FRAMES[petFrame];
  gameImg.src = PET_FRAMES[petFrame];
}, 130);

// --- stat decay loop ------------------------------------------------------
function startGame() {
  renderHud();
  showScreen("screen-game");
}
setInterval(() => {
  if (session.mode === null) return;
  const s = state.stats;
  s.satiety = Math.max(0, s.satiety - 2);
  s.hygiene = Math.max(0, s.hygiene - 1.5);
  s.happy = Math.max(0, s.happy - 1.5);
  if (s.satiety <= 0 || s.hygiene <= 0) s.health = Math.max(0, s.health - 2);
  renderHud();
  save();
}, 6000);

// --- actions --------------------------------------------------------------
function doAction(act) {
  if (act === "play") { openMinigame(); return; }
  if (act === "how") { showScreen("screen-earn"); return; }

  const cfg = ACTION[act];
  if (!cfg) return;
  const s = state.stats;
  s[cfg.stat] = Math.min(100, s[cfg.stat] + cfg.amount);
  if (act === "feed") s.hygiene = Math.max(0, s.hygiene - 4); // eating is messy
  reward(cfg.xp, 0);
  toast(cfg.label);
  renderHud();
}

// --- toast ----------------------------------------------------------------
let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 1600);
}

// --- mini-game (catch the coins) -----------------------------------------
const mg = {
  running: false, raf: 0, canvas: null, ctx: null,
  basketX: 0, coins: [], score: 0, earned: 0,
  timeLeft: 30, lastSpawn: 0, lastTick: 0, endAt: 0,
  coinImg: new Image(), basketImg: new Image(),
};
mg.coinImg.src = "assets/coin.png";
mg.basketImg.src = "assets/basket.png";

function openMinigame() {
  $("#minigame").classList.remove("hidden");
  const c = $("#mg-canvas");
  mg.canvas = c;
  mg.ctx = c.getContext("2d");
  mg.basketX = c.width / 2;
  mg.coins = [];
  mg.score = 0;
  mg.earned = 0;
  mg.timeLeft = 30;
  mg.lastSpawn = 0;
  mg.lastTick = performance.now();
  mg.endAt = performance.now() + 30000;
  mg.running = true;
  $("#mg-score").textContent = "0";
  $("#mg-earned").textContent = "0";
  $("#mg-time").textContent = "30";
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
    if (mg.score > 0) reward(mg.score, 0); // completion XP bonus
    renderHud();
    save();
    toast(`Round over! +${mg.earned} $GOTCHI`);
  }
}

const BASKET_W = 90, BASKET_H = 40, COIN_R = 16;

function mgLoop(now) {
  if (!mg.running) return;
  const { ctx, canvas } = mg;
  const dt = (now - mg.lastTick) / 1000;
  mg.lastTick = now;

  // timer
  mg.timeLeft = Math.max(0, Math.ceil((mg.endAt - now) / 1000));
  $("#mg-time").textContent = mg.timeLeft;
  if (now >= mg.endAt) { closeMinigame(true); return; }

  // spawn
  if (now - mg.lastSpawn > 650) {
    mg.lastSpawn = now;
    mg.coins.push({ x: 30 + Math.random() * (canvas.width - 60), y: -20, v: 120 + Math.random() * 110 });
  }

  // update coins
  const basketY = canvas.height - BASKET_H - 6;
  for (const coin of mg.coins) coin.y += coin.v * dt;
  mg.coins = mg.coins.filter((coin) => {
    const caught = coin.y + COIN_R >= basketY &&
      coin.x > mg.basketX - BASKET_W / 2 && coin.x < mg.basketX + BASKET_W / 2 &&
      coin.y < canvas.height;
    if (caught) {
      mg.score += 1;
      mg.earned += COIN_GOTCHI;
      state.pending += COIN_GOTCHI;
      state.xp += COIN_XP;
      $("#mg-score").textContent = mg.score;
      $("#mg-earned").textContent = mg.earned;
      return false;
    }
    return coin.y < canvas.height + 30;
  });

  // draw
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const coin of mg.coins) {
    if (mg.coinImg.complete && mg.coinImg.naturalWidth) {
      ctx.drawImage(mg.coinImg, coin.x - COIN_R, coin.y - COIN_R, COIN_R * 2, COIN_R * 2);
    } else {
      ctx.fillStyle = "#ffd666"; ctx.beginPath(); ctx.arc(coin.x, coin.y, COIN_R, 0, 7); ctx.fill();
    }
  }
  if (mg.basketImg.complete && mg.basketImg.naturalWidth) {
    ctx.drawImage(mg.basketImg, mg.basketX - BASKET_W / 2, basketY, BASKET_W, BASKET_H);
  } else {
    ctx.fillStyle = "#caa15a";
    ctx.fillRect(mg.basketX - BASKET_W / 2, basketY, BASKET_W, BASKET_H);
  }

  mg.raf = requestAnimationFrame(mgLoop);
}

function moveBasketTo(clientX) {
  const r = mg.canvas.getBoundingClientRect();
  const x = ((clientX - r.left) / r.width) * mg.canvas.width;
  mg.basketX = Math.max(BASKET_W / 2, Math.min(mg.canvas.width - BASKET_W / 2, x));
}

// --- wiring ---------------------------------------------------------------
$("#btn-connect").addEventListener("click", async () => {
  $("#btn-connect").disabled = true;
  $("#btn-connect").textContent = "Connecting…";
  const res = await connectWallet();
  $("#btn-connect").disabled = false;
  $("#btn-connect").textContent = "Connect Wallet";
  if (res) await enterAsWallet(res.address, res.real);
});
$("#btn-guest").addEventListener("click", enterAsGuest);
$("#btn-how-entry").addEventListener("click", () => showScreen("screen-earn"));
$$("[data-back]").forEach((b) => b.addEventListener("click", () => showScreen(lastScreen)));

$("#btn-logout").addEventListener("click", () => {
  save();
  session.mode = null; session.address = null;
  state = defaultState();
  showScreen("screen-entry");
});

$("#btn-claim").addEventListener("click", () => {
  const amt = claim();
  if (amt > 0) toast(`Claimed ${amt} $GOTCHI!`);
});

$$(".actions .act").forEach((b) => b.addEventListener("click", () => doAction(b.dataset.act)));

// minigame controls
$("#mg-exit").addEventListener("click", () => closeMinigame(true));
document.addEventListener("pointermove", (e) => { if (mg.running) moveBasketTo(e.clientX); });
$("#mg-canvas").addEventListener("pointerdown", (e) => { if (mg.running) moveBasketTo(e.clientX); });
document.addEventListener("keydown", (e) => {
  if (!mg.running) return;
  if (e.key === "ArrowLeft") mg.basketX = Math.max(BASKET_W / 2, mg.basketX - 36);
  if (e.key === "ArrowRight") mg.basketX = Math.min(mg.canvas.width - BASKET_W / 2, mg.basketX + 36);
});

// react to wallet account/disconnect changes
const _sol = getSolanaProvider();
if (_sol && _sol.on) {
  _sol.on("accountChanged", (pk) => {
    if (session.mode !== "wallet") return;
    if (!pk) { $("#btn-logout").click(); }            // wallet locked / switched to none
    else { save(); enterAsWallet(pk.toString(), true); } // switched account
  });
  _sol.on("disconnect", () => { if (session.mode === "wallet") $("#btn-logout").click(); });
}

// persist on tab close — localStorage write is sync; flush the remote save with a beacon
window.addEventListener("beforeunload", () => {
  save();
  if (session.mode === "wallet" && session.address && remoteOK && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify({ address: session.address, state })], { type: "application/json" });
    navigator.sendBeacon(SAVE_API, blob);
  }
});
