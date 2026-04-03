#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f .env ]; then
  echo ".env not found in $SCRIPT_DIR"
  exit 1
fi

chmod +x scripts/wait-for-health.sh

docker compose up -d --build

bash scripts/wait-for-health.sh postgres 240
bash scripts/wait-for-health.sh backend 300
bash scripts/wait-for-health.sh frontend 300
bash scripts/wait-for-health.sh caddy 180

echo "Update finished"