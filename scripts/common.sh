#!/usr/bin/env bash

if [ "${TGAP_COMMON_SH_LOADED:-0}" = "1" ]; then
  return 0 2>/dev/null || true
fi
TGAP_COMMON_SH_LOADED=1

APP_DIR="${APP_DIR:-/opt/Telegram-AdminBot-Panel}"
PRODUCT_NAME="Telegram Bot Admin Panel"
CREDENTIALS_FILE="/root/opener-bot-admin-credentials.txt"
ENV_FILE="${APP_DIR}/.env"
BOT_DISPLAY_NAME="Unknown"
BOT_USERNAME="unknown"
USE_GUM=0
PROCESS_START_TS="${PROCESS_START_TS:-0}"
STEP_START_TS="${STEP_START_TS:-0}"
STEP_CURRENT="${STEP_CURRENT:-0}"
STEP_TOTAL="${STEP_TOTAL:-0}"
STEP_TITLE="${STEP_TITLE:-}"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

init_ui() {
  if command_exists gum; then
    USE_GUM=1
  else
    USE_GUM=0
  fi
}

_print_colored() {
  local color="$1"
  local text="$2"
  printf '\033[%sm%s\033[0m\n' "${color}" "${text}"
}

log_info() {
  if [ "${USE_GUM}" -eq 1 ]; then
    gum style --foreground 45 --bold "[INFO] " --inline
    echo "$*"
  else
    _print_colored "36" "[INFO] $*"
  fi
}

log_ok() {
  if [ "${USE_GUM}" -eq 1 ]; then
    gum style --foreground 42 --bold "[OK] " --inline
    echo "$*"
  else
    _print_colored "32" "[OK] $*"
  fi
}

log_warn() {
  if [ "${USE_GUM}" -eq 1 ]; then
    gum style --foreground 214 --bold "[WARN] " --inline
    echo "$*"
  else
    _print_colored "33" "[WARN] $*"
  fi
}

log_error() {
  if [ "${USE_GUM}" -eq 1 ]; then
    gum style --foreground 196 --bold "[ERROR] " --inline
    echo "$*"
  else
    _print_colored "31" "[ERROR] $*"
  fi
}

section() {
  local title="$1"
  echo
  if [ "${USE_GUM}" -eq 1 ]; then
    gum style --foreground 39 --bold "==> ${title}"
  else
    _print_colored "1;34" "==> ${title}"
  fi
}

banner() {
  local subtitle="${1:-Installer}"
  if [ "${USE_GUM}" -eq 1 ]; then
    echo
    gum style --border rounded --padding "1 2" --border-foreground 45 --foreground 252 --bold \
      "${PRODUCT_NAME}" \
      "${subtitle}"
    echo
  else
    echo
    _print_colored "1;36" "${PRODUCT_NAME}"
    _print_colored "2;37" "${subtitle}"
    echo
  fi
}

format_duration() {
  local total="${1:-0}"
  if ! [[ "${total}" =~ ^[0-9]+$ ]]; then
    total=0
  fi
  local hours minutes seconds
  hours=$((total / 3600))
  minutes=$(((total % 3600) / 60))
  seconds=$((total % 60))
  printf '%02d:%02d:%02d' "${hours}" "${minutes}" "${seconds}"
}

