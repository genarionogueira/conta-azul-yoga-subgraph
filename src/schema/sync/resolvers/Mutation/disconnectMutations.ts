import type { AppContext } from '../../../../context.js'
import { requireWorkerAuth } from '../../../../lib/auth/worker-auth.js'
import { categorySyncService } from '../../../../lib/category-sync/index.js'
import {
  connectionRepository,
  tenantTokenStore,
} from '../../../../lib/credentials/index.js'
import { createRedisClient } from '../../../../lib/redis/create-redis-client.js'
import { saleSyncService } from '../../../../lib/sale-sync/index.js'
import { saleItemSyncService } from '../../../../lib/sale-item-sync/index.js'
import {
  cleanupStoreDisconnectMetadata,
  deleteStoreVendedores,
} from '../../../../lib/sync/disconnect-store-data.js'

const sharedRedis = createRedisClient(process.env.REDIS_URL, 'command')

export async function deleteStoreSaleItemsPhase(
  _parent: unknown,
  args: { tenantId: string; storeId: string },
  context: AppContext
) {
  requireWorkerAuth(context)
  const deleted = await saleItemSyncService.deleteStoreSaleItems(
    args.tenantId,
    args.storeId
  )
  return { deleted }
}

export async function deleteStoreSalesPhase(
  _parent: unknown,
  args: { tenantId: string; storeId: string },
  context: AppContext
) {
  requireWorkerAuth(context)
  const deleted = await saleSyncService.deleteStoreSales(args.tenantId, args.storeId)
  return { deleted }
}

export async function deleteStoreCategoriesPhase(
  _parent: unknown,
  args: { tenantId: string; storeId: string },
  context: AppContext
) {
  requireWorkerAuth(context)
  const deleted = await categorySyncService.deleteStoreCategories(
    args.tenantId,
    args.storeId
  )
  return { deleted }
}

export async function deleteStoreVendedoresPhase(
  _parent: unknown,
  args: { tenantId: string; storeId: string },
  context: AppContext
) {
  requireWorkerAuth(context)
  const deleted = await deleteStoreVendedores(args.tenantId, args.storeId)
  return { deleted }
}

export async function cleanupStoreDisconnectMetadataMutation(
  _parent: unknown,
  args: { tenantId: string; storeId: string; jobId: string },
  context: AppContext
) {
  requireWorkerAuth(context)
  await cleanupStoreDisconnectMetadata(
    sharedRedis,
    args.tenantId,
    args.storeId,
    args.jobId
  )
  return { ok: true }
}

export async function finalizeStoreDisconnect(
  _parent: unknown,
  args: { tenantId: string; storeId: string; connectionId?: string },
  context: AppContext
) {
  requireWorkerAuth(context)
  const conn =
    args.connectionId != null
      ? await connectionRepository.findByConnectionId(args.tenantId, args.connectionId)
      : await connectionRepository.findActiveByStoreId(args.tenantId, args.storeId)

  if (!conn) {
    return { success: false }
  }

  const storeId = conn.storeId ?? conn.id ?? args.storeId
  await tenantTokenStore.deleteConnection(args.tenantId, conn.connectionId, storeId)
  await connectionRepository.softDisconnect(args.tenantId, conn.connectionId)
  return { success: true }
}
