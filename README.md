# Lucky Chips Casino

A play-money casino with 26 games, a built-in strategy coach, card-counting trainer, shared tables, and bots. No cash value, ever.

🔗 **Live:** [casino.hackatoa.com](https://casino.hackatoa.com)   ·   ☕ **Support:** [Buy Me a Coffee](https://buymeacoffee.com/hackatoa)

## Overview

Everyone gets 1,000 free chips a day (server clock only, so changing your device time does nothing). Every game explains *why* a move was right or wrong after each hand, and a rating system (Elo-style) grades your decisions. Play solo, in public lobbies, at private tables with friends, or as the banker.

## Features

- 26 games: blackjack (Hi-Lo HUD, index plays, side bets), roulette, baccarat, craps, video poker, three card poker, Let It Ride, Sic Bo, slots (7 themes) and more
- Coach tips, post-round reviews, per-decision skill ratings, Learn section with hand examples, card-counting trainer
- Public lobbies with queue, spectators, chat (filterable), sit-out; private tables with kick/ban, game switching, banker mode
- Provably fair shared tables (seed commitment + reveal, verified in-browser)
- Configurable house fee and per-game rule sets; house ledger and leaderboards
- Bot arena you can watch, multi-table watch view, demo mode with ghost chips
- Google, email/password, or username sign-in (Firebase Auth); installable PWA; portrait and landscape layouts

## Tech Stack

Node (zero npm dependencies) · `node:sqlite` · SSE · vanilla JS SPA · Firebase Auth

## Development

```bash
npm start            # http://localhost:3000
npm test             # quick suite
npm run test:sims    # long simulations
```

Copy `config/firebase.web.example.json` to `config/firebase.web.json` to enable Google / email sign-in. Without it, username accounts still work.

## Deployment

```bash
docker compose up -d --build
```

Or run `deploy/install.sh` on a systemd host. Data lives in `./data` (SQLite).

## Support

If this project is useful to you, consider supporting development:

☕ **[Buy Me a Coffee](https://buymeacoffee.com/hackatoa)**

---

Part of the **[Hackatoa](https://hackatoa.com)** ecosystem — self-hosted apps, browser games, and bots. · [All repositories »](https://github.com/Hackatoan)
