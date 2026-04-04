#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/Telegram-AdminBot-Panel}"
REPO_URL="${REPO_URL:-https://github.com/PaikFest/Telegram-Admin-Panel.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

BOOT_COLOR_INFO='\033[36m'
BOOT_COLOR_OK='\033[32m'
BOOT_COLOR_WARN='\033[33m'
BOOT_COLOR_ERR='\033[31m'
BOOT_COLOR_TITLE='\033[1;34m'
BOOT_COLOR_RESET='\033[0m'
INSTALL_TOTAL_START_TS="$(date +%s)"
INSTALL_TOTAL_STEPS=7

boot_log() {
  local color="$1"
  local level="$2"
  shift 2
  printf '%b[%s] %s%b\n' "${color}" "${level}" "$*" "${BOOT_COLOR_RESET}"
}

boot_info() { boot_log "${BOOT_COLOR_INFO}" "INFO" "$@"; }
boot_ok() { boot_log "${BOOT_COLOR_OK}" "OK" "$@"; }
boot_warn() { boot_log "${BOOT_COLOR_WARN}" "WARN" "$@"; }
boot_error() { boot_log "${BOOT_COLOR_ERR}" "ERROR" "$@"; }

boot_die() {
  boot_error "$@"
  exit 1
}

require_root() {
  if [ "${EUID}" -ne 0 ]; then
    boot_die "Run this script as root."
  fi
}

boot_section() {
  echo
  printf '%b==> %s%b\n' "${BOOT_COLOR_TITLE}" "$1" "${BOOT_COLOR_RESET}"
}

boot_banner() {
  echo
  printf '%b%s%b\n' "${BOOT_COLOR_TITLE}" "Telegram Bot Admin Panel" "${BOOT_COLOR_RESET}"
  printf '%b%s%b\n' "${BOOT_COLOR_INFO}" "Production installer" "${BOOT_COLOR_RESET}"
  echo
}

boot_format_duration() {
  local total="${1:-0}"
  local hours minutes seconds
  hours=$((total / 3600))
  minutes=$(((total % 3600) / 60))
  seconds=$((total % 60))
  printf '%02d:%02d:%02d' "${hours}" "${minutes}" "${seconds}"
}

boot_render_progress_bar() {
  local current="$1"
  local total="$2"
  local width=12
  local filled empty i bar

  if [ "${total}" -le 0 ]; then
    total=1
  fi

  filled=$((current * width / total))
  empty=$((width - filled))
  bar="["
  for ((i = 0; i < filled; i++)); do
    bar+="#"
  done
  for ((i = 0; i < empty; i++)); do
    bar+="."
  done
  bar+="]"
  printf '%s' "${bar}"
}

boot_start_step() {
  local current="$1"
  local total="$2"
  local title="$3"
  local elapsed
  elapsed="$(( $(date +%s) - INSTALL_TOTAL_START_TS ))"

  echo
  printf '%b==> Step %s/%s: %s%b\n' "${BOOT_COLOR_TITLE}" "${current}" "${total}" "${title}" "${BOOT_COLOR_RESET}"
  boot_info "$(boot_render_progress_bar "${current}" "${total}") Step ${current}/${total} - ${title}"
  boot_info "Elapsed step: 00:00:00 | Total: $(boot_format_duration "${elapsed}")"
}

boot_finish_step_ok() {
  local message="$1"
  local step_start_ts="$2"
  local step_elapsed total_elapsed
  step_elapsed="$(( $(date +%s) - step_start_ts ))"
  total_elapsed="$(( $(date +%s) - INSTALL_TOTAL_START_TS ))"
  boot_ok "${message}"
  boot_info "Elapsed step: $(boot_format_duration "${step_elapsed}") | Total: $(boot_format_duration "${total_elapsed}")"
}

require_supported_os() {
  if [ ! -f /etc/os-release ]; then
    boot_die "Cannot detect OS. /etc/os-release not found."
  fi

  # shellcheck disable=SC1091
  source /etc/os-release
  if [ "${ID:-}" != "ubuntu" ]; then
    boot_die "Unsupported OS: ${ID:-unknown}. Use Ubuntu 22.04 or 24.04."
  fi

  case "${VERSION_ID:-}" in
    22.04|24.04) ;;
    *)
      boot_die "Unsupported Ubuntu version: ${VERSION_ID:-unknown}. Use 22.04 or 24.04."
      ;;
  esac
}

