#!/usr/bin/env tsx
/**
 * One-off dev migration: legacy `conta_azul:token:{storeId}` → tenant-scoped keys.
 *
 * Usage:
 *   REDIS_URL=redis://localhost:6379 DEFAULT_DEV_TENANT_ID=dev-tenant tsx scripts/migrate-credentials-keys.ts
 *
 * Safe to run multiple times — skips keys that already include a tenant segment.
 */
import { Redis } from 'ioredis'

const LEGACY_TOKEN_PREFIX = 'conta_azul:token:'
const DEFAULT_TENANT_ID = process.env.DEFAULT_DEV_TENANT_ID?.trim() || 'dev-tenant'

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) {
    console.error('REDIS_URL is required')
    process.exit(1)
  }

  const redis = new Redis(redisUrl)
  let cursor = '0'
  let migrated = 0
  let skipped = 0

  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${LEGACY_TOKEN_PREFIX}*`, 'COUNT', 100)
    cursor = next

    for (const key of keys) {
      const suffix = key.slice(LEGACY_TOKEN_PREFIX.length)
      if (suffix.includes(':')) {
        skipped += 1
        continue
      }

      const storeId = suffix
      const value = await redis.get(key)
      if (!value) continue

      const newKey = `${LEGACY_TOKEN_PREFIX}${DEFAULT_TENANT_ID}:${storeId}`
      const ttl = await redis.ttl(key)
      if (ttl > 0) {
        await redis.setex(newKey, ttl, value)
      } else {
        await redis.set(newKey, value)
      }

      let connectedAt = Date.now()
      try {
        const json = value.startsWith('plain:') ? value.slice(6) : value
        const parsed = JSON.parse(json) as { connected_at?: number }
        if (typeof parsed.connected_at === 'number') {
          connectedAt = parsed.connected_at
        }
      } catch {
        /* ignore parse errors */
      }

      await redis.zadd(`conta_azul:connected_stores:${DEFAULT_TENANT_ID}`, connectedAt, storeId)
      await redis.del(key)
      migrated += 1
      console.log(`Migrated ${key} → ${newKey}`)
    }
  } while (cursor !== '0')

  await redis.quit()
  console.log(`Done. migrated=${migrated} skipped=${skipped}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
