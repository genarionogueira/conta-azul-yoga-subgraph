#!/usr/bin/env bash
# Substitute CI placeholders in config/deploy*.yml before Kamal.
set -euo pipefail

: "${DO_DEPLOY_HOST:?}"
: "${DO_DEPLOY_USER:?deploy}"
: "${DO_PUBLIC_HOST:?}"
REGISTRY_URL="${GHCR_REGISTRY_URL:-${DOCR_REGISTRY_URL:-ghcr.io}}"
REGISTRY_SERVER="${REGISTRY_URL#https://}"
REGISTRY_SERVER="${REGISTRY_SERVER#http://}"
REGISTRY_SERVER="${REGISTRY_SERVER%%/*}"

for f in config/deploy.yml config/deploy.development.yml config/deploy.production.yml; do
  [ -f "$f" ] || continue
  sed -i.bak \
    -e "s|__DO_DEPLOY_HOST__|${DO_DEPLOY_HOST}|g" \
    -e "s|__DO_DEPLOY_USER__|${DO_DEPLOY_USER}|g" \
    -e "s|__DO_PUBLIC_HOST__|${DO_PUBLIC_HOST}|g" \
    -e "s|__DOCR_REGISTRY_SERVER__|${REGISTRY_SERVER}|g" \
    -e "s|__ZITADEL_PROJECT_ID__|${ZITADEL_PROJECT_ID:?Set ZITADEL_PROJECT_ID}|g" \
    "$f"
  rm -f "${f}.bak"
done

echo "✓ Preprocessed Kamal config for ${DO_PUBLIC_HOST}/conta-azul-yoga-subgraph"
