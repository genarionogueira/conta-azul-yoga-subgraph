---
name: graphql-yoga-errors
description: GraphQL Yoga error masking, GraphQLError extensions, and hybrid diagnostics pattern for conta-azul-yoga-subgraph queries
---

# GraphQL Yoga Errors & Diagnostics

> **Related**: [conta-azul-yoga-subgraph README](../../README.md)

## Overview

This subgraph uses **GraphQL Yoga 5** with a hybrid error strategy aligned with the GraphQL spec and Yoga docs:

| Situation | Delivery | Example |
|-----------|----------|---------|
| Invalid client input (pagination) | Top-level `errors[]` with `extensions.code` | `BAD_USER_INPUT` for `first: -1` |
| Empty results due to misconfiguration | `diagnostics` on the connection (query succeeds) | `TOKEN_MISSING`, `DATA_NOT_SYNCED` |
| Unexpected server failures | Masked as `INTERNAL_SERVER_ERROR` | Mongo/network bugs |

## Error masking (Yoga)

Configured in [`src/index.ts`](../../src/index.ts):

```typescript
import { createYogaMaskError } from './lib/errors/index.js'

createYoga({
  maskedErrors: {
    maskError: createYogaMaskError(isDev),
  },
})
```

- **`GraphQLError`** instances pass through unmasked (safe, intentional errors).
- Plain `Error` → masked to `"Unexpected error."` with `extensions.code: INTERNAL_SERVER_ERROR`.
- In development (`NODE_ENV !== 'production'`), `extensions.originalError` is included for debugging.

Reference: [Yoga error masking](https://the-guild.dev/graphql/yoga-server/docs/features/error-masking)

## Throwing input errors

Use [`badUserInput()`](../../src/lib/errors/bad-user-input.ts):

```typescript
import { badUserInput } from '../../lib/errors/index.js'

throw badUserInput('`first` must be a positive integer.', { field: 'first', value: first })
```

Clients read: `errors[0].extensions.code === 'BAD_USER_INPUT'`

## Connection diagnostics (empty results)

When `contaAzulCategories` returns `totalCount: 0`, the resolver runs [`diagnoseCategoryQuery()`](../../src/lib/diagnostics/category-query.ts) and attaches hints to `diagnostics`.

### Diagnostic codes

| Code | Meaning | Typical fix |
|------|---------|-------------|
| `STORE_NOT_CONNECTED` | Store not in Redis index and no token | OAuth via `authorizationUrl` + `setupConnection` |
| `TOKEN_MISSING` | Store in `conta_azul:connected_stores` but token key gone | Re-authorize store |
| `DATA_NOT_SYNCED` | Token exists, Mongo has no categories for store | `syncContaAzulCategories(storeId: "...")` |
| `NO_CONNECTED_STORES` | Unscoped query, no stores in Redis | Connect at least one store |
| `REDIS_UNAVAILABLE` | Cannot ping token Redis | Fix `REDIS_URL` (share with conta-azul-service) |

### Example query

```graphql
query {
  contaAzulCategories(where: { storeId: { _eq: "butanta" } }) {
    totalCount
    diagnostics {
      code
      message
      hint
      storeId
    }
  }
}
```

When data exists: `diagnostics: []`.

## Adding diagnostics to new domains

1. Add domain-specific diagnostic codes to SDL (or reuse shared enum).
2. Implement `diagnose{Entity}Query()` in `src/lib/diagnostics/`.
3. Call from resolver when `totalCount === 0`.
4. Default `diagnostics: []` in pagination `buildConnectionResult`.

## Redis token store

Tokens live at `conta_azul:token:{storeId}`. Connected store index: `conta_azul:connected_stores` (zset, same as conta-azul-service).

For local dev, point subgraph at shared Redis:

```env
REDIS_URL=redis://host.docker.internal:6379
```

## Tests

| Layer | File |
|-------|------|
| Unit — errors | `tests/unit/graphql-errors.test.ts` |
| Unit — pagination validation | `tests/unit/pagination-validate.test.ts` |
| Unit — diagnostics engine | `tests/unit/category-query-diagnostics.test.ts` |
| E2E — full scenarios | `tests/e2e/categories-diagnostics.e2e.test.ts` |

## Common Issues

| Issue | Solution |
|-------|----------|
| Empty query, no diagnostics | Ensure `diagnostics` field is in the GraphQL selection set |
| Always `NO_CONNECTED_STORES` | Subgraph Redis is isolated; set `REDIS_URL` to conta-azul-service tokens Redis |
| `DATA_NOT_SYNCED` but store has categories in Conta Azul | Run `syncContaAzulCategories` mutation |
| `BAD_USER_INPUT` on `first: 0` | Use `first: 1` minimum or omit pagination args (defaults to 10) |

## References

- [GraphQL spec — Errors](https://github.com/graphql/graphql-spec/blob/main/spec/Section%207%20--%20Response.md)
- [graphql-js errors guide](https://www.graphql-js.org/docs/graphql-errors/)
- [GraphQL Yoga error handling tutorial](https://the-guild.dev/graphql/yoga-server/tutorial/basic/09-error-handling)
