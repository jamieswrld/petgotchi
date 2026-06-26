// Cloudflare Pages Function — cross-device Gotchi saves, backed by Workers KV.
//
// Routes (same-origin): GET/POST /api/save
//   GET  /api/save?address=0x...   -> { address, state | null }
//   POST /api/save  { address, state } -> { ok, state }
//
// Saves are keyed by the Solana wallet address (case-sensitive base58). SECURITY
// NOTE: for this demo (the $GOTCHI token has no real-world value) writes are NOT
// signature-verified — anyone who knows an address could overwrite its save. Before
// attaching any real value, add wallet-signature auth: have the client signMessage a
// nonce and verify the Ed25519 signature here. (Bonus: Cloudflare Workers' Web Crypto
// supports Ed25519 natively, so this needs no extra dependency.)
//
// If the KV binding (GOTCHI_KV) is not configured, the handlers return 503 and the
// frontend transparently falls back to localStorage, so the site still works.

// Solana base58 pubkey: base58 alphabet (no 0 O I l), typically 32-44 chars.
const ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ALLOWED_TIERS = [2, 5, 10, 25];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

function clampInt(v, min, max, dflt = 0) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

// Clamp/whitelist incoming state so a bad client can't store garbage or huge values.
function sanitize(state) {
  const s = state && typeof state === "object" ? state : {};
  const st = s.stats && typeof s.stats === "object" ? s.stats : {};
  return {
    stats: {
      satiety: clampInt(st.satiety, 0, 100, 100),
      hygiene: clampInt(st.hygiene, 0, 100, 100),
      happy: clampInt(st.happy, 0, 100, 100),
      health: clampInt(st.health, 0, 100, 100),
    },
    xp: clampInt(s.xp, 0, 100_000_000),
    balance: clampInt(s.balance, 0, 1_000_000_000),
    pending: clampInt(s.pending, 0, 1_000_000_000),
    claimedTiers: Array.isArray(s.claimedTiers)
      ? [...new Set(s.claimedTiers.map(Number).filter((t) => ALLOWED_TIERS.includes(t)))]
      : [],
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  if (!env.GOTCHI_KV) return json({ error: "storage not configured" }, 503);
  const address = new URL(request.url).searchParams.get("address") || "";
  if (!ADDR_RE.test(address)) return json({ error: "invalid address" }, 400);
  const raw = await env.GOTCHI_KV.get("save:" + address);
  return json({ address, state: raw ? JSON.parse(raw) : null });
}

export async function onRequestPost({ request, env }) {
  if (!env.GOTCHI_KV) return json({ error: "storage not configured" }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const address = body.address || "";
  if (!ADDR_RE.test(address)) return json({ error: "invalid address" }, 400);
  const state = sanitize(body.state);
  await env.GOTCHI_KV.put("save:" + address, JSON.stringify(state));
  return json({ ok: true, state });
}
