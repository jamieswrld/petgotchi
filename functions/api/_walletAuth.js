// Solana wallet sign-in verification (Ed25519 via Web Crypto — no extra deps).

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MSG_HEAD =
  "Gotchi — Sign in to petgotchi.xyz\n" +
  "Verify you own this wallet to load your Gotchi.\n" +
  "This request is free and will not move any funds.\n\n" +
  "Wallet: ";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function b58decode(str) {
  if (typeof str !== "string" || !str.length) throw new Error("bad base58");
  const out = [];
  for (const ch of str) {
    const val = B58.indexOf(ch);
    if (val < 0) throw new Error("bad base58");
    let carry = val;
    for (let i = 0; i < out.length; i++) {
      carry += out[i] * 58;
      out[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      out.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of str) {
    if (ch !== "1") break;
    out.push(0);
  }
  return new Uint8Array(out.reverse());
}

function b64decode(str) {
  if (typeof str !== "string" || !str.length) throw new Error("bad base64");
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function validateMessage(message, address, nonce) {
  if (typeof message !== "string" || !message.startsWith(MSG_HEAD)) return "bad message";
  const tail = message.slice(MSG_HEAD.length);
  const lines = tail.split("\n");
  if (lines[0] !== address) return "address mismatch in message";
  if (lines[1] !== `Nonce: ${nonce}`) return "nonce mismatch in message";
  if (!lines[2]?.startsWith("Issued: ")) return "missing issued time";
  const issued = Date.parse(lines[2].slice("Issued: ".length));
  if (!Number.isFinite(issued)) return "invalid issued time";
  const age = Date.now() - issued;
  if (age < -60_000 || age > MAX_AGE_MS) return "signature expired";
  return null;
}

/** @returns {Promise<string|null>} error string, or null if valid */
export async function verifyWalletAuth(auth, address) {
  if (!auth || typeof auth !== "object") return "missing auth";
  const { message, nonce, address: authAddr, signature } = auth;
  if (typeof authAddr !== "string" || authAddr !== address) return "address mismatch";
  if (typeof nonce !== "string" || nonce.length < 8) return "bad nonce";
  if (typeof signature !== "string" || !signature.length) return "missing signature";

  const msgErr = validateMessage(message, address, nonce);
  if (msgErr) return msgErr;

  let pubkey, sig;
  try {
    pubkey = b58decode(address);
    sig = b64decode(signature);
  } catch {
    return "bad encoding";
  }
  if (pubkey.length !== 32) return "bad pubkey length";
  if (sig.length !== 64) return "bad signature length";

  const key = await crypto.subtle.importKey("raw", pubkey, { name: "Ed25519" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("Ed25519", key, sig, new TextEncoder().encode(message));
  return ok ? null : "invalid signature";
}
