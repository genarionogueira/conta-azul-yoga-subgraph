import { GraphQLError } from 'graphql'
import type { AppContext } from '../../../../context.js'
import { requireWorkerAuth } from '../../../../lib/auth/worker-auth.js'
import { categorySyncService } from '../../../../lib/category-sync/index.js'
import { ContaAzulRateLimitError } from '../../../../lib/conta-azul-api/errors.js'
import { createRedisClient } from '../../../../lib/redis/create-redis-client.js'
import { enqueueStoreReconcileJob, isStoreDisconnectInProgress } from '../../../../lib/sync/store-sync-job-service.js'
import { saleSyncService } from '../../../../lib/sale-sync/index.js'
import { saleItemSyncService } from '../../../../lib/sale-item-sync/index.js'
import {
  listConnectedStoreIdsForTenant,
  listTenantIds,
} from '../../../../lib/category-sync/tenant-discovery.js'

const sharedRedis = createRedisClient(process.env.REDIS_URL, 'command')

function tenantDiscoveryMode(): string {
  return process.env.TENANT_DISCOVERY_MODE?.trim() || 'scan'
}

function defaultDevTenantId(): string {
  return process.env.DEFAULT_DEV_TENANT_ID?.trim() || 'dev-tenant'
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

export async function syncConnectedStores(
  _parent: unknown,
  _args: unknown,
  context: AppContext
) {
  requireWorkerAuth(context)
  const tenantIds = await listTenantIds(
    sharedRedis,
    tenantDiscoveryMode(),
    defaultDevTenantId()
  )
  const stores: Array<{ tenantId: string; storeId: string }> = []
  for (const tenantId of tenantIds) {
    const storeIds = await listConnectedStoreIdsForTenant(
      sharedRedis,
      tenantId,
      defaultDevTenantId()
    )
    for (const storeId of storeIds) {
      if (await isStoreDisconnectInProgress(tenantId, storeId)) {
        continue
      }
      stores.push({ tenantId, storeId })
    }
  }
  return stores
}

export async function syncCategories(
  _parent: unknown,
  args: { tenantId: string; storeId: string; trigger?: string | null },
  context: AppContext
) {
  requireWorkerAuth(context)
  try {
    const result = await categorySyncService.syncStore(
      args.tenantId,
      args.storeId,
      args.trigger ?? 'worker'
    )
    return {
      storeId: result.storeId,
      synced: result.synced,
      deleted: result.deleted,
      errors: result.errors,
    }
  } catch (err) {
    mapRateLimitError(err)
  }
}

export async function syncSales(
  _parent: unknown,
  args: { tenantId: string; storeId: string; trigger?: string | null },
  context: AppContext
) {
  requireWorkerAuth(context)
  try {
    const result = await saleSyncService.syncSales(
      args.tenantId,
      args.storeId,
      args.trigger ?? 'worker'
    )
    return {
      storeId: result.storeId,
      synced: result.synced,
      deleted: result.deleted,
      errors: result.errors,
      changedSaleIds: result.changedSaleIds,
    }
  } catch (err) {
    mapRateLimitError(err)
  }
}

export async function syncSaleItems(
  _parent: unknown,
  args: {
    tenantId: string
    storeId: string
    saleId: string
    trigger?: string | null
  },
  context: AppContext
) {
  requireWorkerAuth(context)
  try {
    const result = await saleItemSyncService.syncSaleItemsForSale(
      args.tenantId,
      args.storeId,
      args.saleId,
      args.trigger ?? 'worker'
    )
    return {
      storeId: result.storeId,
      saleId: result.saleId,
      synced: result.synced,
      deleted: result.deleted,
      errors: result.errors,
    }
  } catch (err) {
    mapRateLimitError(err)
  }
}

export async function enqueueReconcileStore(
  _parent: unknown,
  args: {
    tenantId: string
    storeId: string
    trigger?: string | null
    mode?: 'BACKFILL' | 'INCREMENTAL' | null
  },
  context: AppContext
) {
  requireWorkerAuth(context)
  const { jobId } = await enqueueStoreReconcileJob(sharedRedis, {
    tenantId: args.tenantId,
    storeId: args.storeId,
    trigger: args.trigger ?? 'manual',
    mode: args.mode ?? 'INCREMENTAL',
  })
  return { enqueued: true, jobId }
}
