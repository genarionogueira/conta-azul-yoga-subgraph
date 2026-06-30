import type { Redis } from 'ioredis'
import type { Db } from 'mongodb'
import type { ConnectionRepository } from '../connections/connection-repository.js'
import { createLimitedContaAzulClient } from '../conta-azul-api/client-factory.js'
import { ContaAzulRateLimitError } from '../conta-azul-api/errors.js'
import {
  TenantTokenStore,
  TokenNotFoundError,
} from '../credentials/tenant-token-store.js'
import { META_COLLECTION, type CacheMetaDocument } from '../cache/meta.js'
import { reconcileCategoriesToMongo } from './reconcile-mongo.js'
import {
  createSyncEventPublisher,
  type SyncEvent,
  type SyncEventPublisher,
} from './sync-event-publisher.js'
import { listConnectedStoreIdsForTenant, listTenantIds } from './tenant-discovery.js'
import { isStoreDisconnectInProgress } from '../sync/store-sync-job-service.js'
import type {
  DisconnectStoreDataResult,
  ReconcileAllResult,
  StorePollResult,
  SyncResult,
} from './types.js'

function categoriesCollectionName(): string {
  return process.env.CATEGORIES_COLLECTION?.trim() || 'conta_azul_categories'
}

function tenantDiscoveryMode(): string {
  return process.env.TENANT_DISCOVERY_MODE?.trim() || 'scan'
}

function defaultDevTenantId(): string {
  return process.env.DEFAULT_DEV_TENANT_ID?.trim() || 'dev-tenant'
}

function normalizeCategory(item: {
  id: string
  nome: string
  tipo: string
}): { id: string; nome: string; tipo: string } | null {
  if (!item.id || !item.nome || !item.tipo) return null
  return { id: String(item.id), nome: String(item.nome), tipo: String(item.tipo) }
}

export class CategorySyncService {
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
      const rawCategories = await client.listCategorias()
      const items = rawCategories
        .map(normalizeCategory)
        .filter((item): item is NonNullable<typeof item> => item !== null)

      const { synced, deleted } = await reconcileCategoriesToMongo(
        this.getDb(),
        categoriesCollectionName(),
        tenantId,
        storeId,
        items,
        this.connectionRepository
          ? (await this.connectionRepository.findActiveByStoreId(tenantId, storeId))
              ?.connectionId
          : undefined
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
      if (err instanceof ContaAzulRateLimitError) {
        throw err
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
    result: SyncResult
    startedAt: number
  }): Promise<void> {
    if (args.result.errors.includes('token_not_found')) {
      return
    }

    const durationMs = Math.round(performance.now() - args.startedAt)

    await this.publishEvent({
      type: 'reconcile.started',
      tenantId: args.tenantId,
      storeId: args.storeId,
      trigger: args.trigger,
    })

    if (args.result.errors.length > 0) {
      await this.publishEvent({
        type: 'reconcile.failed',
        tenantId: args.tenantId,
        storeId: args.storeId,
        trigger: args.trigger,
        error: args.result.errors.join('; '),
        durationMs,
      })
      return
    }

    await this.publishEvent({
      type: 'reconcile.completed',
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
        if (await isStoreDisconnectInProgress(tenantId, storeId)) {
          continue
        }
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
      type: 'reconcile.cycle.completed',
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

  async disconnectStoreData(
    tenantId: string,
    storeId: string
  ): Promise<DisconnectStoreDataResult> {
    const db = this.getDb()
    const collectionName = categoriesCollectionName()
    const col = db.collection(collectionName)

    const result = await col.deleteMany({ tenantId, storeId })
    const metaId = `${collectionName}:${storeId}`
    await db.collection<CacheMetaDocument>(META_COLLECTION).deleteOne({ _id: metaId })

    await this.publishEvent({
      type: 'store.data_deleted',
      tenantId,
      storeId,
      deletedCount: result.deletedCount,
    })

    return {
      storeId,
      deleted: result.deletedCount,
    }
  }

  async deleteStoreCategories(tenantId: string, storeId: string): Promise<number> {
    return (await this.disconnectStoreData(tenantId, storeId)).deleted
  }
}
