import type { Redis } from 'ioredis'
import type { Db } from 'mongodb'
import type { ConnectionRepository } from '../connections/connection-repository.js'
import { createLimitedContaAzulClient } from '../conta-azul-api/client-factory.js'
import { ContaAzulRateLimitError } from '../conta-azul-api/errors.js'
import { salesDateWindow } from '../conta-azul-client.js'
import {
  getSalesWatermark,
  maxDataAlteracao,
  setSalesWatermark,
  shrinkWindowStart,
} from '../sync/watermark.js'
import {
  findChangedSaleIds,
  type SyncSalesResult,
} from './changed-sales.js'
import {
  TenantTokenStore,
  TokenNotFoundError,
} from '../credentials/tenant-token-store.js'
import { META_COLLECTION, type CacheMetaDocument } from '../cache/meta.js'
import {
  createSyncEventPublisher,
  type SyncEvent,
  type SyncEventPublisher,
} from '../category-sync/sync-event-publisher.js'
import {
  listConnectedStoreIdsForTenant,
  listTenantIds,
} from '../category-sync/tenant-discovery.js'
import { reconcileSalesToMongo } from './reconcile-mongo.js'
import type {
  ReconcileAllResult,
  SaleItem,
  StorePollResult,
  SyncResult,
} from './types.js'

function salesCollectionName(): string {
  return process.env.SALES_COLLECTION?.trim() || 'sales'
}

function tenantDiscoveryMode(): string {
  return process.env.TENANT_DISCOVERY_MODE?.trim() || 'scan'
}

function defaultDevTenantId(): string {
  return process.env.DEFAULT_DEV_TENANT_ID?.trim() || 'dev-tenant'
}

function normalizeSale(item: {
  id: string
  numero?: number | null
  data?: string | null
  dataAlteracao?: string | null
  tipo?: string | null
  situacaoNome?: string | null
  situacaoDescricao?: string | null
  clienteNome?: string | null
  clienteId?: string | null
  origem?: string | null
}): SaleItem | null {
  if (!item.id) return null
  return {
    id: String(item.id),
    numero: item.numero ?? null,
    data: item.data ?? null,
    dataAlteracao: item.dataAlteracao ?? null,
    tipo: item.tipo ?? null,
    situacaoNome: item.situacaoNome ?? null,
    situacaoDescricao: item.situacaoDescricao ?? null,
    clienteNome: item.clienteNome ?? null,
    clienteId: item.clienteId ?? null,
    origem: item.origem ?? null,
  }
}

export class SaleSyncService {
  private readonly eventPublisher: SyncEventPublisher

  constructor(
    private readonly tokenStore: TenantTokenStore,
    private readonly redis: Redis,
    private readonly getDb: () => Db,
    eventPublisher?: SyncEventPublisher,
    private readonly connectionRepository?: ConnectionRepository
  ) {
    this.eventPublisher =
      eventPublisher ?? createSyncEventPublisher(redis)
  }

  private async publishEvent(event: SyncEvent): Promise<void> {
    await this.eventPublisher.publish(event)
  }

  async syncSales(
    tenantId: string,
    storeId: string,
    trigger?: string | null
  ): Promise<SyncSalesResult> {
    const startedAt = performance.now()

    try {
      const token = await this.tokenStore.ensureFreshToken(tenantId, storeId)
      const client = createLimitedContaAzulClient(
        this.redis,
        token.access_token,
        tenantId,
        storeId
      )
      const window = salesDateWindow()
      const watermark = await getSalesWatermark(this.redis, tenantId, storeId)
      const dataInicio = shrinkWindowStart(watermark, window.data_inicio)
      const rawSales = await client.listVendas({
        dataInicio,
        dataFim: window.data_fim,
      })
      const items = rawSales
        .map(normalizeSale)
        .filter((item): item is NonNullable<typeof item> => item !== null)

      const changedBefore = await findChangedSaleIds(
        this.getDb(),
        salesCollectionName(),
        tenantId,
        storeId,
        items
      )

      const { synced, deleted } = await reconcileSalesToMongo(
        this.getDb(),
        salesCollectionName(),
        tenantId,
        storeId,
        items,
        this.connectionRepository
          ? (await this.connectionRepository.findActiveByStoreId(tenantId, storeId))
              ?.connectionId
          : undefined
      )

      const changedSaleIds = changedBefore
      const nextWatermark = maxDataAlteracao(items.map((item) => item.dataAlteracao))
      if (nextWatermark) {
        await setSalesWatermark(this.redis, tenantId, storeId, nextWatermark)
      }

      const result: SyncSalesResult = {
        storeId,
        synced,
        deleted,
        errors: [],
        changedSaleIds,
      }

      if (trigger != null) {
        await this.publishReconcileStoreEvents({
          tenantId,
          storeId,
          trigger,
          result,
          startedAt,
        })
      }

      return result
    } catch (err) {
      if (err instanceof TokenNotFoundError) {
        return {
          storeId,
          synced: 0,
          deleted: 0,
          errors: ['token_not_found'],
          changedSaleIds: [],
        }
      }
      if (err instanceof ContaAzulRateLimitError) {
        throw err
      }

      const message = err instanceof Error ? err.message : String(err)
      const result: SyncSalesResult = {
        storeId,
        synced: 0,
        deleted: 0,
        errors: [message],
        changedSaleIds: [],
      }

      if (trigger != null) {
        await this.publishReconcileStoreEvents({
          tenantId,
          storeId,
          trigger,
          result,
          startedAt,
        })
      }

      return result
    }
  }