render_progress_bar() {
  local current="${1:-0}"
  local total="${2:-1}"
  local width="${3:-12}"

  if [ "${total}" -le 0 ]; then
    total=1
  fi
  if [ "${current}" -lt 0 ]; then
    current=0
  fi
  if [ "${current}" -gt "${total}" ]; then
    current="${total}"
  fi

  local filled empty i bar
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

start_process_timer() {
  PROCESS_START_TS="$(date +%s)"
}

set_process_start_ts() {
  local ts="${1:-}"
  if [ -n "${ts}" ] && [[ "${ts}" =~ ^[0-9]+$ ]]; then
    PROCESS_START_TS="${ts}"
    return 0
  fi
  start_process_timer
}

get_total_elapsed_seconds() {
  if [ "${PROCESS_START_TS}" -le 0 ]; then
    printf '%s' "0"
    return 0
  fi
  printf '%s' "$(( $(date +%s) - PROCESS_START_TS ))"
}

get_step_elapsed_seconds() {
  if [ "${STEP_START_TS}" -le 0 ]; then
    printf '%s' "0"
    return 0
  fi
  printf '%s' "$(( $(date +%s) - STEP_START_TS ))"
}

start_step() {
  local current="$1"
  local total="$2"
  local title="$3"

  if [ "${PROCESS_START_TS}" -le 0 ]; then
    start_process_timer
  fi

  STEP_CURRENT="${current}"
  STEP_TOTAL="${total}"
  STEP_TITLE="${title}"
  STEP_START_TS="$(date +%s)"

  section "Step ${current}/${total}: ${title}"
  log_info "$(render_progress_bar "${current}" "${total}") Step ${current}/${total} - ${title}"
  log_info "Elapsed step: 00:00:00 | Total: $(format_duration "$(get_total_elapsed_seconds)")"
}

_finish_step() {
  local level="$1"
  local message="$2"
  local step_elapsed total_elapsed
  step_elapsed="$(format_duration "$(get_step_elapsed_seconds)")"
  total_elapsed="$(format_duration "$(get_total_elapsed_seconds)")"

  case "${level}" in
    ok) log_ok "${message}" ;;
    warn) log_warn "${message}" ;;
    error) log_error "${message}" ;;
    *) log_info "${message}" ;;
  esac

  log_info "Elapsed step: ${step_elapsed} | Total: ${total_elapsed}"
}

finish_step_ok() {
  _finish_step "ok" "$1"
}

finish_step_warn() {
  _finish_step "warn" "$1"
}

finish_step_error() {
  _finish_step "error" "$1"
}

run_step_command() {
  local title="$1"
  shift

  local tmp_log cmd_pid rc spinner_idx spinner_char step_elapsed total_elapsed
  tmp_log="$(mktemp)"
  spinner_idx=0

  ("$@") >"${tmp_log}" 2>&1 &
  cmd_pid=$!

  while kill -0 "${cmd_pid}" 2>/dev/null; do
    spinner_char='|'
    case $((spinner_idx % 4)) in
      0) spinner_char='|' ;;
      1) spinner_char='/' ;;
      2) spinner_char='-' ;;
      3) spinner_char='\\' ;;
    esac
    spinner_idx=$((spinner_idx + 1))
    step_elapsed="$(format_duration "$(get_step_elapsed_seconds)")"
    total_elapsed="$(format_duration "$(get_total_elapsed_seconds)")"
    printf '\r[%s] %s | Elapsed step: %s | Total: %s' "${spinner_char}" "${title}" "${step_elapsed}" "${total_elapsed}"
    sleep 0.2
  done

  wait "${cmd_pid}" || rc=$?
  rc="${rc:-0}"

  printf '\r'
  printf '%*s\r' 160 ''

  if [ "${rc}" -ne 0 ]; then
    log_error "${title} failed."
    if [ -s "${tmp_log}" ]; then
      log_info "Last 120 lines:"
      tail -n 120 "${tmp_log}" || true
    fi
    rm -f "${tmp_log}"
    return "${rc}"
  fi

  rm -f "${tmp_log}"
  return 0
}

die() {
  log_error "$*"
  exit 1
}

require_root() {
  if [ "${EUID}" -ne 0 ]; then
    die "Run this script as root."
  fi
}

maybe_install_gum() {
  if command_exists gum; then
    return 0
  fi

  if [ "${INSTALL_GUM:-0}" != "1" ]; then
    return 0
  fi

  if ! command_exists apt-get; then
    return 0
  fi

  if apt-cache show gum >/dev/null 2>&1; then
    if apt-get install -y gum >/dev/null 2>&1; then
      USE_GUM=1
      log_ok "gum installed."
    else
      log_warn "Failed to install gum. Continuing with plain terminal output."
    fi
  else
    log_warn "gum package not available in apt sources. Continuing with plain terminal output."
  fi
}

ensure_app_dir() {
  [ -d "${APP_DIR}" ] || die "Project directory not found: ${APP_DIR}"
}

ensure_env_file() {
  if [ -f "${ENV_FILE}" ]; then
    return 0
  fi

  if [ -f "${APP_DIR}/.env.example" ]; then
    cp "${APP_DIR}/.env.example" "${ENV_FILE}"
  else
    : > "${ENV_FILE}"
  fi
}

