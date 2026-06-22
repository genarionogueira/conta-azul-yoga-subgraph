#!/usr/bin/env bash
# Set GitHub Actions environment variables for Kamal deploy.
# Usage: export INFISICAL_PROJECT_ID=... DO_DEPLOY_HOST=... && ./scripts/set-github-env.sh development
set -euo pipefail

ENV_NAME="${1:-development}"
REPO="${GITHUB_REPO:-Avocado-Technology/conta-azul-yoga-subgraph}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

VARS=(
  INFISICAL_PROJECT_ID
  INFISICAL_OIDC_IDENTITY_ID
  INFISICAL_INFRA_PROJECT_ID
  INFISICAL_API_URL
  INFISICAL_OIDC_AUDIENCE
  DO_DEPLOY_HOST
  DO_DEPLOY_USER
  DO_PUBLIC_HOST
  PUBLIC_HOST
  GHCR_REGISTRY_URL
)

for var in "${VARS[@]}"; do
  val="${!var:-}"
  if [ -z "${val}" ]; then
    echo "Skip ${var} (unset)"
    continue
  fi
  echo "Setting ${var} on ${ENV_NAME}"
  gh variable set "${var}" --env "${ENV_NAME}" -R "${REPO}" --body "${val}"
done
