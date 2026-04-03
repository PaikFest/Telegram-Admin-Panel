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

get_env_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" .env | head -n 1 | cut -d '=' -f2- || true)"
  printf '%s' "$value"
}

APP_URL_VALUE="$(get_env_value APP_URL)"
ADMIN_BASE_PATH_VALUE="$(get_env_value ADMIN_BASE_PATH)"
if [ -n "$ADMIN_BASE_PATH_VALUE" ] && [[ "$ADMIN_BASE_PATH_VALUE" != /* ]]; then
  ADMIN_BASE_PATH_VALUE="/${ADMIN_BASE_PATH_VALUE}"
fi

ADMIN_URL=""
if [ -n "$APP_URL_VALUE" ] && [ -n "$ADMIN_BASE_PATH_VALUE" ]; then
  ADMIN_URL="${APP_URL_VALUE}${ADMIN_BASE_PATH_VALUE}/login"
fi

chmod 600 .env

docker compose up -d backend
bash scripts/wait-for-health.sh backend 240

docker compose exec -T backend node dist/tools/reset-admin-password.js "$NEW_LOGIN" "$NEW_PASSWORD"

cat > /root/opener-bot-admin-credentials.txt <<EOF
Opener Bot Admin
Updated at: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Admin URL: ${ADMIN_URL}
Login: ${NEW_LOGIN}
Password: ${NEW_PASSWORD}
EOF
chmod 600 /root/opener-bot-admin-credentials.txt

echo "Admin credentials reset"
echo "Admin URL: ${ADMIN_URL}"
echo "Login: ${NEW_LOGIN}"
echo "Password: ${NEW_PASSWORD}"
echo "Credentials file: /root/opener-bot-admin-credentials.txt"