get_env_value() {
  local key="$1"
  local file="${2:-${ENV_FILE}}"

  if [ ! -f "${file}" ]; then
    return 0
  fi

  local line
  line="$(awk -v k="${key}" -F '=' '$1==k {print substr($0, index($0, "=")+1); exit}' "${file}" 2>/dev/null || true)"
  printf '%s' "${line}"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local file="${3:-${ENV_FILE}}"

  touch "${file}"
  local tmp_file
  tmp_file="$(mktemp)"

  awk -v k="${key}" -v v="${value}" '
    BEGIN { updated = 0 }
    {
      if ($0 ~ ("^" k "=")) {
        print k "=" v
        updated = 1
      } else {
        print $0
      }
    }
    END {
      if (updated == 0) {
        print k "=" v
      }
    }
  ' "${file}" > "${tmp_file}"

  mv "${tmp_file}" "${file}"
}

ensure_env_value() {
  local key="$1"
  local value="$2"
  local file="${3:-${ENV_FILE}}"
  local existing
  existing="$(get_env_value "${key}" "${file}")"
  if [ -z "${existing}" ]; then
    set_env_value "${key}" "${value}" "${file}"
  fi
}

prompt_secret() {
  local label="$1"
  local var_name="$2"
  local current="${!var_name:-}"

  if [ -n "${current}" ]; then
    return 0
  fi

  if [ "${USE_GUM}" -eq 1 ]; then
    current="$(gum input --password --placeholder "${label}")"
  else
    read -r -s -p "${label}" current
    echo
  fi

  printf -v "${var_name}" '%s' "${current}"
}

