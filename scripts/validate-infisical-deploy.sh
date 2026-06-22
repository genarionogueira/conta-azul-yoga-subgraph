#!/usr/bin/env bash
# Verify Infisical holds deploy secrets (see config/infisical-secret-keys.list).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INFISICAL_API_URL="${INFISICAL_API_URL:-https://secrets.avcd.ai/api}"
INFISICAL_PROJECT_ID="${INFISICAL_PROJECT_ID:?Set INFISICAL_PROJECT_ID}"
INFISICAL_SECRET_PATH="${INFISICAL_SECRET_PATH:-/conta-azul-yoga-subgraph}"
INFISICAL_ENV="${INFISICAL_ENV:-dev}"
INFISICAL_CREDENTIALS_FILE="${INFISICAL_CREDENTIALS_FILE:-../infisical/.env}"
INFISICAL_SECRET_KEYS_FILE="${INFISICAL_SECRET_KEYS_FILE:-$ROOT/config/infisical-secret-keys.list}"

REQUIRED_KEYS=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -n "$line" ]] || continue
  REQUIRED_KEYS+=("${line%%=*}")
done <"$INFISICAL_SECRET_KEYS_FILE"

if [[ "${#REQUIRED_KEYS[@]}" -eq 0 ]]; then
  echo "❌ No keys in $INFISICAL_SECRET_KEYS_FILE" >&2
  exit 1
fi

if [[ -f "$INFISICAL_CREDENTIALS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$INFISICAL_CREDENTIALS_FILE"
  set +a
fi

: "${INFISICAL_CLIENT_ID:?Set INFISICAL_CLIENT_ID}"
: "${INFISICAL_CLIENT_SECRET:?Set INFISICAL_CLIENT_SECRET}"

DOMAIN="${INFISICAL_API_URL%/api}"
INFISICAL_TOKEN="$(
  infisical login --method=universal-auth \
    --client-id="$INFISICAL_CLIENT_ID" \
    --client-secret="$INFISICAL_CLIENT_SECRET" \
    --domain="$DOMAIN" \
    --silent --plain
)"

EXPORT_FILE="$(mktemp)"
trap 'rm -f "$EXPORT_FILE"' EXIT

infisical export --env="$INFISICAL_ENV" --path="$INFISICAL_SECRET_PATH" \
  --projectId="$INFISICAL_PROJECT_ID" --token="$INFISICAL_TOKEN" \
  --format=dotenv --domain="$DOMAIN" --silent >"$EXPORT_FILE"

missing=0
echo "Checking Infisical secrets (${INFISICAL_ENV} @ ${INFISICAL_SECRET_PATH})..."
for key in "${REQUIRED_KEYS[@]}"; do
  if grep -qE "^${key}=" "$EXPORT_FILE" && \
    val="$(grep -E "^${key}=" "$EXPORT_FILE" | head -1 | cut -d= -f2- | tr -d "'\"")" && \
    [[ -n "${val// }" ]]; then
    echo "  ✓ $key"
  else
    echo "  ✗ $key (missing or empty)"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo ""
  echo "Upload from .env.development: make upload-secrets"
  echo "  ${DOMAIN}/projects/secret-management/${INFISICAL_PROJECT_ID}/secrets/${INFISICAL_ENV}"
  exit 1
fi

echo "✓ All Infisical secrets present (public config is in config/deploy.yml env.clear)"