install_system_deps() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y >/dev/null 2>&1 || boot_die "Failed to run apt-get update."
  apt-get install -y ca-certificates curl git gnupg lsb-release openssl python3 >/dev/null 2>&1 || boot_die "Failed to install required system packages."
}

install_docker_if_needed() {
  if ! command -v docker >/dev/null 2>&1; then
    boot_info "Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com | sh >/dev/null 2>&1 || boot_die "Failed to install Docker."
    boot_ok "Docker installed."
  else
    boot_ok "Docker already installed."
  fi

  apt-get install -y docker-compose-plugin >/dev/null 2>&1 || boot_die "Failed to install docker compose plugin."
  systemctl enable docker >/dev/null 2>&1 || true
  systemctl start docker >/dev/null 2>&1 || true
}

sync_repository() {
  if [ -d "${APP_DIR}/.git" ]; then
    if [ -n "$(git -C "${APP_DIR}" status --porcelain)" ]; then
      if [ "${ALLOW_DIRTY_INSTALL:-0}" != "1" ]; then
        boot_die "Local changes detected in ${APP_DIR}. Refusing to continue on dirty tree by default. Set ALLOW_DIRTY_INSTALL=1 to continue without git pull."
      else
        boot_warn "ALLOW_DIRTY_INSTALL=1 set. Running install with existing dirty tree (git pull skipped)."
      fi
      return 0
    fi

    git -C "${APP_DIR}" fetch --all --prune
    if ! git -C "${APP_DIR}" pull --ff-only; then
      boot_die "Failed to update repository (non fast-forward). Resolve git state manually."
    fi
    boot_ok "Repository updated."
    return 0
  fi

  if [ -d "${APP_DIR}" ]; then
    if [ "${FORCE_REINSTALL:-0}" = "1" ]; then
      rm -rf "${APP_DIR}"
    else
      boot_die "${APP_DIR} exists but is not a git repository. Set FORCE_REINSTALL=1 to replace it."
    fi
  fi

  git clone --branch "${REPO_BRANCH}" --single-branch "${REPO_URL}" "${APP_DIR}"
  boot_ok "Repository cloned."
}

boot_banner
require_root

STEP_TS="$(date +%s)"
boot_start_step 1 "${INSTALL_TOTAL_STEPS}" "Checking system"
require_supported_os
boot_finish_step_ok "System check passed." "${STEP_TS}"

STEP_TS="$(date +%s)"
boot_start_step 2 "${INSTALL_TOTAL_STEPS}" "Installing dependencies"
install_system_deps
install_docker_if_needed
boot_finish_step_ok "Dependencies are ready." "${STEP_TS}"

STEP_TS="$(date +%s)"
boot_start_step 3 "${INSTALL_TOTAL_STEPS}" "Cloning/updating repository"
EXISTING_ENV=0
if [ -f "${APP_DIR}/.env" ]; then
  EXISTING_ENV=1
fi
sync_repository
boot_finish_step_ok "Repository is ready." "${STEP_TS}"

chmod +x "${APP_DIR}/install.sh" "${APP_DIR}/update.sh" "${APP_DIR}/uninstall.sh" \
  "${APP_DIR}/reset-admin-password.sh" "${APP_DIR}/scripts/wait-for-health.sh" || true

# shellcheck disable=SC1090
source "${APP_DIR}/scripts/common.sh"
init_ui
maybe_install_gum
set_process_start_ts "${INSTALL_TOTAL_START_TS}"

INSTALL_MODE="fresh install"
if [ "${EXISTING_ENV}" -eq 1 ]; then
  INSTALL_MODE="update existing install"
fi
banner "Installer (${INSTALL_MODE})"

start_step 4 "${INSTALL_TOTAL_STEPS}" "Preparing environment"
ensure_env_file

BOT_TOKEN_INPUT="${BOT_TOKEN:-}"
if [ -z "${BOT_TOKEN_INPUT}" ]; then
  BOT_TOKEN_INPUT="$(get_env_value "BOT_TOKEN")"
fi

if [ -z "${BOT_TOKEN_INPUT}" ]; then
  prompt_secret "Enter BOT_TOKEN: " BOT_TOKEN_INPUT
fi

[ -n "${BOT_TOKEN_INPUT}" ] || die "BOT_TOKEN is required and cannot be empty."

section "Validating Telegram bot token"
validate_bot_token "${BOT_TOKEN_INPUT}"
log_ok "Telegram bot token is valid."
log_info "Bot: ${BOT_DISPLAY_NAME} (@${BOT_USERNAME})"

