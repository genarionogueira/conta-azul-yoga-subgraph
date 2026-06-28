#!/usr/bin/env bash
# Start local Compose MongoDB and open it in MongoDB Compass.
#   MONGO_SKIP_UP=1       skip compose up (mongo already running via make dev)
#   MONGO_LIST_ONLY=1     print URI only
#   COMPASS_SOFT_FAIL=1   warn instead of failing when Compass is missing
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -n "${COMPOSE:-}" ]; then
  # shellcheck disable=SC2206
  COMPOSE_CMD=(${COMPOSE})
else
  COMPOSE_CMD=(docker compose)
fi
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-.env.local}"
MONGO_SKIP_UP="${MONGO_SKIP_UP:-0}"
LIST_ONLY="${MONGO_LIST_ONLY:-0}"
COMPASS_SOFT_FAIL="${COMPASS_SOFT_FAIL:-0}"

cd "${ROOT}"

if [ -f "${COMPOSE_ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${COMPOSE_ENV_FILE}"
  set +a
fi

MONGO_LOCAL_PORT="${MONGO_LOCAL_PORT:-27018}"
MONGO_DATABASE="${MONGO_DATABASE:-conta_azul}"
MONGO_URI="mongodb://127.0.0.1:${MONGO_LOCAL_PORT}/${MONGO_DATABASE}"

resolve_compass_bin() {
  if [ -n "${COMPASS_BIN:-}" ] && [ -x "${COMPASS_BIN}" ]; then
    echo "${COMPASS_BIN}"
    return
  fi
  if command -v mongodb-compass >/dev/null 2>&1; then
    command -v mongodb-compass
    return
  fi
  local mac_app="/Applications/MongoDB Compass.app/Contents/MacOS/MongoDB Compass"
  if [ -x "${mac_app}" ]; then
    echo "${mac_app}"
    return
  fi
  return 1
}

run_compose() {
  if [ -f "${COMPOSE_ENV_FILE}" ]; then
    "${COMPOSE_CMD[@]}" --env-file "${COMPOSE_ENV_FILE}" -f compose.yaml -f compose.dev.yaml "$@"
  else
    "${COMPOSE_CMD[@]}" -f compose.yaml -f compose.dev.yaml "$@"
  fi
}

if [ "${MONGO_SKIP_UP}" = "1" ]; then
  echo "Local MongoDB: 127.0.0.1:${MONGO_LOCAL_PORT}/${MONGO_DATABASE}"
else
  echo "Starting local MongoDB (127.0.0.1:${MONGO_LOCAL_PORT})..."
  run_compose up -d --wait mongo
fi

echo "────────────────────────────────────────"
echo "App:      conta-azul-yoga-subgraph (local)"
echo "Database: ${MONGO_DATABASE}"
echo "Host:     127.0.0.1"
echo "Port:     ${MONGO_LOCAL_PORT}"
echo "URI:      ${MONGO_URI}"
echo

if [ "${LIST_ONLY}" = "1" ]; then
  exit 0
fi

if ! COMPASS_BIN="$(resolve_compass_bin)"; then
  if [ "${COMPASS_SOFT_FAIL}" = "1" ]; then
    echo "MongoDB Compass not found; stack is running without opening Compass."
    exit 0
  fi
  echo "MongoDB Compass not found. Install Compass or set COMPASS_BIN." >&2
  exit 1
fi

echo "Compass: ${COMPASS_BIN}"
if pgrep -f "MongoDB Compass" >/dev/null 2>&1; then
  echo "MongoDB Compass is already running — skipping open."
else
  echo "Opening local MongoDB in MongoDB Compass..."
  "${COMPASS_BIN}" "${MONGO_URI}" >/dev/null 2>&1 &
  echo "Opened ${MONGO_DATABASE} in MongoDB Compass."
fi
