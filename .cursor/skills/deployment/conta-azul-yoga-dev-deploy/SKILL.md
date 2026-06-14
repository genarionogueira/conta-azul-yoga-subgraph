---
name: conta-azul-yoga-dev-deploy
description: Bootstrap Infisical secrets, GitHub environment, and CI deploy for conta-azul-yoga-subgraph on dev.avocado.tech via Kamal + GHCR + Traefik path prefix
---

# Conta Azul Yoga Subgraph — Dev Deploy

> **Related**: [avcd-api-gateway README](../../../../avcd-api-gateway/README.md) | monorepo `ci-cd-only-deploy` rule | [conta-azul-dev-deploy](../../../../conta-azul-service/.cursor/skills/deployment/conta-azul-dev-deploy/SKILL.md)

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

1. Get admin URI from pulumi `dev` stack output.
2. Create database/user (e.g. `conta_azul_yoga`).
3. Set `MONGODB_URL` in local `.env` before bootstrap.

### 3. App secrets (Infisical `dev` → `/conta-azul-yoga-subgraph`)

Allowlisted keys (`config/infisical-secret-keys.list`):

- `REDIS_URL` — derived from avcd-ai Valkey URI with **db index `2`**
- `MONGODB_URL` — managed Mongo connection string
- `JWT_SECRET` — optional HS256 dev fallback
- `CONTA_AZUL_CLIENT_ID`, `CONTA_AZUL_CLIENT_SECRET`

```bash
cd conta-azul-yoga-subgraph
# .env must include MONGODB_URL, CONTA_AZUL_CLIENT_ID, CONTA_AZUL_CLIENT_SECRET
make bootstrap-deploy-secrets
make upload-secrets
make validate-secrets
```

**Redis note:** Yoga uses `plain:{json}` tokens; conta-azul-service uses Fernet. Use db index `2` and re-OAuth stores via `setupConnection` after cutover.

### 4. Keycloak audience

Apply keycloak-config stack (CI) so M2M client `avcd-conta-azul-api` includes audience:

`https://dev.avocado.tech/conta-azul-yoga-subgraph`

```bash
gh workflow run pulumi-keycloak-config.yml \
  -R Avocado-Technology/pulumi-infra \
  -f command=up
```

### 5. GitHub `development` environment

Copy `.env.github.example` → `.env.github`, fill values, then:

```bash
source .env.github
make set-github-env
```

Required **vars**: `INFISICAL_*`, `DO_DEPLOY_HOST`, `DO_PUBLIC_HOST`

Required **secret**: `DO_DEPLOY_SSH_KEY` (deploy user SSH key)

### 6. Deploy (CI)

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