POSTGRES_DB_DEFAULT="opener_bot_admin"
POSTGRES_USER_DEFAULT="opener"

ensure_env_value "POSTGRES_DB" "${POSTGRES_DB_DEFAULT}"
ensure_env_value "POSTGRES_USER" "${POSTGRES_USER_DEFAULT}"
ensure_env_value_real "POSTGRES_PASSWORD" "$(generate_alnum 24)"
ensure_env_value_real "SESSION_SECRET" "$(generate_alnum 48)"
ensure_env_value_real "ADMIN_LOGIN" "admin_$(generate_alnum 6)"
ensure_env_value_real "ADMIN_PASSWORD" "$(generate_alnum 20)"
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

CURRENT_BASE_PATH="/${CURRENT_PATH_TOKEN}/${CURRENT_PATH_UUID}"

set_env_value "BOT_TOKEN" "${BOT_TOKEN_INPUT}"
set_env_value "ADMIN_PATH_TOKEN" "${CURRENT_PATH_TOKEN}"
set_env_value "ADMIN_PATH_UUID" "${CURRENT_PATH_UUID}"
set_env_value "ADMIN_BASE_PATH" "${CURRENT_BASE_PATH}"

DETECTED_IP="$(detect_public_ip)"
if [ -z "${DETECTED_IP}" ]; then
  DETECTED_IP="127.0.0.1"
  log_warn "Public IP detection failed. Using ${DETECTED_IP} for APP_URL."
fi

ensure_app_url_consistency "${DETECTED_IP}"
ensure_env_value "APP_URL" "http://${DETECTED_IP}"

POSTGRES_DB_VALUE="$(get_env_value "POSTGRES_DB")"
POSTGRES_USER_VALUE="$(get_env_value "POSTGRES_USER")"
POSTGRES_PASSWORD_VALUE="$(get_env_value "POSTGRES_PASSWORD")"
ensure_env_value "DATABASE_URL" "postgresql://${POSTGRES_USER_VALUE}:${POSTGRES_PASSWORD_VALUE}@postgres:5432/${POSTGRES_DB_VALUE}?schema=public"

chmod 600 "${ENV_FILE}"
finish_step_ok ".env prepared."

start_step 5 "${INSTALL_TOTAL_STEPS}" "Building containers"
log_info "This step may take several minutes."
run_step_command "Building and starting containers" compose_up_build || die "Failed to start containers. Check docker logs."
finish_step_ok "Containers built and started."

start_step 6 "${INSTALL_TOTAL_STEPS}" "Waiting for health checks"
wait_for_service_health "postgres" 240
wait_for_service_health "backend" 300
wait_for_service_health "frontend" 300
wait_for_service_health "caddy" 180
finish_step_ok "All services are healthy."

start_step 7 "${INSTALL_TOTAL_STEPS}" "Final summary"
ADMIN_URL="$(build_admin_url)"
if [ -z "${ADMIN_URL}" ]; then
  ADMIN_URL="http://${DETECTED_IP}${CURRENT_BASE_PATH}/login"
fi

ADMIN_LOGIN_VALUE="$(get_env_value "ADMIN_LOGIN")"
ADMIN_PASSWORD_VALUE="$(get_env_value "ADMIN_PASSWORD")"
APP_URL_VALUE="$(get_env_value "APP_URL")"
IP_VALUE="${DETECTED_IP}"
if [ -n "${APP_URL_VALUE}" ] && [[ "${APP_URL_VALUE}" == http*://* ]]; then
  IP_VALUE="${APP_URL_VALUE#*://}"
fi

TOTAL_DURATION="$(format_duration "$(get_total_elapsed_seconds)")"
write_credentials_file "${ADMIN_URL}" "${ADMIN_LOGIN_VALUE}" "${ADMIN_PASSWORD_VALUE}" "${BOT_DISPLAY_NAME}" "${BOT_USERNAME}" "${IP_VALUE}" "${TOTAL_DURATION}"
print_summary_block "${ADMIN_URL}" "${ADMIN_LOGIN_VALUE}" "${ADMIN_PASSWORD_VALUE}" "${CREDENTIALS_FILE}" "${BOT_DISPLAY_NAME}" "${BOT_USERNAME}" "${IP_VALUE}" "${TOTAL_DURATION}"
finish_step_ok "Summary generated."

log_ok "Installation completed."
