# Conta Azul Yoga Subgraph

GraphQL subgraph for Conta Azul entity sync (categories and related data).

## Local development

```bash
make dev
make test-unit
make test-e2e
```

Connect UI: http://localhost:4000/connect

## Credentials (Redis)

OAuth tokens are stored per tenant:

| Key | Purpose |
|-----|---------|
| `conta_azul:token:{tenantId}:{storeId}` | OAuth token (TTL) |
| `conta_azul:connected_stores:{tenantId}` | ZSET index of connected store IDs |
| `conta_azul:oauth:state:{state}` | OAuth state (includes `tenantId`) |

When `JWT_REQUIRED=false` (local/E2E), the default tenant is `dev-tenant` (`DEFAULT_DEV_TENANT_ID`).

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
| `DEFAULT_DEV_TENANT_ID` | Tenant used when JWT is not required (default: `dev-tenant`) |
| `CREDENTIALS_EVENTS_ENABLED` | Set to `false` to disable Redis pub/sub credential events |

## Schema export

```bash
make print-schema
```

Regenerate the API gateway execution config after schema changes (from `avcd-api-gateway`):

```bash
make compose-execution-config
```
