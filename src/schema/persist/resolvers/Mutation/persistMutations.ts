import { GraphQLError } from 'graphql'
import type { AppContext } from '../../../../context.js'
import { requireWorkerAuth } from '../../../../lib/auth/worker-auth.js'
import { ContaAzulRateLimitError } from '../../../../lib/conta-azul-api/errors.js'
import { createSyncEventPublisher } from '../../../../lib/category-sync/sync-event-publisher.js'
import { getDb } from '../../../../lib/mongo/connection.js'
import {
  publishPersistReconcileCompleted,
  publishPersistReconcileFailed,
  publishPersistReconcileStarted,
  type PersistResource,
} from '../../../../lib/persist/persist-events.js'
import { createRedisClient } from '../../../../lib/redis/create-redis-client.js'
import { connectionRepository } from '../../../../lib/credentials/index.js'
import { restFetchService } from '../../../../lib/rest-fetch/index.js'
import { markSaleItemsSynced } from '../../../../lib/sale-sync/changed-sales.js'
import {
  getSalesWatermark,
  maxDataAlteracao,
  setSalesWatermark,
} from '../../../../lib/sync/watermark.js'
import {
  persistToCollection,
  salesCollectionName,
  saleItemsCollectionName,
  vendedoresCollectionName,
  type PersistDocumentInput,
  type PersistMode,
} from '../../../../lib/persist/index.js'

const sharedRedis = createRedisClient(process.env.REDIS_URL, 'command')
const eventPublisher = createSyncEventPublisher(sharedRedis)

async function resolveActiveConnectionId(
  tenantId: string,
  storeId: string
): Promise<string | undefined> {
  try {
    return (await connectionRepository.findActiveByStoreId(tenantId, storeId))?.connectionId
  } catch {
    return undefined
  }
}

function asPersistDocuments(
  documents: Array<{ id: string; saleId?: string | null; data: unknown }>
): PersistDocumentInput[] {
  return documents.map((doc) => {
    if (doc.data === null || typeof doc.data !== 'object' || Array.isArray(doc.data)) {
      throw new GraphQLError('Invalid persist document: data must be a JSON object')
    }
    return {
      id: doc.id,
      saleId: doc.saleId,
      data: doc.data as Record<string, unknown>,
    }
  })
}

function mapRawSaleItem(
  item: Record<string, unknown>,
  saleId: string
): PersistDocumentInput {
  return {
    id: String(item.id),
    saleId,
    data: {
      produtoId: item.id_item,
      nome: item.nome,
      descricao: item.descricao,
      tipo: item.tipo,
      quantidade: item.quantidade,
      valor: item.valor,
      custo: item.custo,
    },
  }
}

function mapRateLimitError(err: unknown): never {
  if (err instanceof ContaAzulRateLimitError) {
    throw new GraphQLError('RATE_LIMITED', {
      extensions: {
        code: 'RATE_LIMITED',
        retryAfterMs: err.retryAfterMs,
      },
    })
  }
  throw err
}

async function withPersistEvents<T extends { synced: number; deleted: number; errors?: string[] }>(
  args: {
    resource: PersistResource
    tenantId: string
    storeId: string
    trigger?: string | null
    run: () => Promise<T>
  }
): Promise<T> {
  if (!args.trigger) {
    return args.run()
  }

  const startedAt = performance.now()
  await publishPersistReconcileStarted({
    resource: args.resource,
    tenantId: args.tenantId,
    storeId: args.storeId,
    trigger: args.trigger,
    eventPublisher,
  })

  try {
    const result = await args.run()
    await publishPersistReconcileCompleted({
      resource: args.resource,
      tenantId: args.tenantId,
      storeId: args.storeId,
      trigger: args.trigger,
      result: {
        synced: result.synced,
        deleted: result.deleted,
        errors: result.errors ?? [],
      },
      startedAt,
      eventPublisher,
    })
    return result
  } catch (error) {
    await publishPersistReconcileFailed({
      resource: args.resource,
      tenantId: args.tenantId,
      storeId: args.storeId,
      trigger: args.trigger,
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      eventPublisher,
    })
    throw error
  }
}

