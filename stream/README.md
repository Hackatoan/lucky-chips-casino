# 24/7 stream of the bot tables

`/stream` on the casino shows whichever bot table is "on air" (rotates every `STREAM_HOURS`, default 3, through `STREAM_GAMES`) with the coach panel. This container turns that page into an RTMP stream:
headless Chromium → virtual screen → ffmpeg (x264 + AAC) → Kick/Twitch/YouTube.

```bash
cp .env.example .env      # add RTMP_URL + STREAM_KEY (empty = 20 s test clip in ./out/test.mp4)
docker compose up -d --build
docker logs -f kick-stream
```

Server settings (casino): `STREAM_GAMES=blackjack,roulette,baccarat,holdem,craps,threecard,letitride,war,sicbo,wheel` and `STREAM_HOURS=3`.
Resources: ~2 CPU cores for 720p30 at 3 Mbps, ~1.2 GB RAM. For 1080p set `WIDTH=1920 HEIGHT=1080 VIDEO_BITRATE=6000k` (needs ~3 cores).