confirm_action() {
  local question="$1"

  if [ "${USE_GUM}" -eq 1 ]; then
    gum confirm "${question}"
    return $?
  fi

  local answer
  read -r -p "${question} [y/N]: " answer
  case "${answer}" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

generate_alnum() {
  local length="$1"
  openssl rand -base64 128 | tr -dc 'A-Za-z0-9' | head -c "${length}"
}

normalize_base_path() {
  local raw="$1"
  local trimmed="${raw#/}"
  trimmed="${trimmed%/}"
  if [ -z "${trimmed}" ]; then
    printf '%s' ""
  else
    printf '/%s' "${trimmed}"
  fi
}

detect_public_ip() {
  local ip=""
  ip="$(curl -fsSL --max-time 10 https://api.ipify.org 2>/dev/null || true)"
  if [ -z "${ip}" ]; then
    ip="$(curl -fsSL --max-time 10 https://ifconfig.me 2>/dev/null || true)"
  fi
  if [ -z "${ip}" ]; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  printf '%s' "${ip}"
}

extract_url_host() {
  local url="$1"
  local without_scheme host_port host
  without_scheme="${url#*://}"
  host_port="${without_scheme%%/*}"
  host="${host_port%%:*}"
  printf '%s' "${host}"
}

is_ipv4() {
  local value="$1"
  if [[ "${value}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    return 0
  fi
  return 1
}

ensure_app_url_consistency() {
  local detected_ip="$1"
  local current_app_url current_host
  current_app_url="$(get_env_value "APP_URL")"

  if [ -z "${current_app_url}" ]; then
    if [ -n "${detected_ip}" ]; then
      set_env_value "APP_URL" "http://${detected_ip}"
    fi
    return 0
  fi

  if [ "${KEEP_APP_URL:-0}" = "1" ]; then
    log_warn "KEEP_APP_URL=1 set. Keeping existing APP_URL=${current_app_url}"
    return 0
  fi

  if [ -z "${detected_ip}" ]; then
    return 0
  fi

  current_host="$(extract_url_host "${current_app_url}")"
  if is_ipv4 "${current_host}" && [ "${current_host}" != "${detected_ip}" ]; then
    set_env_value "APP_URL" "http://${detected_ip}"
    log_warn "APP_URL host changed (${current_host} -> ${detected_ip}). Updated APP_URL."
  fi
}

_parse_telegram_json() {
  local response="$1"
  if command_exists python3; then
    python3 - "${response}" <<'PY'
import json
import sys

raw = sys.argv[1]
try:
    data = json.loads(raw)
except Exception:
    print("PARSE_ERROR\tInvalid Telegram API response")
    sys.exit(2)

if not data.get("ok"):
    desc = data.get("description") or "Invalid BOT_TOKEN"
    print(f"ERROR\t{desc}")
    sys.exit(1)

result = data.get("result") or {}
username = (result.get("username") or "unknown").strip() or "unknown"
first_name = (result.get("first_name") or "Unknown").strip() or "Unknown"
print(f"OK\t{first_name}\t{username}")
PY
    return $?
  fi

  if printf '%s' "${response}" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'; then
    local username first_name
    username="$(printf '%s' "${response}" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p' | head -n 1)"
    first_name="$(printf '%s' "${response}" | sed -n 's/.*"first_name":"\([^"]*\)".*/\1/p' | head -n 1)"
    [ -n "${username}" ] || username="unknown"
    [ -n "${first_name}" ] || first_name="Unknown"
    printf 'OK\t%s\t%s\n' "${first_name}" "${username}"
    return 0
  fi

  local desc
  desc="$(printf '%s' "${response}" | sed -n 's/.*"description":"\([^"]*\)".*/\1/p' | head -n 1)"
  [ -n "${desc}" ] || desc="Invalid BOT_TOKEN"
  printf 'ERROR\t%s\n' "${desc}"
  return 1
}

validate_bot_token() {
  local token="$1"
  [ -n "${token}" ] || die "BOT_TOKEN is required."

  local response
  response="$(curl -fsS --max-time 20 "https://api.telegram.org/bot${token}/getMe" 2>/dev/null || true)"
  [ -n "${response}" ] || die "Failed to reach Telegram API. Check internet connectivity and BOT_TOKEN."

  local parsed
  if ! parsed="$(_parse_telegram_json "${response}")"; then
    local status message
    status="$(printf '%s' "${parsed}" | cut -f1)"
    message="$(printf '%s' "${parsed}" | cut -f2-)"
    if [ "${status}" = "PARSE_ERROR" ]; then
      die "Telegram API response parse error: ${message}"
    fi
    die "Invalid BOT_TOKEN: ${message}"
  fi

  BOT_DISPLAY_NAME="$(printf '%s' "${parsed}" | cut -f2)"
  BOT_USERNAME="$(printf '%s' "${parsed}" | cut -f3)"

  [ -n "${BOT_DISPLAY_NAME}" ] || BOT_DISPLAY_NAME="Unknown"
  [ -n "${BOT_USERNAME}" ] || BOT_USERNAME="unknown"
}

validate_bot_token_safe() {
  local token="$1"
  local response parsed

  [ -n "${token}" ] || return 1
  response="$(curl -fsS --max-time 20 "https://api.telegram.org/bot${token}/getMe" 2>/dev/null || true)"
  [ -n "${response}" ] || return 1

  if ! parsed="$(_parse_telegram_json "${response}")"; then
    return 1
  fi

  BOT_DISPLAY_NAME="$(printf '%s' "${parsed}" | cut -f2)"
  BOT_USERNAME="$(printf '%s' "${parsed}" | cut -f3)"
  [ -n "${BOT_DISPLAY_NAME}" ] || BOT_DISPLAY_NAME="Unknown"
  [ -n "${BOT_USERNAME}" ] || BOT_USERNAME="unknown"
  return 0
}

compose() {
  (cd "${APP_DIR}" && docker compose "$@")
}

compose_up_build() {
  if (cd "${APP_DIR}" && BUILDKIT_PROGRESS=plain docker compose up -d --build); then
    return 0
  fi

  log_error "docker compose up -d --build failed."
  compose ps || true
  return 1
}

compose_up_services() {
  local tmp_log
  tmp_log="$(mktemp)"
  if compose up -d "$@" >"${tmp_log}" 2>&1; then
    rm -f "${tmp_log}"
    return 0
  fi

  log_error "docker compose up -d $* failed."
  log_info "Last 120 lines from compose output:"
  tail -n 120 "${tmp_log}" || true
  rm -f "${tmp_log}"
  return 1
}

wait_for_service_health() {
  local service="$1"
  local timeout="${2:-240}"

  if [ ! -x "${APP_DIR}/scripts/wait-for-health.sh" ]; then
    chmod +x "${APP_DIR}/scripts/wait-for-health.sh" >/dev/null 2>&1 || true
  fi

  log_info "Waiting for ${service} health (timeout ${timeout}s). Progress reflects wait window, not readiness percent."

  if bash "${APP_DIR}/scripts/wait-for-health.sh" "${service}" "${timeout}"; then
    log_ok "${service} is healthy."
    return 0
  fi

  log_error "${service} failed health check."
  compose ps || true
  compose logs --tail=80 "${service}" || true
  return 1
}

get_service_health() {
  local service="$1"
  local cid
  cid="$(compose ps -q "${service}" 2>/dev/null || true)"
  if [ -z "${cid}" ]; then
    printf '%s' "not running"
    return 0
  fi

  local status
  status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${cid}" 2>/dev/null || true)"
  if [ -z "${status}" ]; then
    status="unknown"
  fi
  printf '%s' "${status}"
}

build_admin_url() {
  local app_url base_path
  app_url="$(get_env_value "APP_URL")"
  base_path="$(normalize_base_path "$(get_env_value "ADMIN_BASE_PATH")")"
  if [ -n "${app_url}" ] && [ -n "${base_path}" ]; then
    printf '%s' "${app_url}${base_path}/login"
  fi
}

print_summary_block() {
  local admin_url="$1"
  local admin_login="$2"
  local admin_password="$3"
  local credentials_path="$4"
  local bot_name="$5"
  local bot_username="$6"
  local ip="$7"
  local total_duration="${8:-}"

  [ -n "${admin_url}" ] || admin_url="unknown"
  [ -n "${admin_login}" ] || admin_login="unknown"
  [ -n "${admin_password}" ] || admin_password="unknown"
  [ -n "${credentials_path}" ] || credentials_path="${CREDENTIALS_FILE}"
  [ -n "${bot_name}" ] || bot_name="Unknown"
  [ -n "${bot_username}" ] || bot_username="unknown"
  [ -n "${ip}" ] || ip="unknown"
  [ -n "${total_duration}" ] || total_duration="$(format_duration "$(get_total_elapsed_seconds)")"

  local postgres_health backend_health frontend_health caddy_health
  postgres_health="$(get_service_health "postgres")"
  backend_health="$(get_service_health "backend")"
  frontend_health="$(get_service_health "frontend")"
  caddy_health="$(get_service_health "caddy")"

  echo
  if [ "${USE_GUM}" -eq 1 ]; then
    gum style --border rounded --padding "1 2" --border-foreground 45 --foreground 252 \
      "${PRODUCT_NAME}" \
      "Bot display name: ${bot_name}" \
      "Bot username: @${bot_username}" \
      "Server IP: ${ip}" \
      "Admin URL: ${admin_url}" \
      "Login: ${admin_login}" \
      "Password: ${admin_password}" \
      "Credentials file: ${credentials_path}" \
      "Total duration: ${total_duration}" \
      "" \
      "Health: postgres=${postgres_health}, backend=${backend_health}, frontend=${frontend_health}, caddy=${caddy_health}"
  else
    _print_colored "1;36" "========== ${PRODUCT_NAME} =========="
    echo "Bot display name : ${bot_name}"
    echo "Bot username     : @${bot_username}"
    echo "Server IP        : ${ip}"
    echo "Admin URL        : ${admin_url}"
    echo "Login            : ${admin_login}"
    echo "Password         : ${admin_password}"
    echo "Credentials file : ${credentials_path}"
    echo "Total duration   : ${total_duration}"
    echo "Health           : postgres=${postgres_health}, backend=${backend_health}, frontend=${frontend_health}, caddy=${caddy_health}"
    _print_colored "1;36" "=========================================="
  fi
}

write_credentials_file() {
  local admin_url="$1"
  local admin_login="$2"
  local admin_password="$3"
  local bot_name="$4"
  local bot_username="$5"
  local ip="$6"
  local total_duration="${7:-}"

  [ -n "${admin_url}" ] || admin_url="unknown"
  [ -n "${admin_login}" ] || admin_login="unknown"
  [ -n "${admin_password}" ] || admin_password="unknown"
  [ -n "${bot_name}" ] || bot_name="Unknown"
  [ -n "${bot_username}" ] || bot_username="unknown"
  [ -n "${ip}" ] || ip="unknown"
  [ -n "${total_duration}" ] || total_duration="$(format_duration "$(get_total_elapsed_seconds)")"

  local postgres_health backend_health frontend_health caddy_health
  postgres_health="$(get_service_health "postgres")"
  backend_health="$(get_service_health "backend")"
  frontend_health="$(get_service_health "frontend")"
  caddy_health="$(get_service_health "caddy")"

  cat > "${CREDENTIALS_FILE}" <<EOF
${PRODUCT_NAME}
Generated at: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Server IP: ${ip}
Bot display name: ${bot_name}
Bot username: @${bot_username}
Admin URL: ${admin_url}
Login: ${admin_login}
Password: ${admin_password}
Total duration: ${total_duration}
Health: postgres=${postgres_health}, backend=${backend_health}, frontend=${frontend_health}, caddy=${caddy_health}
EOF

  chmod 600 "${CREDENTIALS_FILE}"
}
