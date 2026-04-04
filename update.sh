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

banner "Updater"
require_root
ensure_app_dir
start_process_timer

start_step 1 5 "Checking project state"
[ -d "${APP_DIR}/.git" ] || die "Git repository not found in ${APP_DIR}."
[ -f "${ENV_FILE}" ] || die ".env not found in ${APP_DIR}."

SKIP_GIT_PULL=0
if [ -n "$(git -C "${APP_DIR}" status --porcelain)" ]; then
  if [ "${ALLOW_DIRTY_UPDATE:-0}" != "1" ]; then
    die "Local changes detected. Commit/stash them first or set ALLOW_DIRTY_UPDATE=1."
  fi
  SKIP_GIT_PULL=1
  log_warn "Dirty working tree detected. Proceeding without git pull because ALLOW_DIRTY_UPDATE=1."
fi
finish_step_ok "Project state validated."

start_step 2 5 "Fetching updates"
if [ "${SKIP_GIT_PULL}" -eq 0 ]; then
  git -C "${APP_DIR}" fetch --all --prune
fi

if [ "${SKIP_GIT_PULL}" -eq 1 ]; then
  log_warn "Skipped git sync due to dirty tree override."
else
  CURRENT_BRANCH="$(git -C "${APP_DIR}" rev-parse --abbrev-ref HEAD)"
  REMOTE_REF="origin/${CURRENT_BRANCH}"
  if ! git -C "${APP_DIR}" rev-parse --verify "${REMOTE_REF}" >/dev/null 2>&1; then
    REMOTE_REF="origin/main"
  fi

  LOCAL_SHA="$(git -C "${APP_DIR}" rev-parse HEAD)"
  REMOTE_SHA="$(git -C "${APP_DIR}" rev-parse "${REMOTE_REF}")"

  if [ "${LOCAL_SHA}" = "${REMOTE_SHA}" ]; then
    log_info "Already up to date (${CURRENT_BRANCH})."
  else
    if git -C "${APP_DIR}" pull --ff-only; then
      log_ok "Repository updated."
    else
      die "Failed to pull updates (non fast-forward). Resolve git state manually."
    fi
  fi
fi
if [ "${SKIP_GIT_PULL}" -eq 1 ]; then
  finish_step_warn "Git sync skipped due to dirty tree override."
else
  finish_step_ok "Repository sync completed."
fi

start_step 3 5 "Ensuring environment completeness"
ensure_env_file
ensure_env_value "NODE_ENV" "production"

CURRENT_BASE_PATH="$(normalize_base_path "$(get_env_value "ADMIN_BASE_PATH")")"
CURRENT_PATH_TOKEN="$(get_env_value "ADMIN_PATH_TOKEN")"
CURRENT_PATH_UUID="$(get_env_value "ADMIN_PATH_UUID")"

if [ -n "${CURRENT_BASE_PATH}" ]; then
  PATH_BODY="${CURRENT_BASE_PATH#/}"
  CURRENT_PATH_TOKEN="${PATH_BODY%%/*}"
  CURRENT_PATH_UUID="${PATH_BODY#*/}"
fi

if [ -z "${CURRENT_PATH_TOKEN}" ] || is_placeholder_value "${CURRENT_PATH_TOKEN}"; then
  CURRENT_PATH_TOKEN="$(generate_alnum 16)"
fi
if [ -z "${CURRENT_PATH_UUID}" ] || is_placeholder_value "${CURRENT_PATH_UUID}"; then
  CURRENT_PATH_UUID="$(cat /proc/sys/kernel/random/uuid)"
fi

set_env_value "ADMIN_PATH_TOKEN" "${CURRENT_PATH_TOKEN}"
set_env_value "ADMIN_PATH_UUID" "${CURRENT_PATH_UUID}"
set_env_value "ADMIN_BASE_PATH" "/${CURRENT_PATH_TOKEN}/${CURRENT_PATH_UUID}"

POSTGRES_DB_VALUE="$(get_env_value "POSTGRES_DB")"
POSTGRES_USER_VALUE="$(get_env_value "POSTGRES_USER")"
POSTGRES_PASSWORD_VALUE="$(get_env_value "POSTGRES_PASSWORD")"
ensure_database_url_consistency

BOT_TOKEN_VALUE="$(get_env_value "BOT_TOKEN")"
if [ -z "${BOT_TOKEN_VALUE}" ]; then
  prompt_secret "Enter BOT_TOKEN: " BOT_TOKEN_VALUE
  [ -n "${BOT_TOKEN_VALUE}" ] || die "BOT_TOKEN is required."
  set_env_value "BOT_TOKEN" "${BOT_TOKEN_VALUE}"
fi

chmod 600 "${ENV_FILE}"
validate_bot_token "${BOT_TOKEN_VALUE}"
log_ok "Telegram bot token validated for @${BOT_USERNAME}."

DETECTED_IP="$(detect_public_ip)"
if [ -n "${DETECTED_IP}" ]; then
  ensure_app_url_consistency "${DETECTED_IP}"
fi
chmod 600 "${ENV_FILE}"
finish_step_ok "Environment is consistent."

start_step 4 5 "Rebuilding and restarting services"
log_info "This step may take several minutes."
run_step_command "Rebuilding and restarting services" compose_up_build || die "Failed to rebuild/restart services."
wait_for_service_health "postgres" 240
wait_for_service_health "backend" 300
wait_for_service_health "frontend" 300
wait_for_service_health "caddy" 180
finish_step_ok "Services restarted and healthy."

start_step 5 5 "Final summary"
ADMIN_URL="$(build_admin_url)"
if [ -z "${ADMIN_URL}" ]; then
  ADMIN_BASE_PATH_VALUE="$(normalize_base_path "$(get_env_value "ADMIN_BASE_PATH")")"
  APP_URL_VALUE="$(get_env_value "APP_URL")"
  ADMIN_URL="${APP_URL_VALUE}${ADMIN_BASE_PATH_VALUE}/login"
fi

ADMIN_LOGIN_VALUE="$(get_env_value "ADMIN_LOGIN")"
ADMIN_PASSWORD_VALUE="$(get_env_value "ADMIN_PASSWORD")"
SERVER_IP="$(detect_public_ip)"
if [ -z "${SERVER_IP}" ]; then
  SERVER_IP="unknown"
fi

TOTAL_DURATION="$(format_duration "$(get_total_elapsed_seconds)")"
write_credentials_file "${ADMIN_URL}" "${ADMIN_LOGIN_VALUE}" "${ADMIN_PASSWORD_VALUE}" "${BOT_DISPLAY_NAME}" "${BOT_USERNAME}" "${SERVER_IP}" "${TOTAL_DURATION}"
print_summary_block "${ADMIN_URL}" "${ADMIN_LOGIN_VALUE}" "${ADMIN_PASSWORD_VALUE}" "${CREDENTIALS_FILE}" "${BOT_DISPLAY_NAME}" "${BOT_USERNAME}" "${SERVER_IP}" "${TOTAL_DURATION}"
finish_step_ok "Summary generated."

log_ok "Update completed."
