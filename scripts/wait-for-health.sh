#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <service> [timeout_seconds]"
  exit 1
fi

service="$1"
timeout="${2:-240}"
start_ts="$(date +%s)"

while true; do
  cid="$(docker compose ps -q "$service" || true)"

  if [ -n "$cid" ]; then
    status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
    if [ "$status" = "healthy" ]; then
      echo "$service is healthy"
      break
    fi
  fi

  now_ts="$(date +%s)"
  elapsed="$((now_ts - start_ts))"
  if [ "$elapsed" -ge "$timeout" ]; then
    echo "Timed out waiting for $service to become healthy"
    docker compose ps || true
    exit 1
  fi

  sleep 3
done