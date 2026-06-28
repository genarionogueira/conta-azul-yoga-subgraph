#!/usr/bin/env bash
# Print the IPv4 address Docker should map for zitadel.avcd.ai (extra_hosts).
set -euo pipefail

if [ -n "${ZITADEL_HOST_IP:-}" ]; then
  echo "$ZITADEL_HOST_IP"
  exit 0
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT/.env.local" ]; then
  # shellcheck disable=SC1091
  set -a
  source "$ROOT/.env.local"
  set +a
  if [ -n "${ZITADEL_HOST_IP:-}" ]; then
    echo "$ZITADEL_HOST_IP"
    exit 0
  fi
fi

if command -v dig >/dev/null 2>&1; then
  ip="$(dig +short zitadel.avcd.ai A 2>/dev/null | tail -1 || true)"
  if [ -n "$ip" ]; then
    echo "$ip"
    exit 0
  fi
fi

if [ -r /etc/hosts ]; then
  ip="$(awk '$2 ~ /(^|\.)zitadel\.avcd\.ai$/ { print $1; exit }' /etc/hosts 2>/dev/null || true)"
  if [ -n "$ip" ] && [ "$ip" != "127.0.0.1" ] && [ "$ip" != "::1" ]; then
    echo "$ip"
    exit 0
  fi
fi

PULUMI_ROOT="${PULUMI_INFRA_ROOT:-$ROOT/../pulumi-infra}"
if [ -d "$PULUMI_ROOT" ] && command -v pulumi >/dev/null 2>&1; then
  ip="$(cd "$PULUMI_ROOT" && pulumi stack output infraDropletIp --stack infra 2>/dev/null || true)"
  if [ -n "$ip" ]; then
    echo "$ip"
    exit 0
  fi
fi

DEFAULT_IP_FILE="$ROOT/config/zitadel-infra-ip.default"
if [ -f "$DEFAULT_IP_FILE" ]; then
  ip="$(tr -d '[:space:]' <"$DEFAULT_IP_FILE")"
  if [ -n "$ip" ]; then
    echo "$ip"
    exit 0
  fi
fi

echo "Could not resolve ZITADEL_HOST_IP for zitadel.avcd.ai." >&2
echo "Add to .env.local: ZITADEL_HOST_IP=<infra-droplet-ip>" >&2
exit 1
