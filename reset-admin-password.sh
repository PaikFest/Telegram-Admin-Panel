#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/Telegram-AdminBot-Panel}"
COMMON_SH="${APP_DIR}/scripts/common.sh"

if [ ! -f "${COMMON_SH}" ]; then
  COMMON_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/common.sh"
fi

# shellcheck disable=SC1090
source "${COMMON_SH}"
init_ui

banner "Reset Admin Password"
require_root
ensure_app_dir
[ -f "${ENV_FILE}" ] || die ".env not found in ${APP_DIR}."

section "Preparing new credentials"
NEW_LOGIN="${1:-admin_$(generate_alnum 6)}"
NEW_PASSWORD="${2:-$(generate_alnum 20)}"

set_env_value "ADMIN_LOGIN" "${NEW_LOGIN}"
set_env_value "ADMIN_PASSWORD" "${NEW_PASSWORD}"
chmod 600 "${ENV_FILE}"
log_ok ".env updated with new admin credentials."

section "Applying credentials in backend"
if ! compose_up_services backend; then
  die "Failed to start backend container."
fi
wait_for_service_health "backend" 240

if compose exec -T backend node dist/tools/reset-admin-password.js "${NEW_LOGIN}" "${NEW_PASSWORD}" >/dev/null; then
  log_ok "Backend admin credentials updated."
else
  die "Failed to update admin credentials inside backend container."
fi

section "Final summary"
ADMIN_URL="$(build_admin_url)"
if [ -z "${ADMIN_URL}" ]; then
  ADMIN_URL="(unknown) - check APP_URL and ADMIN_BASE_PATH in .env"
fi

BOT_NAME="Unknown"
BOT_USER="unknown"
BOT_TOKEN_VALUE="$(get_env_value "BOT_TOKEN")"
if [ -n "${BOT_TOKEN_VALUE}" ]; then
  if validate_bot_token_safe "${BOT_TOKEN_VALUE}"; then
    BOT_NAME="${BOT_DISPLAY_NAME}"
    BOT_USER="${BOT_USERNAME}"
  fi
fi

SERVER_IP="$(detect_public_ip)"
if [ -z "${SERVER_IP}" ]; then
  SERVER_IP="unknown"
fi

write_credentials_file "${ADMIN_URL}" "${NEW_LOGIN}" "${NEW_PASSWORD}" "${BOT_NAME}" "${BOT_USER}" "${SERVER_IP}"
print_summary_block "${ADMIN_URL}" "${NEW_LOGIN}" "${NEW_PASSWORD}" "${CREDENTIALS_FILE}" "${BOT_NAME}" "${BOT_USER}" "${SERVER_IP}"

log_ok "Admin credentials reset completed."
