#!/usr/bin/env bash
# E2E: conta-azul-yoga-subgraph dev deploy — health, ready, unauthenticated GraphQL.
#
# Usage:
#   bash tests/e2e/verify-yoga-deploy.sh
#   PUBLIC_HOST=staging.example.com bash tests/e2e/verify-yoga-deploy.sh
#
# Prerequisites: Kamal deploy healthy at PUBLIC_HOST; curl installed.
set -euo pipefail

PUBLIC_HOST="${PUBLIC_HOST:-dev.avocado.tech}"
BASE="https://${PUBLIC_HOST}/conta-azul-yoga-subgraph"

PASS=0
FAIL=0

check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  ✅ $label"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== conta-azul-yoga-subgraph deploy verification (${PUBLIC_HOST}) ==="

check "Health returns status ok" \
  bash -c "curl -sf \"${BASE}/health\" | grep -q '\"status\":\"ok\"'"

check "Ready endpoint responds" \
  curl -sf "${BASE}/ready"

check "GraphQL without token returns 401" \
  bash -c "status=\$(curl -s -o /dev/null -w '%{http_code}' -X POST \"${BASE}/graphql\" \
    -H 'Content-Type: application/json' -d '{\"query\":\"{ __typename }\"}'); test \"\$status\" = \"401\""

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "✓ conta-azul-yoga-subgraph deploy verification passed"
