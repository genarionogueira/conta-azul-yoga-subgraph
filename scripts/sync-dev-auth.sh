#!/usr/bin/env bash
# Write DEV_AUTH_BEARER to .env.local: Keycloak client_credentials or HS256 fallback.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/.env.local"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

set_env_var() {
  local key="$1"
  local value="$2"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "${key}=${value}" >> "$ENV_FILE"
    return
  fi
  if grep -q "^${key}=" "$ENV_FILE"; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    fi
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

write_bearer() {
  local token="$1"
  if [[ -z "$token" ]]; then
    echo "Error: empty token" >&2
    exit 1
  fi
  set_env_var "DEV_AUTH_BEARER" "$token"
}

if [[ "${KEYCLOAK_ENABLED:-false}" == "true" ]]; then
  : "${KEYCLOAK_REALM:=avcd}"
  : "${KEYCLOAK_CLIENT_ID:=avcd-conta-azul-api}"
  if [[ -z "${KEYCLOAK_URL:-}" ]]; then
    KEYCLOAK_URL="http://localhost:8080"
    set_env_var "KEYCLOAK_URL" "$KEYCLOAK_URL"
  fi
  if [[ -z "${KEYCLOAK_CLIENT_SECRET:-}" ]]; then
    if [[ "${KEYCLOAK_URL}" == *"localhost"* || "${KEYCLOAK_URL}" == *"127.0.0.1"* || "${KEYCLOAK_URL}" == *"host.docker.internal"* ]]; then
      KEYCLOAK_CLIENT_SECRET="local-conta-azul-api-client-secret"
      set_env_var "KEYCLOAK_CLIENT_SECRET" "$KEYCLOAK_CLIENT_SECRET"
      echo "Using local Keycloak client secret (see keycloak/config/avcd-realm.json)"
    else
      echo "Error: Keycloak auth enabled but KEYCLOAK_CLIENT_SECRET is missing in .env.local" >&2
      exit 1
    fi
  fi
  TOKEN_BASE="${KEYCLOAK_URL}"
  if [[ "$TOKEN_BASE" == *"host.docker.internal"* ]]; then
    TOKEN_BASE="http://localhost:8080"
  fi
  TOKEN_URL="${TOKEN_BASE%/}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token"
  echo "Fetching Keycloak access token from ${TOKEN_URL} ..."
  HTTP_CODE="$(curl -sS -o /tmp/conta-azul-yoga-sync-auth-token.json -w "%{http_code}" -X POST "$TOKEN_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials" \
    -d "client_id=${KEYCLOAK_CLIENT_ID}" \
    -d "client_secret=${KEYCLOAK_CLIENT_SECRET}")"
  if [[ "$HTTP_CODE" == "200" ]]; then
    TOKEN="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' </tmp/conta-azul-yoga-sync-auth-token.json)"
    write_bearer "$TOKEN"
    echo "Updated .env.local with DEV_AUTH_BEARER (Keycloak)"
    echo ""
    echo "--- TOKEN ---"
    echo "$TOKEN"
    echo "---"
    exit 0
  fi
  echo "Warning: Keycloak token request failed (HTTP ${HTTP_CODE}). Falling back to HS256 JWT." >&2
fi

if [[ "${JWT_REQUIRED:-true}" != "true" && -z "${JWT_SECRET:-}" ]]; then
  echo "Auth not required. Skipping token generation."
  exit 0
fi

echo "Generating HS256 JWT ..."
JWT_SECRET="${JWT_SECRET:-test-secret-change-in-production}"
TOKEN="$(cd "$ROOT" && JWT_SECRET="$JWT_SECRET" node scripts/generate-worker-jwt.mjs)"
if [[ -z "$TOKEN" ]]; then
  echo "Error: Could not generate JWT" >&2
  exit 1
fi
write_bearer "$TOKEN"
echo "Updated .env.local with DEV_AUTH_BEARER (HS256)"
echo ""
echo "--- TOKEN ---"
echo "$TOKEN"
echo "---"
