# Deploying Gotchi to petgotchi.xyz (GitHub Pages — free)

The web app (`web/`) is static, so GitHub Pages can host it for free with your custom
domain + HTTPS. Wallet connect is **Solana** (Phantom / Solflare / Backpack).

> ⚠️ Your current git remote is the upstream repo (`YarikHrabovets/tamagotchi`). GitHub
> Pages deploys from **your own** repo, so first create one you can push to (a fork or a
> brand-new repo) and push this code to its `main` branch.

## 1. Host the site on GitHub Pages
1. Push this repo to **your** GitHub account (`main` branch).
2. In that repo: **Settings → Pages → Build and deployment → Source: "GitHub Actions".**
3. The included workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
   publishes the `web/` folder on every push to `main` (and via *Actions → Run workflow*).
   You'll get a `https://<user>.github.io/<repo>/` URL once it finishes.

## 2. Point petgotchi.xyz at it
`web/CNAME` already contains `petgotchi.xyz`, so Pages will request the custom domain.
At your registrar / DNS for `petgotchi.xyz`, add:

| Type  | Name | Value                          |
|-------|------|--------------------------------|
| A     | @    | 185.199.108.153                |
| A     | @    | 185.199.109.153                |
| A     | @    | 185.199.110.153                |
| A     | @    | 185.199.111.153                |
| CNAME | www  | `<your-user>.github.io`        |

Then in **Settings → Pages → Custom domain** enter `petgotchi.xyz` and tick *Enforce HTTPS*
(give DNS a little time to propagate first). Done → https://petgotchi.xyz is live.

## 3. Saves
The app saves wallet progress and **falls back to `localStorage`** when no backend is set —
so on GitHub Pages it works **per-device** out of the box (guests never save).

For **cross-device** saves you need a tiny backend (GitHub Pages can't run server code).
The free option is a **Cloudflare Worker** that hosts just the save API:

1. Tell me to add the Worker (I'll convert `functions/api/save.js` into a standalone Worker
   + `wrangler.toml`).
2. Deploy it free: `npx wrangler deploy` → you get `https://gotchi-saves.<you>.workers.dev`.
3. Create the KV store: `npx wrangler kv namespace create GOTCHI_KV` and bind it.
4. In `web/config.js` set `window.GOTCHI_API = "https://gotchi-saves.<you>.workers.dev";`
   and push. The frontend already calls `${GOTCHI_API}/api/save` with CORS handled.

## Local development
```sh
python -m http.server 8000 --directory web    # http://127.0.0.1:8000  (saves -> localStorage)
```

## Security note before any real value
Saves are keyed by wallet address and are **not signature-verified** in this demo, so anyone
who knows an address could overwrite its save. `$GOTCHI` has no real value, so this is fine
for now. Before attaching value, add wallet-signature auth: have the client `signMessage` a
nonce and verify the **Ed25519** signature in the backend (Cloudflare Workers' Web Crypto
supports Ed25519 natively — no extra dependency needed).
