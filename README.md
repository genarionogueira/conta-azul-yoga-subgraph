# Conta Azul Yoga Subgraph

GraphQL subgraph for Conta Azul entity sync (categories and related data).

## Local development

```bash
cp config/local-env.example .env.local
cp compose.override.local.example.yaml compose.override.local.yaml   # ZITADEL_PROJECT_ID, ngrok redirect
make dev    # yoga + avcd-worker + Redis + Mongo
make dev-down
make test-unit
make test-e2e
```

Compose layers: `compose.yaml` (base) + `compose.dev.yaml` (config, Zitadel auth on) + `compose.override.local.yaml` (personal).

The bundled **avcd-worker** runs a FastAPI scheduler that calls `reconcileAll` on this subgraph every 60 seconds (configurable via `RECONCILE_INTERVAL_SECONDS`). Yoga owns OAuth credentials, category reconcile (Conta Azul API → MongoDB), and Redis worker event streams.

Connect UI: http://localhost:4000/connect — OAuth saves tokens in Redis; category sync is handled by the worker scheduler calling yoga GraphQL (up to ~1 minute delay).

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
| `WORKER_URL` | Base URL for avcd-worker internal HTTP (default: `http://localhost:8010`; compose: `http://worker:8010`) |
| `CATEGORIES_COLLECTION` | Mongo collection for synced categories (default: `conta_azul_categories`) |
| `TENANT_DISCOVERY_MODE` | `scan` (all tenants from Redis) or `default_only` |
| `WORKER_EVENTS_STREAM_MINID_DAYS` | Redis stream retention for sync events (default: `30`) |

**Note:** `disconnectStore` calls the worker to delete synced category data from Mongo, then removes the OAuth token from Redis. If the worker is unreachable, disconnect fails and the connection remains.

## Schema export

```bash
make print-schema
```

Regenerate the API gateway execution config after schema changes (from `avcd-api-gateway`):

```bash
make compose-execution-config
```
