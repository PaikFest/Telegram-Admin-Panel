#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root"
  exit 1
fi

APP_DIR="/opt/opener-bot-admin"

if [ ! -d "$APP_DIR" ]; then
  echo "$APP_DIR not found"
  exit 1
fi

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo ".env not found"
  exit 1
fi

NEW_LOGIN="${1:-admin_$(openssl rand -hex 3)}"
NEW_PASSWORD="${2:-$(openssl rand -base64 36 | tr -dc 'A-Za-z0-9' | head -c 20)}"

update_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

update_env "ADMIN_LOGIN" "$NEW_LOGIN"
update_env "ADMIN_PASSWORD" "$NEW_PASSWORD"

chmod 600 .env

docker compose up -d backend
bash scripts/wait-for-health.sh backend 240

docker compose exec -T backend node dist/tools/reset-admin-password.js "$NEW_LOGIN" "$NEW_PASSWORD"

cat > /root/opener-bot-admin-credentials.txt <<EOF
Opener Bot Admin
Updated at: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Login: ${NEW_LOGIN}
Password: ${NEW_PASSWORD}
EOF
chmod 600 /root/opener-bot-admin-credentials.txt

echo "Admin credentials reset"
echo "Login: ${NEW_LOGIN}"
echo "Password: ${NEW_PASSWORD}"
echo "Credentials file: /root/opener-bot-admin-credentials.txt"