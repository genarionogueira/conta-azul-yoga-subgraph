import type { AppContext } from '../../../../context.js'
import { requireWorkerAuth } from '../../../../lib/auth/worker-auth.js'
import { categorySyncService } from '../../../../lib/category-sync/index.js'

export async function reconcileStore(
  _parent: unknown,
  args: { storeId: string; tenantId: string; trigger?: string | null },
  context: AppContext
) {
  requireWorkerAuth(context)
  const result = await categorySyncService.syncStore(
    args.tenantId,
    args.storeId,
    args.trigger ?? 'manual'
  )
  return {
    storeId: result.storeId,
    synced: result.synced,
    deleted: result.deleted,
    errors: result.errors,
  }
}

export async function reconcileAll(
  _parent: unknown,
  args: { trigger?: string | null },
  context: AppContext
) {
  requireWorkerAuth(context)
  const result = await categorySyncService.reconcileAll(args.trigger ?? 'scheduled')
  return {
    status: result.status,
    syncedCount: result.syncedCount,
    storesProcessed: result.storesProcessed,
    successCount: result.successCount,
    errorCount: result.errorCount,
    storeResults: result.storeResults.map((store) => ({
      tenantId: store.tenantId,
      storeId: store.storeId,
      status: store.status,
      syncedCount: store.syncedCount,
      skippedCount: store.skippedCount,
      errorMessage: store.errorMessage ?? null,
    })),
  }
}

export async function disconnectStoreData(
  _parent: unknown,
  args: { storeId: string; tenantId: string },
  context: AppContext
) {
  requireWorkerAuth(context)
  const result = await categorySyncService.disconnectStoreData(
    args.tenantId,
    args.storeId
  )
  return {
    storeId: result.storeId,
    deleted: result.deleted,
  }
}
