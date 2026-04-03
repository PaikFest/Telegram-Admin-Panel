#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root"
  exit 1
fi

APP_DIR="/opt/Telegram-AdminBot-Panel"

if [ "${CONFIRM_UNINSTALL:-}" != "YES" ]; then
  read -r -p "Type DELETE to uninstall Opener Bot Admin: " CONFIRM
  if [ "$CONFIRM" != "DELETE" ]; then
    echo "Cancelled"
    exit 1
  fi
fi

if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
  docker compose down -v --remove-orphans || true
fi

rm -rf "$APP_DIR"
rm -f /root/opener-bot-admin-credentials.txt

echo "Opener Bot Admin uninstalled"
