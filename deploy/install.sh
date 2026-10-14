#!/bin/sh
# Installs the systemd unit (expects app in /opt/luckychips and node in /opt/node).
sudo cp "$(dirname "$0")/luckychips.service" /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now luckychips
