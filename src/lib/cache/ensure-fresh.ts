import type { Db } from 'mongodb'
import { getRestAdapter } from '../entity/adapters.js'
import type { EntityDef } from '../entity/types.js'
import { syncToMongo } from '../sync/service.js'
import { logCache } from './logger.js'
import { isFresh, metaKey, writeMeta } from './meta.js'
import { globalSingleflight } from './singleflight.js'
import { parseTtl } from './ttl-parser.js'

/** Collections synced via category reconcile — not REST cache refresh. */
const CATEGORY_SYNC_COLLECTIONS = new Set(['conta_azul_categories'])

export interface EnsureFreshCacheOptions {
  tenantId: string
  storeIds: string[]
  db: Db
}

async function resolveStoreIds(
  entity: EntityDef,
  tenantId: string,
  storeIds: string[]
): Promise<string[]> {
  if (storeIds.length > 0) return storeIds
  if (!entity.rest) return []
  const ids = await getRestAdapter(entity.rest.adapter).listConnectedStoreIds(tenantId)
  return ids ?? []
}

async function refreshStore(
  entity: EntityDef,
  tenantId: string,
  storeId: string,
  db: Db
): Promise<void> {
  const key = metaKey(entity.mongo.collection, storeId)

  if (await isFresh(key, db)) {
    logCache('fresh_hit', { key, entity: entity.name, storeId })
    return
  }

  await globalSingleflight.run(key, async () => {
    if (await isFresh(key, db)) {
      logCache('fresh_hit_after_lock', { key, entity: entity.name, storeId })
      return
    }

    logCache('stale_refresh_start', { key, entity: entity.name, storeId })

    if (!entity.rest || !entity.cache) {
      return
    }

    try {
      const adapter = getRestAdapter(entity.rest.adapter)
      const client = await adapter.getClientForStore(tenantId, storeId)
      if (!client) {
        logCache('skip_no_token', { key, entity: entity.name, storeId })
        return
      }

      const fetcher = client[entity.rest.list]
      if (!fetcher) {
        logCache('skip_no_fetcher', {
          key,
          entity: entity.name,
          storeId,
          method: entity.rest.list,
        })
        return
      }

      const items = await fetcher.call(client)
      logCache('api_fetch_ok', {
        key,
        entity: entity.name,
        storeId,
        itemCount: Array.isArray(items) ? items.length : 0,
      })

      const result = await syncToMongo(db, {
        collectionName: entity.mongo.collection,
        storeId,
        fetcher: () => Promise.resolve(items as Record<string, unknown>[]),
      })

      if (result.status !== 'success') {
        logCache('sync_failed', {
          key,
          entity: entity.name,
          storeId,
          error: result.errorMessage ?? 'unknown',
        })
        return
      }

      logCache('mongo_sync_ok', {
        key,
        entity: entity.name,
        storeId,
        syncedCount: result.syncedCount,
      })

      const expiresAt = await writeMeta(key, parseTtl(entity.cache.ttl), db)
      logCache('meta_written', {
        key,
        entity: entity.name,
        storeId,
        ttl: entity.cache.ttl,
        expiresAt: expiresAt.toISOString(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logCache('api_fetch_failed', { key, entity: entity.name, storeId, error: message })
    }
  })
}

export async function ensureFreshCache(
  entity: EntityDef,
  opts: EnsureFreshCacheOptions
): Promise<void> {
  if (CATEGORY_SYNC_COLLECTIONS.has(entity.mongo.collection)) {
    logCache('category_sync_skip', {
      entity: entity.name,
      collection: entity.mongo.collection,
    })
    return
  }

  if (!entity.cache) {
    logCache('skip_no_cache_directive', { entity: entity.name })
    return
  }
  if (!entity.rest) {
    logCache('skip_no_rest_adapter', { entity: entity.name })
    return
  }

  const storeIds = await resolveStoreIds(entity, opts.tenantId, opts.storeIds)
  logCache('resolve_store_ids', {
    entity: entity.name,
    storeCount: storeIds.length,
    storeIds: storeIds.join(','),
  })

  if (storeIds.length === 0) {
    logCache('skip_no_stores', { entity: entity.name })
    return
  }

  for (const storeId of storeIds) {
    await refreshStore(entity, opts.tenantId, storeId, opts.db)
  }
}