export async function persistSales(
  _parent: unknown,
  args: {
    tenantId: string
    storeId: string
    documents: Array<{ id: string; saleId?: string | null; data: unknown }>
    mode?: PersistMode | null
    trigger?: string | null
  },
  context: AppContext
) {
  requireWorkerAuth(context)
  const documents = asPersistDocuments(args.documents)
  const mode = args.mode ?? 'UPSERT'
  const connectionId = await resolveActiveConnectionId(args.tenantId, args.storeId)

  const result = await withPersistEvents({
    resource: 'sales',
    tenantId: args.tenantId,
    storeId: args.storeId,
    trigger: args.trigger,
    run: async () =>
      persistToCollection(
        getDb(),
        salesCollectionName(),
        args.tenantId,
        args.storeId,
        documents,
        mode,
        { connectionId }
      ),
  })

  const nextWatermark = maxDataAlteracao(
    documents.map((doc) => {
      const data = doc.data as Record<string, unknown>
      return typeof data.dataAlteracao === 'string' ? data.dataAlteracao : null
    })
  )
  if (nextWatermark) {
    const current = await getSalesWatermark(sharedRedis, args.tenantId, args.storeId)
    if (!current || nextWatermark > current) {
      await setSalesWatermark(sharedRedis, args.tenantId, args.storeId, nextWatermark)
    }
  }
  return { storeId: args.storeId, ...result, errors: [] }
}

export async function persistSaleItems(
  _parent: unknown,
  args: {
    tenantId: string
    storeId: string
    saleId: string
    documents: Array<{ id: string; saleId?: string | null; data: unknown }>
    mode?: PersistMode | null
    trigger?: string | null
  },
  context: AppContext
) {
  requireWorkerAuth(context)
  const documents = asPersistDocuments(args.documents)
  const mode = args.mode ?? 'UPSERT'
  const connectionId = await resolveActiveConnectionId(args.tenantId, args.storeId)

  const result = await withPersistEvents({
    resource: 'sale_items',
    tenantId: args.tenantId,
    storeId: args.storeId,
    trigger: args.trigger,
    run: async () =>
      persistToCollection(
        getDb(),
        saleItemsCollectionName(),
        args.tenantId,
        args.storeId,
        documents,
        mode,
        { saleId: args.saleId, connectionId }
      ),
  })

  return { storeId: args.storeId, ...result, errors: [] }
}

export async function fetchAndPersistSaleItems(
  _parent: unknown,
  args: {
    tenantId: string
    storeId: string
    saleId: string
    mode?: PersistMode | null
    trigger?: string | null
  },
  context: AppContext
) {
  requireWorkerAuth(context)
  const mode = args.mode ?? 'RECONCILE'
  const salesCollection = salesCollectionName()
  const db = getDb()

  let fetchResult
  try {
    fetchResult = await restFetchService.fetchVendaItens(
      args.tenantId,
      args.storeId,
      args.saleId
    )
  } catch (err) {
    mapRateLimitError(err)
  }

  const rawItems = (fetchResult.items ?? []).filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && (item as Record<string, unknown>).id != null
  )
  const documents = rawItems.map((item) => mapRawSaleItem(item, args.saleId))
  const connectionId = await resolveActiveConnectionId(args.tenantId, args.storeId)

  const result = await withPersistEvents({
    resource: 'sale_items',
    tenantId: args.tenantId,
    storeId: args.storeId,
    trigger: args.trigger,
    run: async () =>
      persistToCollection(
        db,
        saleItemsCollectionName(),
        args.tenantId,
        args.storeId,
        documents,
        mode,
        { saleId: args.saleId, connectionId }
      ),
  })

  const saleDoc = await db.collection(salesCollection).findOne(
    { tenantId: args.tenantId, storeId: args.storeId, id: args.saleId },
    { projection: { dataAlteracao: 1 } }
  )
  const dataAlteracao =
    saleDoc?.dataAlteracao != null ? String(saleDoc.dataAlteracao) : null
  await markSaleItemsSynced(
    db,
    salesCollection,
    args.tenantId,
    args.storeId,
    args.saleId,
    dataAlteracao
  )

  return {
    storeId: args.storeId,
    saleId: args.saleId,
    ...result,
    errors: [],
  }
}

export async function persistVendedores(
  _parent: unknown,
  args: {
    tenantId: string
    storeId: string
    documents: Array<{ id: string; saleId?: string | null; data: unknown }>
    mode?: PersistMode | null
    trigger?: string | null
  },
  context: AppContext
) {
  requireWorkerAuth(context)
  const documents = asPersistDocuments(args.documents)
  const mode = args.mode ?? 'UPSERT'
  const connectionId = await resolveActiveConnectionId(args.tenantId, args.storeId)

  const result = await withPersistEvents({
    resource: 'vendedores',
    tenantId: args.tenantId,
    storeId: args.storeId,
    trigger: args.trigger,
    run: async () =>
      persistToCollection(
        getDb(),
        vendedoresCollectionName(),
        args.tenantId,
        args.storeId,
        documents,
        mode,
        { connectionId }
      ),
  })

  return { storeId: args.storeId, ...result, errors: [] }
}