  async syncStore(
    tenantId: string,
    storeId: string,
    trigger?: string | null
  ): Promise<SyncResult> {
    const result = await this.syncSales(tenantId, storeId, trigger)
    return {
      storeId: result.storeId,
      synced: result.synced,
      deleted: result.deleted,
      errors: result.errors,
    }
  }

  private async publishReconcileStoreEvents(args: {
    tenantId: string
    storeId: string
    trigger: string
    result: SyncResult
    startedAt: number
  }): Promise<void> {
    if (args.result.errors.includes('token_not_found')) {
      return
    }

    const durationMs = Math.round(performance.now() - args.startedAt)

    await this.publishEvent({
      type: 'reconcile.sales.started',
      tenantId: args.tenantId,
      storeId: args.storeId,
      trigger: args.trigger,
    })

    if (args.result.errors.length > 0) {
      await this.publishEvent({
        type: 'reconcile.sales.failed',
        tenantId: args.tenantId,
        storeId: args.storeId,
        trigger: args.trigger,
        error: args.result.errors.join('; '),
        durationMs,
      })
      return
    }

    await this.publishEvent({
      type: 'reconcile.sales.completed',
      tenantId: args.tenantId,
      storeId: args.storeId,
      trigger: args.trigger,
      status: 'success',
      inserted: args.result.synced,
      updated: 0,
      deleted: args.result.deleted,
      skipped: 0,
      durationMs,
    })
  }

  async reconcileStore(
    tenantId: string,
    storeId: string,
    trigger?: string | null
  ): Promise<StorePollResult> {
    const result = await this.syncStore(tenantId, storeId, trigger)

    if (result.errors.includes('token_not_found')) {
      return {
        tenantId,
        storeId,
        status: 'skipped',
        syncedCount: 0,
        skippedCount: 1,
      }
    }

    if (result.errors.length > 0) {
      return {
        tenantId,
        storeId,
        status: 'error',
        syncedCount: 0,
        skippedCount: 0,
        errorMessage: result.errors.join('; '),
      }
    }

    return {
      tenantId,
      storeId,
      status: 'success',
      syncedCount: result.synced,
      skippedCount: 0,
    }
  }

  async reconcileAll(trigger = 'scheduled'): Promise<ReconcileAllResult> {
    const tenantIds = await listTenantIds(
      this.redis,
      tenantDiscoveryMode(),
      defaultDevTenantId()
    )

    if (tenantIds.length === 0) {
      return {
        status: 'success',
        syncedCount: 0,
        storesProcessed: 0,
        successCount: 0,
        errorCount: 0,
        storeResults: [],
      }
    }

    const storeResults: StorePollResult[] = []
    let totalSynced = 0
    let successCount = 0
    let errorCount = 0

    for (const tenantId of tenantIds) {
      const storeIds = await listConnectedStoreIdsForTenant(
        this.redis,
        tenantId,
        defaultDevTenantId()
      )
      for (const storeId of storeIds) {
        const result = await this.reconcileStore(tenantId, storeId, trigger)
        storeResults.push(result)
        if (result.status === 'success') {
          successCount += 1
          totalSynced += result.syncedCount
        } else if (result.status === 'error') {
          errorCount += 1
        }
      }
    }

    let status: ReconcileAllResult['status'] = 'success'
    if (errorCount > 0 && successCount === 0) {
      status = 'error'
    } else if (errorCount > 0) {
      status = 'partial'
    }

    await this.publishEvent({
      type: 'reconcile.sales.cycle.completed',
      tenantId: '*',
      status,
      storesProcessed: storeResults.length,
      successCount,
      errorCount,
      trigger,
    })

    return {
      status,
      syncedCount: totalSynced,
      storesProcessed: storeResults.length,
      successCount,
      errorCount,
      storeResults,
    }
  }

  async deleteStoreSales(tenantId: string, storeId: string): Promise<number> {
    const db = this.getDb()
    const collectionName = salesCollectionName()
    const col = db.collection(collectionName)

    const result = await col.deleteMany({ tenantId, storeId })
    const metaId = `${collectionName}:${storeId}`
    await db.collection<CacheMetaDocument>(META_COLLECTION).deleteOne({ _id: metaId })

    await this.publishEvent({
      type: 'store.sales_deleted',
      tenantId,
      storeId,
      deletedCount: result.deletedCount,
    })

    return result.deletedCount
  }
}
