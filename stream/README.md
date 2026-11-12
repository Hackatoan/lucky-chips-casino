# 24/7 stream of the bot tables

`/stream` on the casino shows whichever bot table is "on air" (rotates every `STREAM_HOURS`, default 3, through `STREAM_GAMES`) with the coach panel. This container turns that page into an RTMP stream:
headless Chromium → virtual screen → ffmpeg (x264 + AAC) → Kick/Twitch/YouTube.

```bash
cp .env.example .env      # add RTMP_URL + STREAM_KEY (empty = 20 s test clip in ./out/test.mp4)
docker compose up -d --build
docker logs -f kick-stream
```

Server settings (casino): `STREAM_GAMES=blackjack,roulette,baccarat,holdem,craps,threecard,letitride,war,sicbo,wheel` and `STREAM_HOURS=3`.
Resources: ~1.5 CPU cores for 720p60 at 4.5 Mbps, ~1.2 GB RAM. For 1080p set `WIDTH=1920 HEIGHT=1080 VIDEO_BITRATE=6000k` (needs ~3 cores).

## Kick chat bot, alerts and viewer picks

The casino server runs the chat side (`lib/kick.js`), so it works with any streaming box:

- `!game <name>` switches the on-air table (anyone; one switch per `KICK_SWITCH_COOLDOWN_MIN`, default 10; mods skip the cooldown). The pick stays on for `KICK_OVERRIDE_MIN` (60), then the rotation resumes. Tables with real players still take priority.
- `!games`, `!play` (casino link), `!music` (credit), `!help`. The link is also posted every `KICK_LINK_MIN` (20).
- Follows, subs, resubs, gifted subs and Kicks pop up as alerts on the scene (via `/api/stream/events`) and get a thank-you in chat.

Setup (once): create an app at kick.com/settings/developer with redirect URL `https://casino.hackatoa.com/api/kick/callback`, webhook URL `https://casino.hackatoa.com/api/kick/webhook`, webhooks enabled and scopes `user:read channel:read chat:write events:subscribe`. Put `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET` and `KICK_CHANNEL` in `/opt/luckychips/data/kick.env`, `sudo systemctl restart luckychips`, then open `https://casino.hackatoa.com/api/kick/connect` signed in to Kick as the channel. `/api/kick/status` shows whether it's connected.
