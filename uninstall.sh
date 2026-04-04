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

banner "Uninstaller"
require_root

section "Confirmation"
if [ "${CONFIRM_UNINSTALL:-}" = "YES" ]; then
  log_warn "CONFIRM_UNINSTALL=YES detected. Skipping prompt."
else
  if ! confirm_action "This will remove ${PRODUCT_NAME}, containers, and data volumes. Continue?"; then
    die "Uninstall cancelled."
  fi
fi

section "Stopping and removing services"
if [ -d "${APP_DIR}" ] && [ -f "${APP_DIR}/docker-compose.yml" ]; then
  if compose down -v --remove-orphans >/dev/null 2>&1; then
    log_ok "Containers and volumes removed."
  else
    log_warn "Failed to fully remove containers/volumes. Continuing cleanup."
  fi
else
  log_warn "Project directory not found. Skipping docker compose teardown."
fi

section "Removing files"
rm -rf "${APP_DIR}"
rm -f "${CREDENTIALS_FILE}"
log_ok "Application directory removed."
log_ok "Credentials file removed."

section "Done"
log_ok "${PRODUCT_NAME} was successfully uninstalled."
