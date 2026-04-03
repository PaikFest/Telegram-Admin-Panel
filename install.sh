#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root"
  exit 1
fi

APP_DIR="/opt/Telegram-AdminBot-Panel"
REPO_URL="${REPO_URL:-https://github.com/PaikFest/Telegram-Admin-Panel.git}"

if [ -z "${BOT_TOKEN:-}" ]; then
  read -r -p "Enter BOT_TOKEN: " BOT_TOKEN
fi

if [ -z "$BOT_TOKEN" ]; then
  echo "BOT_TOKEN is required"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git gnupg lsb-release openssl

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

apt-get install -y docker-compose-plugin
systemctl enable docker
systemctl start docker

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
chmod +x install.sh update.sh uninstall.sh reset-admin-password.sh scripts/wait-for-health.sh

POSTGRES_DB="opener_bot_admin"
POSTGRES_USER="opener"
POSTGRES_PASSWORD="$(openssl rand -base64 36 | tr -dc 'A-Za-z0-9' | head -c 24)"
SESSION_SECRET="$(openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c 48)"
ADMIN_LOGIN="admin_$(openssl rand -hex 3)"
ADMIN_PASSWORD="$(openssl rand -base64 36 | tr -dc 'A-Za-z0-9' | head -c 20)"
ADMIN_PATH_TOKEN="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 16)"
ADMIN_PATH_UUID="$(cat /proc/sys/kernel/random/uuid)"
ADMIN_BASE_PATH="/${ADMIN_PATH_TOKEN}/${ADMIN_PATH_UUID}"

PUBLIC_IP="$(curl -fsSL https://api.ipify.org || true)"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(hostname -I | awk '{print $1}')"
fi

if [ -z "$PUBLIC_IP" ]; then
  echo "Failed to detect public IP"
  exit 1
fi

APP_URL="http://${PUBLIC_IP}"
ADMIN_URL="${APP_URL}${ADMIN_BASE_PATH}/login"
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public"

cat > .env <<EOF
BOT_TOKEN=${BOT_TOKEN}
DATABASE_URL=${DATABASE_URL}
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
ADMIN_LOGIN=${ADMIN_LOGIN}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_PATH_TOKEN=${ADMIN_PATH_TOKEN}
ADMIN_PATH_UUID=${ADMIN_PATH_UUID}
ADMIN_BASE_PATH=${ADMIN_BASE_PATH}
APP_URL=${APP_URL}
NODE_ENV=production
EOF

chmod 600 .env

docker compose down --remove-orphans >/dev/null 2>&1 || true
docker compose up -d --build

bash scripts/wait-for-health.sh postgres 240
bash scripts/wait-for-health.sh backend 300
bash scripts/wait-for-health.sh frontend 300
bash scripts/wait-for-health.sh caddy 180

cat > /root/opener-bot-admin-credentials.txt <<EOF
Opener Bot Admin
Installed at: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
IP: ${PUBLIC_IP}
Admin URL: ${ADMIN_URL}
Login: ${ADMIN_LOGIN}
Password: ${ADMIN_PASSWORD}
EOF
chmod 600 /root/opener-bot-admin-credentials.txt

echo ""
echo "Opener Bot Admin installed successfully"
echo "Admin URL: ${ADMIN_URL}"
echo "Login: ${ADMIN_LOGIN}"
echo "Password: ${ADMIN_PASSWORD}"
echo "Credentials file: /root/opener-bot-admin-credentials.txt"
