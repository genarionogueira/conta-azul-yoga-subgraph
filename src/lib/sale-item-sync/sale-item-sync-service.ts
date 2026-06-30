import type { Redis } from 'ioredis'
import type { Db } from 'mongodb'
import type { ConnectionRepository } from '../connections/connection-repository.js'
import { createLimitedContaAzulClient } from '../conta-azul-api/client-factory.js'
import { ContaAzulRateLimitError } from '../conta-azul-api/errors.js'
import { markSaleItemsSynced } from '../sale-sync/changed-sales.js'
import {
  TenantTokenStore,
  TokenNotFoundError,
} from '../credentials/tenant-token-store.js'
import {
  createSyncEventPublisher,
  type SyncEvent,
  type SyncEventPublisher,
} from '../category-sync/sync-event-publisher.js'
import {
  listConnectedStoreIdsForTenant,
  listTenantIds,
} from '../category-sync/tenant-discovery.js'
import {
  pruneOrphanSaleItems,
  reconcileSaleItemsForSale,
} from './reconcile-mongo.js'
import type {
  ReconcileAllResult,
  StorePollResult,
  SyncResult,
  SyncSaleItemsResult,
} from './types.js'

const SALE_ITEM_FETCH_CONCURRENCY = 5

function salesCollectionName(): string {
  return process.env.SALES_COLLECTION?.trim() || 'sales'
}

function saleItemsCollectionName(): string {
  return process.env.SALE_ITEMS_COLLECTION?.trim() || 'sale_items'
}

function tenantDiscoveryMode(): string {
  return process.env.TENANT_DISCOVERY_MODE?.trim() || 'scan'
}

function defaultDevTenantId(): string {
  return process.env.DEFAULT_DEV_TENANT_ID?.trim() || 'dev-tenant'
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

export class SaleItemSyncService {
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

  private async listSaleIdsForStore(
    tenantId: string,
    storeId: string
  ): Promise<string[]> {
    const col = this.getDb().collection(salesCollectionName())
    const docs = await col
      .find({ tenantId, storeId }, { projection: { id: 1 } })
      .limit(10_000)
      .toArray()
    return docs
      .map((doc) => (doc.id != null ? String(doc.id) : null))
      .filter((id): id is string => id !== null)
  }

  private async resolveConnectionId(
    tenantId: string,
    storeId: string
  ): Promise<string | undefined> {
    if (!this.connectionRepository) {
      return undefined
    }
    return (await this.connectionRepository.findActiveByStoreId(tenantId, storeId))
      ?.connectionId
  }

  async syncSaleItemsForSale(
    tenantId: string,
    storeId: string,
    saleId: string,
    trigger?: string | null
  ): Promise<SyncSaleItemsResult> {
    const startedAt = performance.now()

    try {
      const token = await this.tokenStore.ensureFreshToken(tenantId, storeId)
      const client = createLimitedContaAzulClient(
        this.redis,
        token.access_token,
        tenantId,
        storeId
      )
      const collectionName = saleItemsCollectionName()
      const salesCollection = salesCollectionName()
      const db = this.getDb()

      const saleDoc = await db.collection(salesCollection).findOne(
        { tenantId, storeId, id: saleId },
        { projection: { dataAlteracao: 1 } }
      )
      const lines = await client.listVendaItens(saleId)
      const connectionId = await this.resolveConnectionId(tenantId, storeId)
      const result = await reconcileSaleItemsForSale(
        db,
        collectionName,
        tenantId,
        storeId,
        saleId,
        lines,
        connectionId
      )

      const dataAlteracao =
        saleDoc?.dataAlteracao != null ? String(saleDoc.dataAlteracao) : null
      await markSaleItemsSynced(
        db,
        salesCollection,
        tenantId,
        storeId,
        saleId,
        dataAlteracao
      )

      const syncResult: SyncSaleItemsResult = {
        storeId,
        saleId,
        synced: result.synced,
        deleted: result.deleted,
        errors: [],
      }

      if (trigger != null) {
        await this.publishReconcileStoreEvents({
          tenantId,
          storeId,
          trigger,
          result: syncResult,
          startedAt,
        })
      }

      return syncResult
    } catch (err) {
      if (err instanceof TokenNotFoundError) {
        return {
          storeId,
          saleId,
          synced: 0,
          deleted: 0,
          errors: ['token_not_found'],
        }
      }
      if (err instanceof ContaAzulRateLimitError) {
        throw err
      }

      const message = err instanceof Error ? err.message : String(err)
      const syncResult: SyncSaleItemsResult = {
        storeId,
        saleId,
        synced: 0,
        deleted: 0,
        errors: [message],
      }

      if (trigger != null) {
        await this.publishReconcileStoreEvents({
          tenantId,
          storeId,
          trigger,
          result: syncResult,
          startedAt,
        })
      }

      return syncResult
    }
  }

  async syncStore(
    tenantId: string,
    storeId: string,
    trigger?: string | null
  ): Promise<SyncResult> {
    const startedAt = performance.now()

    try {
      const token = await this.tokenStore.ensureFreshToken(tenantId, storeId)
      const client = createLimitedContaAzulClient(
        this.redis,
        token.access_token,
        tenantId,
        storeId
      )
      const saleIds = await this.listSaleIdsForStore(tenantId, storeId)
      const collectionName = saleItemsCollectionName()
      const db = this.getDb()
      const connectionId = await this.resolveConnectionId(tenantId, storeId)

      let synced = 0
      let deleted = 0

      await mapInBatches(saleIds, SALE_ITEM_FETCH_CONCURRENCY, async (saleId) => {
        const lines = await client.listVendaItens(saleId)
        const result = await reconcileSaleItemsForSale(
          db,
          collectionName,
          tenantId,
          storeId,
          saleId,
          lines,
          connectionId
        )
        synced += result.synced
        deleted += result.deleted
      })

      deleted += await pruneOrphanSaleItems(
        db,
        collectionName,
        tenantId,
        storeId,
        saleIds
      )

      const result: SyncResult = {
        storeId,
        synced,
        deleted,
        errors: [],
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
        }
      }

      const message = err instanceof Error ? err.message : String(err)
      const result: SyncResult = {
        storeId,
        synced: 0,
        deleted: 0,
        errors: [message],
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

  private async publishReconcileStoreEvents(args: {
    tenantId: string
    storeId: string
    trigger: string
    result: Pick<SyncResult, 'storeId' | 'synced' | 'deleted' | 'errors'>
    startedAt: number
  }): Promise<void> {
    if (args.result.errors.includes('token_not_found')) {
      return
    }

    const durationMs = Math.round(performance.now() - args.startedAt)

    await this.publishEvent({
      type: 'reconcile.sale_items.started',
      tenantId: args.tenantId,
      storeId: args.storeId,
      trigger: args.trigger,
    })

    if (args.result.errors.length > 0) {
      await this.publishEvent({
        type: 'reconcile.sale_items.failed',
        tenantId: args.tenantId,
        storeId: args.storeId,
        trigger: args.trigger,
        error: args.result.errors.join('; '),
        durationMs,
      })
      return
    }

    await this.publishEvent({
      type: 'reconcile.sale_items.completed',
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
      type: 'reconcile.sale_items.cycle.completed',
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

  async deleteStoreSaleItems(tenantId: string, storeId: string): Promise<number> {
    const col = this.getDb().collection(saleItemsCollectionName())
    const result = await col.deleteMany({ tenantId, storeId })

    await this.publishEvent({
      type: 'store.sale_items_deleted',
      tenantId,
      storeId,
      deletedCount: result.deletedCount,
    })

    return result.deletedCount
  }
}
