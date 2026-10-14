FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium xvfb ffmpeg pulseaudio pulseaudio-utils fonts-noto-color-emoji fonts-noto-core fonts-liberation dbus ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY run.sh /run.sh
COPY lounge.mp3 /lounge.mp3
ENTRYPOINT ["/run.sh"]
