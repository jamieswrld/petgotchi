<img src="https://raw.githubusercontent.com/YarikHrabovets/tamagotchi/main/samples/baner.png"/>

![](https://api.visitorbadge.io/api/VisitorHit?user=YarikHrabovetsf&repo=tamagotchi&countColor=%237B1E7A)
[![License](https://img.shields.io/badge/License-Apache_2.0-green.svg)](https://github.com/YarikHrabovets/simple-weather-app/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)
[![Open Source Love svg1](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/ellerbrock/open-source-badges/)
[![made-with-python](https://img.shields.io/badge/Made%20with-Python-1f425f.svg)](https://www.python.org/)

# Gotchi
**Gotchi** — a play-to-earn digital pet. Raise your Gotchi and earn **$GOTCHI**.
There are two builds in this repo: a desktop game (Python/pygame) and a web app
(`web/`, the version served at the domain).
> The Tamagotchi is a handheld digital pet that was created in Japan by Akihiro Yokoi of WiZ and Aki Maita of Bandai. It was released by Bandai on November 23, 1996 in Japan and in the USA on May 1, 1997, quickly becoming one of the biggest toy fads of the late 1990s and the early 2000s.

## Some screenshots
<p align="center">
 <img src="https://raw.githubusercontent.com/YarikHrabovets/tamagotchi/main/samples/preview1.png" width="80%" />
</p>
<p align="center">
 <img src="https://raw.githubusercontent.com/YarikHrabovets/tamagotchi/main/samples/preview2.png" width="80%" />
</p>
<p align="center">
 <img src="https://raw.githubusercontent.com/YarikHrabovets/tamagotchi/main/samples/preview3.png" width="80%" />
</p>

## $Gotchi — Play-to-Earn (demo)
This build adds a **$Gotchi** play-to-earn layer on top of the classic pet game.

> ⚠️ **Demo only.** `$Gotchi` tokens live in a local save file (`gotchi_save.json`) and a
> mock wallet address. They have **no real-world value** and there is **no blockchain**
> involved. A production version would swap the mock wallet for a real web frontend
> (e.g. WalletConnect / wagmi).

How it works:
  * **Connect Wallet** — from the main menu or the in-game `Wallet` button, generate a
    demo wallet address.
  * **Earn** — caring for your Gotchi grants XP and accrues `$Gotchi`:
    * Catch coins in the mini-game: `+5 $Gotchi` each
    * Feed / clean / heal / survive a day: XP toward your level (`100 XP = +1 Level`)
  * **Claim at milestone levels** — reaching a level unlocks a reward you can claim into
    your wallet balance:

    | Level | Reward |
    |-------|--------|
    | 2     | 100    |
    | 5     | 250    |
    | 10    | 500    |
    | 25    | 1000   |

  * **How to Earn** — the main menu has a full P2E explainer page.

## General Dependenices
  * Python([pygame](https://github.com/pygame/pygame))

## Usage — desktop (pygame)
  * Clone the repo, and then
  ```sh
  $ cd tamagotchi
  $ pip install -r requirements.txt
  $ python main.py
  ```

## Usage — web app (`web/`)
The web app is fully static — no build step. Serve the `web/` folder and open it:
  ```sh
  $ python -m http.server 8000 --directory web
  # then open http://127.0.0.1:8000/
  ```
Entry screen: **Connect Wallet** (Solana — Phantom / Solflare / Backpack; progress saved
per address) or **Play as Guest** (free to play, nothing is saved).

Saves fall back to `localStorage` (per-device) when no backend is configured. For
cross-device saves, point `web/config.js` (`window.GOTCHI_API`) at a backend — an optional
Cloudflare Worker built from `functions/api/save.js` + Workers KV. Deploy to
**GitHub Pages** at `petgotchi.xyz` per [DEPLOY.md](DEPLOY.md).

# Have fun!
