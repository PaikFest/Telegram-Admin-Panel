#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root"
  exit 1
fi

APP_DIR="/opt/Telegram-AdminBot-Panel"

if [ ! -d "$APP_DIR" ]; then
  echo "$APP_DIR not found"
  exit 1
fi

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo ".env not found in $APP_DIR"
  exit 1
fi

chmod +x scripts/wait-for-health.sh

docker compose up -d --build

bash scripts/wait-for-health.sh postgres 240
bash scripts/wait-for-health.sh backend 300
bash scripts/wait-for-health.sh frontend 300
bash scripts/wait-for-health.sh caddy 180

echo "Update finished"
