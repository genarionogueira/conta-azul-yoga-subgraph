import type { Document } from 'mongodb'
import { getTokenResolver } from '../../context.js'
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

export function makeConnectionResolver(entity: EntityDef) {
  return async (
    _parent: unknown,
    args: ConnectionArgs & { order_by?: Parameters<typeof buildMongoSort>[0] }
  ) => {
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
    args: { where?: ConnectionArgs['where']; distinct_on?: ConnectionArgs['distinct_on'] }
  ) => {
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
