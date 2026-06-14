import type { Document } from 'mongodb'
import type { AppContext } from '../../context.js'
import { getTokenResolver, listConnectedStoreIds } from '../../context.js'
import { ensureFreshCache, logCache, metaKey, parseTtl, writeMeta } from '../cache/index.js'
import { extractStoreIdsFromWhere } from '../diagnostics/extract-store-ids.js'
import { diagnoseEntityQuery } from '../diagnostics/generic-query.js'
import { getDb } from '../mongo/connection.js'
import { MongoRepository } from '../mongo/repository.js'
import { buildMongoSort } from '../order-by/index.js'
import { buildConnection } from '../pagination/index.js'
import type { ConnectionArgs } from '../pagination/types.js'
import { syncToMongo } from '../sync/service.js'
import { getRestAdapter } from './adapters.js'
import {
  aggregateQueryName,
  connectionQueryName,
  syncMutationName,
} from './naming.js'
import type { EntityDef } from './types.js'

async function maybeEnsureFreshCache(
  entity: EntityDef,
  where: ConnectionArgs['where'] | null | undefined,
  context?: AppContext
): Promise<void> {
  if (!entity.cache) return

  const fromWhere = extractStoreIdsFromWhere(where ?? null)
  const resolved =
    fromWhere.length > 0
      ? fromWhere
      : context?.storeId
        ? [context.storeId]
        : await listConnectedStoreIds()

  logCache('resolver_ensure_fresh', {
    entity: entity.name,
    storeCount: resolved.length,
    storeIds: resolved.join(','),
  })

  await ensureFreshCache(entity, { storeIds: resolved, db: getDb() })
}

export function makeConnectionResolver(entity: EntityDef) {
  return async (
    _parent: unknown,
    args: ConnectionArgs & { order_by?: Parameters<typeof buildMongoSort>[0] },
    context?: AppContext
  ) => {
    await maybeEnsureFreshCache(entity, args.where ?? null, context)

    const repo = new MongoRepository<Document>(getDb().collection(entity.mongo.collection))
    const sort = buildMongoSort(args.order_by ?? null) ?? { id: 1 }
    const { order_by: _orderBy, ...connectionArgs } = args
    const connection = await buildConnection(repo, connectionArgs, sort)

    if (connection.totalCount === 0) {
      connection.diagnostics = await diagnoseEntityQuery({
        entity,
        where: args.where ?? null,
        tokenResolver: getTokenResolver(),
        db: getDb(),
        syncMutationName: syncMutationName(entity.name),
      })
    }

    return connection
  }
}

export function makeAggregateResolver(entity: EntityDef) {
  return async (
    _parent: unknown,
    args: { where?: ConnectionArgs['where']; distinct_on?: ConnectionArgs['distinct_on'] },
    context?: AppContext
  ) => {
    await maybeEnsureFreshCache(entity, args.where ?? null, context)

    const repo = new MongoRepository<Document>(getDb().collection(entity.mongo.collection))
    const count = await repo.count(args.where, args.distinct_on)
    const nodes = await repo.findMany({
      where: args.where,
      distinctOn: args.distinct_on,
      limit: 100,
    })
    return {
      aggregate: { count },
      nodes,
    }
  }
}

export function makeSyncResolver(entity: EntityDef) {
  if (!entity.rest) {
    throw new Error(`Entity ${entity.name} has no @rest directive — cannot create sync resolver`)
  }

  const { adapter: adapterName, list: listMethod } = entity.rest

  return async (_parent: unknown, args: { storeId?: string | null }) => {
    const db = getDb()
    const adapter = getRestAdapter(adapterName)
    const storeIds = args.storeId
      ? [args.storeId]
      : await adapter.listConnectedStoreIds()
    const syncedAt = new Date().toISOString()
    let totalSynced = 0
    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const sid of storeIds) {
      const client = await adapter.getClientForStore(sid)
      if (!client) {
        errorCount += 1
        errors.push(`No token for store ${sid}`)
        continue
      }

      const fetcher = client[listMethod]
      if (!fetcher) {
        errorCount += 1
        errors.push(`Adapter "${adapterName}" has no method "${listMethod}"`)
        continue
      }

      const result = await syncToMongo(db, {
        collectionName: entity.mongo.collection,
        storeId: sid,
        fetcher,
      })

      totalSynced += result.syncedCount
      if (result.status === 'success') {
        successCount += 1
        if (entity.cache) {
          const key = metaKey(entity.mongo.collection, sid)
          await writeMeta(key, parseTtl(entity.cache.ttl), db)
        }
      } else {
        errorCount += 1
        if (result.errorMessage) errors.push(result.errorMessage)
      }
    }

    const status =
      errorCount === 0 ? 'success' : successCount === 0 ? 'error' : 'partial'

    return {
      syncedCount: totalSynced,
      syncedAt,
      status,
      errorMessage: errors.length > 0 ? errors.join('; ') : null,
    }
  }
}

export function bindEntityResolvers(
  entity: EntityDef
): Record<string, Record<string, unknown>> {
  const connectionField = connectionQueryName(entity.name)
  const aggregateField = aggregateQueryName(entity.name)
  const mutationField = entity.rest ? syncMutationName(entity.name) : null

  const queryResolvers: Record<string, unknown> = {
    [connectionField]: makeConnectionResolver(entity),
    [aggregateField]: makeAggregateResolver(entity),
  }

  const mutationResolvers: Record<string, unknown> = {}
  if (mutationField) {
    mutationResolvers[mutationField] = makeSyncResolver(entity)
  }

  return {
    Query: queryResolvers,
    Mutation: mutationResolvers,
  }
}
