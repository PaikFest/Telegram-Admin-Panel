#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${APP_ROOT}"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <service> [timeout_seconds]"
  exit 1
fi

format_duration() {
  local total="${1:-0}"
  local hours minutes seconds
  hours=$((total / 3600))
  minutes=$(((total % 3600) / 60))
  seconds=$((total % 60))
  printf '%02d:%02d:%02d' "${hours}" "${minutes}" "${seconds}"
}

render_timeout_bar() {
  local elapsed="$1"
  local timeout="$2"
  local width=20
  local filled empty i bar

  if [ "${timeout}" -le 0 ]; then
    timeout=1
  fi
  if [ "${elapsed}" -gt "${timeout}" ]; then
    elapsed="${timeout}"
  fi

  filled=$((elapsed * width / timeout))
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

service="$1"
timeout="${2:-240}"
start_ts="$(date +%s)"
last_status=""

while true; do
  cid="$(docker compose ps -q "$service" || true)"
  status="starting"
  now_ts="$(date +%s)"
  elapsed="$((now_ts - start_ts))"

  if [ -n "$cid" ]; then
    status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
    if [ "$status" = "healthy" ]; then
      echo "$service is healthy (elapsed: $(format_duration "${elapsed}"))"
      break
    fi
  else
    status="not-created"
  fi

  if [ "$status" != "$last_status" ]; then
    echo "$service status: $status"
    last_status="$status"
  fi

  echo "Waiting for ${service} health... ${elapsed}s / ${timeout}s $(render_timeout_bar "${elapsed}" "${timeout}") (status: ${status})"

  if [ "$elapsed" -ge "$timeout" ]; then
    echo "Timed out waiting for $service to become healthy"
    docker compose ps || true
    docker compose logs --tail=80 "$service" || true
    if [ -n "$cid" ]; then
      docker inspect "$cid" 2>/dev/null | tail -n 40 || true
    fi
    exit 1
  fi

  sleep 3
done
