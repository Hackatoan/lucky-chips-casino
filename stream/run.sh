#!/bin/bash
# 24/7 broadcast of the casino's bot tables: headless Chromium on a virtual screen -> ffmpeg -> RTMP (Kick, Twitch, YouTube…).
# The page itself (/stream) rotates through the games, so nothing here needs to know the schedule.
set -u
W=${WIDTH:-1280}; H=${HEIGHT:-720}; FPS=${FPS:-30}
VB=${VIDEO_BITRATE:-3000k}; AB=${AUDIO_BITRATE:-96k}
URL=${STREAM_URL:-https://casino.hackatoa.com/stream}
RESTART_HOURS=${RESTART_HOURS:-12}            # exit (and let docker restart us) now and then so a leaky browser never gets old
export DISPLAY=:${DISPLAY_NUM:-99}

Xvfb :${DISPLAY_NUM:-99} -screen 0 ${W}x${H}x24 -nolisten tcp >/dev/null 2>&1 &
sleep 1
AUDIO_IN=(); AUDIO_OUT=(-an)
if [ "${AUDIO:-1}" = "1" ]; then
  pulseaudio --start --exit-idle-time=-1 --daemonize=yes >/dev/null 2>&1
  pactl load-module module-null-sink sink_name=stream sink_properties=device.description=stream >/dev/null 2>&1
  pactl set-default-sink stream >/dev/null 2>&1
  AUDIO_IN=(-f pulse -i stream.monitor)
  # mix: game sounds (input 1) + original lounge music loop (input 2). The music sits ~12 dB under, ducks a little while a sound plays, and a
  # shared compressor + limiter + loudness normaliser keeps the whole thing at an even level (about -16 LUFS, what Kick/Twitch expect).
  if [ "${MUSIC:-1}" = "1" ] && [ -f /lounge.mp3 ]; then
    AUDIO_IN+=(-stream_loop -1 -i /lounge.mp3)
    FILTER="[1:a]aresample=44100,volume=${SFX_VOLUME:-1.0},asplit=2[sfx][sfxkey];[2:a]aresample=44100,volume=${MUSIC_VOLUME:-0.55}[mus];[mus][sfxkey]sidechaincompress=threshold=0.04:ratio=3:attack=30:release=600[musd];[sfx][musd]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,acompressor=threshold=-20dB:ratio=3:attack=15:release=250,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=44100[aout]"
    AUDIO_OUT=(-filter_complex "$FILTER" -map 0:v -map "[aout]" -c:a aac -b:a "$AB" -ac 2)
  else
    AUDIO_OUT=(-map 0:v -map 1:a -af "acompressor=threshold=-20dB:ratio=3,loudnorm=I=-16:TP=-1.5:LRA=7" -c:a aac -b:a "$AB" -ar 44100 -ac 2)
  fi
fi

unset WAYLAND_DISPLAY XDG_SESSION_TYPE
chromium --no-sandbox --disable-dev-shm-usage --ozone-platform=x11 --disable-gpu --kiosk --app="$URL" --window-size=$W,$H --window-position=0,0 \
  --autoplay-policy=no-user-gesture-required --user-data-dir=/tmp/chrome --no-first-run --disable-infobars \
  --disable-features=Translate,MediaRouter --hide-scrollbars --force-device-scale-factor=1 --noerrdialogs >/dev/null 2>&1 &
CHROME=$!
sleep "${WARMUP:-15}"

# no RTMP target configured -> record a short test clip instead (dry run), so the pipeline can be checked without a stream key
if [ -z "${RTMP_URL:-}" ] || [ -z "${STREAM_KEY:-}" ]; then
  mkdir -p "${OUT_DIR:-/out}"
  echo "[stream] no RTMP_URL/STREAM_KEY set: recording a ${TEST_SECONDS:-20}s test clip to ${OUT_DIR:-/out}/test.mp4"
  ffmpeg -hide_banner -loglevel warning -y -f x11grab -draw_mouse 0 -framerate "$FPS" -video_size ${W}x${H} -i :${DISPLAY_NUM:-99} "${AUDIO_IN[@]}" "${AUDIO_OUT[@]}" \
    -c:v libx264 -preset veryfast -pix_fmt yuv420p -t "${TEST_SECONDS:-20}" ${OUT_DIR:-/out}/test.mp4
  ffmpeg -hide_banner -loglevel error -y -ss 5 -i ${OUT_DIR:-/out}/test.mp4 -frames:v 1 ${OUT_DIR:-/out}/test.png 2>/dev/null
  kill $CHROME 2>/dev/null
  echo "[stream] test clip is in ${OUT_DIR:-/out}. Put RTMP_URL + STREAM_KEY in .env and run: docker compose up -d --force-recreate"
  exec sleep infinity
fi

OUT="${RTMP_URL%/}/${STREAM_KEY}"
END=$(( $(date +%s) + RESTART_HOURS * 3600 ))
BUF=$(( ${VB%k} * 2 ))k
while [ "$(date +%s)" -lt "$END" ]; do
  kill -0 $CHROME 2>/dev/null || { echo "[stream] browser died, exiting"; exit 1; }
  ffmpeg -hide_banner -loglevel warning -f x11grab -draw_mouse 0 -framerate "$FPS" -video_size ${W}x${H} -i :${DISPLAY_NUM:-99} "${AUDIO_IN[@]}" "${AUDIO_OUT[@]}" \
    -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p -b:v "$VB" -maxrate "$VB" -bufsize "$BUF" -g $((FPS * 2)) -keyint_min $((FPS * 2)) \
    -f flv "$OUT"
  echo "[stream] ffmpeg stopped ($?), retrying in 5s"; sleep 5
done
kill $CHROME 2>/dev/null; exit 0
