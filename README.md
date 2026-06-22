# Conta Azul Yoga Subgraph

GraphQL subgraph for Conta Azul entity sync (categories and related data).

## Local development

```bash
cp config/local-env.example .env.local
cp compose.override.local.example.yaml compose.override.local.yaml   # ZITADEL_PROJECT_ID, ngrok redirect
make dev
make test-unit
make test-e2e
```

Compose layers: `compose.yaml` (base) + `compose.dev.yaml` (config, Zitadel auth on) + `compose.override.local.yaml` (personal).

Connect UI: http://localhost:4000/connect

Unauthenticated GraphQL returns 401 locally (same as dev deploy). E2E tests use `compose.override.e2e.yaml` with `JWT_REQUIRED=false`.

## Credentials (Redis)

OAuth tokens are stored per tenant:

| Key | Purpose |
|-----|---------|
| `conta_azul:token:{tenantId}:{storeId}` | OAuth token (TTL) |
| `conta_azul:connected_stores:{tenantId}` | ZSET index of connected store IDs |
| `conta_azul:oauth:state:{state}` | OAuth state (includes `tenantId`) |

When `JWT_REQUIRED=false` (E2E only), the default tenant is `dev-tenant` (`DEFAULT_DEV_TENANT_ID`).

### Migrating legacy keys (dev only)

Older deployments used global keys `conta_azul:token:{storeId}` without tenant scoping. After upgrading:

1. **Preferred:** flush dev Redis and reconnect stores via OAuth.
2. **Or** run the one-off migration:

```bash
REDIS_URL=redis://localhost:6379 DEFAULT_DEV_TENANT_ID=dev-tenant npx tsx scripts/migrate-credentials-keys.ts
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `TENANT_ID_CLAIM` | Optional JWT claim for tenant ID (overrides Zitadel org claim) |
| `ALLOW_SUB_AS_TENANT` | When `true`, use JWT `sub` as tenant when org claim is missing |
| `DEFAULT_DEV_TENANT_ID` | Tenant used when JWT is not required (default: `dev-tenant`, E2E only) |
| `CREDENTIALS_EVENTS_ENABLED` | Set to `false` to disable Redis pub/sub credential events |

## Schema export

```bash
make print-schema
```

Regenerate the API gateway execution config after schema changes (from `avcd-api-gateway`):

```bash
make compose-execution-config
```
