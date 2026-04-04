#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${APP_ROOT}"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <service> [timeout_seconds]"
  exit 1
fi

service="$1"
timeout="${2:-240}"
start_ts="$(date +%s)"
last_status=""

while true; do
  cid="$(docker compose ps -q "$service" || true)"
  status="starting"

  if [ -n "$cid" ]; then
    status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
    if [ "$status" = "healthy" ]; then
      echo "$service is healthy"
      break
    fi
  else
    status="not-created"
  fi

  if [ "$status" != "$last_status" ]; then
    echo "$service status: $status"
    last_status="$status"
  fi

  now_ts="$(date +%s)"
  elapsed="$((now_ts - start_ts))"
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
