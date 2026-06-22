#!/usr/bin/env bash
# Upload secret keys from a local dotenv file into Infisical project avcd-conta-azul-yoga-subgraph.
# Only keys listed in config/infisical-secret-keys.list are uploaded.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INFISICAL_API_URL="${INFISICAL_API_URL:-https://secrets.avcd.ai/api}"
INFISICAL_PROJECT_ID="${INFISICAL_PROJECT_ID:?Set INFISICAL_PROJECT_ID}"
INFISICAL_SECRET_PATH="${INFISICAL_SECRET_PATH:-/conta-azul-yoga-subgraph}"
INFISICAL_ENV="${INFISICAL_ENV:-dev}"
INFISICAL_PUSH_FILE="${INFISICAL_PUSH_FILE:-.env.development}"
INFISICAL_CREDENTIALS_FILE="${INFISICAL_CREDENTIALS_FILE:-../infisical/.env}"
INFISICAL_SECRET_KEYS_FILE="${INFISICAL_SECRET_KEYS_FILE:-$ROOT/config/infisical-secret-keys.list}"

command -v infisical >/dev/null 2>&1 || {
  echo "❌ Infisical CLI not installed. Run: brew install infisical/get-cli/infisical" >&2
  exit 1
}

[[ -f "$INFISICAL_SECRET_KEYS_FILE" ]] || {
  echo "❌ Secret allowlist not found: $INFISICAL_SECRET_KEYS_FILE" >&2
  exit 1
}

if [[ ! -f "$INFISICAL_PUSH_FILE" ]]; then
  echo "❌ Push source not found: $INFISICAL_PUSH_FILE" >&2
  echo "   Copy config/local-env.example → .env.development and add secrets." >&2
  exit 1
fi

if [[ -f "$INFISICAL_CREDENTIALS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$INFISICAL_CREDENTIALS_FILE"
  set +a
fi

: "${INFISICAL_CLIENT_ID:?Set INFISICAL_CLIENT_ID (e.g. in $INFISICAL_CREDENTIALS_FILE)}"
: "${INFISICAL_CLIENT_SECRET:?Set INFISICAL_CLIENT_SECRET}"

DOMAIN="${INFISICAL_API_URL%/api}"
FILTERED="$(mktemp)"
trap 'rm -f "$FILTERED"' EXIT

is_allowlisted_secret() {
  local key="$1"
  local line k
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -n "$line" ]] || continue
    k="${line%%=*}"
    k="${k#"${k%%[![:space:]]*}"}"
    k="${k%"${k##*[![:space:]]}"}"
    [[ "$key" == "$k" ]] && return 0
  done <"$INFISICAL_SECRET_KEYS_FILE"
  return 1
}

count=0
skipped=0
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in ''|\#*) continue ;; esac
  key="${line%%=*}"
  val="${line#*=}"
  [[ -n "$key" ]] || continue
  if ! is_allowlisted_secret "$key"; then
    skipped=$((skipped + 1))
    continue
  fi
  [[ -n "${val// }" ]] || continue
  printf '%s=%s\n' "$key" "$val" >>"$FILTERED"
  count=$((count + 1))
done <"$INFISICAL_PUSH_FILE"

if [[ "$count" -eq 0 ]]; then
  echo "❌ No allowlisted secrets to upload in $INFISICAL_PUSH_FILE" >&2
  echo "   Allowlist: $INFISICAL_SECRET_KEYS_FILE" >&2
  exit 1
fi

INFISICAL_TOKEN="$(
  infisical login --method=universal-auth \
    --client-id="$INFISICAL_CLIENT_ID" \
    --client-secret="$INFISICAL_CLIENT_SECRET" \
    --domain="$DOMAIN" \
    --silent --plain
)"

infisical secrets set --file="$FILTERED" \
  --env="$INFISICAL_ENV" \
  --path="$INFISICAL_SECRET_PATH" \
  --projectId="$INFISICAL_PROJECT_ID" \
  --token="$INFISICAL_TOKEN" \
  --domain="$DOMAIN" \
  --silent

echo "✓ Uploaded $count secret(s) from $INFISICAL_PUSH_FILE → avcd-conta-azul-yoga-subgraph ($INFISICAL_ENV @ $INFISICAL_SECRET_PATH)"
[[ "$skipped" -gt 0 ]] && echo "  (skipped $skipped non-secret key(s) — use Kamal env.clear for those)"
echo "  Project ID: $INFISICAL_PROJECT_ID"
echo "  UI: ${DOMAIN}/projects/secret-management/${INFISICAL_PROJECT_ID}/secrets/${INFISICAL_ENV}"
