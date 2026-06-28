---
name: conta-azul-yoga-dev-deploy
description: Bootstrap Infisical secrets, GitHub environment, and CI deploy for conta-azul-yoga-subgraph on dev.avocado.tech via Kamal + GHCR + Traefik path prefix
---

# Conta Azul Yoga Subgraph — Dev Deploy

> **Related**: [avcd-api-gateway README](../../../../avcd-api-gateway/README.md) | monorepo `ci-cd-only-deploy` rule

## Overview

Deploy **conta-azul-yoga-subgraph** to the shared AVCD dev droplet at:

`https://dev.avocado.tech/conta-azul-yoga-subgraph/health`

- **Registry**: GitHub Container Registry (`ghcr.io/avocado-technology/conta-azul-yoga-subgraph`)
- **Secrets**: Infisical project `avcd-conta-azul-yoga-subgraph`, path `/conta-azul-yoga-subgraph`
- **CI only** — never run Kamal deploy from a laptop

## Container registry (GHCR)

| Setting | Value |
|---------|-------|
| Registry server | `ghcr.io` |
| Image name | `avocado-technology/conta-azul-yoga-subgraph` (lowercase) |
| CI auth | `github.actor` + `secrets.GITHUB_TOKEN` with `packages: write` |

## Bootstrap checklist

### 1. Infisical project

```bash
cd ../infisical
make bootstrap-avcd-projects   # creates avcd-conta-azul-yoga-subgraph if missing
```

Record `INFISICAL_PROJECT_ID` and machine identity OIDC ID from Infisical UI.

### 2. MongoDB (dev cluster)

Provision a database user on the managed Mongo cluster (same as API):

1. Bootstrap derives `MONGODB_URL` from avcd-ai `/ai` `MONGO_URI` credentials.
2. **Use `mongodb+srv://`** with the cluster seed host (`avcd-dev-mongo-1b007f0-e60b28c6.mongo.ondigitalocean.com`) — plain `mongodb://` hostnames do not resolve on the dev droplet; SRV lookup is required (same as avcd-ai).
3. Database path: `/conta_azul_yoga`.

### 3. App secrets (Infisical `dev` → `/conta-azul-yoga-subgraph`)

Allowlisted keys (`config/infisical-secret-keys.list`):

- `REDIS_URL` — derived from avcd-ai Valkey URI with **db index `2`**
- `MONGODB_URL` — managed Mongo connection string
- `JWT_SECRET` — optional HS256 dev fallback
- `CONTA_AZUL_CLIENT_ID`, `CONTA_AZUL_CLIENT_SECRET`

```bash
cd conta-azul-yoga-subgraph
# .env.local must include CONTA_AZUL_CLIENT_ID/SECRET; optional MONGODB_URL override
make bootstrap-deploy-secrets   # writes .env.development
make upload-secrets
make validate-secrets
```

**Redis note:** Yoga uses `plain:{json}` tokens. Use db index `2` and re-OAuth stores via `setupConnection` after cutover.

### 4. Keycloak audience (legacy — dev uses Zitadel)

Dev deploy sets `KEYCLOAK_ENABLED: "false"` and `JWT_REQUIRED: "true"` with Zitadel JWKS. Keycloak M2M is **not** the active auth path for dev. Browser tokens come from web-dash → Zitadel.

If you need Keycloak M2M for a legacy environment, apply keycloak-config so client `avcd-conta-azul-api` includes audience `https://dev.avocado.tech/conta-azul-yoga-subgraph`.

### 5. avcd-worker (internal)

After deploying **avcd-worker** on `avcd_edge`, Kamal sets:

```yaml
WORKER_URL: http://avcd-worker-web:8010
WORKER_EVENTS_ENABLED: "true"
```

Deploy worker **before** redeploying yoga when enabling category sync / worker log subscriptions.

Verify worker from droplet:

```bash
bash ../avcd-worker/tests/e2e/verify-worker-deploy.sh
```

Post-deploy yoga verification:

```bash
bash tests/e2e/verify-yoga-deploy.sh
```

### 6. GitHub `development` environment

```bash
cp config/github-env.example config/github-env.local
# Edit INFISICAL_OIDC_IDENTITY_ID, DO_DEPLOY_HOST, etc.
make set-github-env
```

Or export CI vars manually, then `make set-github-env`.

Required **vars**: `INFISICAL_*`, `DO_DEPLOY_HOST`, `DO_PUBLIC_HOST`

Required **secret**: `DO_DEPLOY_SSH_KEY` (deploy user SSH key)

### 7. Deploy (CI)

First run (creates Kamal hooks on droplet):

```bash
gh workflow run deploy-digitalocean-dev.yml \
  -R Avocado-Technology/conta-azul-yoga-subgraph \
  -f kamal_command=setup
gh run watch
```

Subsequent deploys (push to `main` or):

```bash
gh workflow run deploy-digitalocean-dev.yml \
  -R Avocado-Technology/conta-azul-yoga-subgraph \
  -f kamal_command=deploy
gh run watch
```

## Verify

```bash
curl -sf https://dev.avocado.tech/conta-azul-yoga-subgraph/health
# {"status":"ok"}

# GraphQL without token → 401 when JWT_REQUIRED=true
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://dev.avocado.tech/conta-azul-yoga-subgraph/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ hello }"}'
```

### M2M token (avcd-conta-azul-api)

```bash
TOKEN=$(curl -sf -X POST https://auth.avcd.ai/realms/avcd/protocol/openid-connect/token \
  -d grant_type=client_credentials \
  -d client_id=avcd-conta-azul-api \
  -d client_secret="$KEYCLOAK_CLIENT_SECRET" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl -sf -X POST https://dev.avocado.tech/conta-azul-yoga-subgraph/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ hello }"}'
```

## Local dev (Zitadel auth always on)

```bash
cp .env.example .env.local
cp compose.override.local.example.yaml compose.override.local.yaml
# Set ZITADEL_PROJECT_ID in compose.override.local.yaml (must match web-dash)
make dev
```

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4000/graphql \
  -H 'Content-Type: application/json' -d '{"query":"{ hello }"}'
# 401

curl -sf http://localhost:4000/ready
# jwks.ok should be true when ZITADEL_ISSUER is reachable
```

See [web-dash zitadel-apollo-auth](../../../../web-dash/.cursor/skills/security/zitadel-apollo-auth/SKILL.md) for the full browser → subgraph flow.

## Common issues

| Issue | Fix |
|-------|-----|
| Infisical OIDC 401 | Set `INFISICAL_OIDC_AUDIENCE=https://secrets.avcd.ai` |
| Traefik 404 | Confirm container on `avcd_edge`; check strip prefix middleware |
| GraphQL 401 with M2M token | Apply keycloak-config (yoga audience scope on avcd-conta-azul-api) |
| Mongo connection failed | Verify `MONGODB_URL` in Infisical; check droplet → cluster network |
| Health check fails | Kamal waits on Docker health; verify `/health` in container |

## Makefile targets

```bash
make pull-secrets
make upload-secrets
make validate-secrets
make bootstrap-deploy-secrets
make set-github-env
```
