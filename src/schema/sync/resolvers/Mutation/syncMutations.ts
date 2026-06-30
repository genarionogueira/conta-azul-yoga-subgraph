import type { AppContext } from '../../../../context.js'
import { requireWorkerAuth } from '../../../../lib/auth/worker-auth.js'
import { categorySyncService } from '../../../../lib/category-sync/index.js'
import { saleSyncService } from '../../../../lib/sale-sync/index.js'
import { saleItemSyncService } from '../../../../lib/sale-item-sync/index.js'

function mergeStatus(
  left: 'success' | 'partial' | 'error',
  right: 'success' | 'partial' | 'error'
): 'success' | 'partial' | 'error' {
  if (left === 'error' && right === 'error') {
    return 'error'
  }
  if (left === 'success' && right === 'success') {
    return 'success'
  }
  return 'partial'
}

function mergeStoreErrors(...errorLists: string[][]): string[] {
  return errorLists.flat().filter((message) => message.length > 0)
}

export async function reconcileStore(
  _parent: unknown,
  args: { storeId: string; tenantId: string; trigger?: string | null },
  context: AppContext
) {
  requireWorkerAuth(context)
  const trigger = args.trigger ?? 'manual'

  const categoryResult = await categorySyncService.syncStore(
    args.tenantId,
    args.storeId,
    trigger
  )
  const salesResult = await saleSyncService.syncStore(
    args.tenantId,
    args.storeId,
    trigger
  )
  const saleItemsResult = await saleItemSyncService.syncStore(
    args.tenantId,
    args.storeId,
    trigger
  )

  return {
    storeId: args.storeId,
    synced: categoryResult.synced + salesResult.synced + saleItemsResult.synced,
    deleted: categoryResult.deleted + salesResult.deleted + saleItemsResult.deleted,
    errors: mergeStoreErrors(
      categoryResult.errors,
      salesResult.errors,
      saleItemsResult.errors
    ),
  }
}

export async function reconcileAll(
  _parent: unknown,
  args: { trigger?: string | null },
  context: AppContext
) {
  requireWorkerAuth(context)
  const trigger = args.trigger ?? 'scheduled'

  const categoryResult = await categorySyncService.reconcileAll(trigger)
  const salesResult = await saleSyncService.reconcileAll(trigger)
  const saleItemsResult = await saleItemSyncService.reconcileAll(trigger)

  const storeKey = (tenantId: string, storeId: string) => `${tenantId}:${storeId}`
  const mergedByStore = new Map<
    string,
    {
      tenantId: string
      storeId: string
      status: 'success' | 'skipped' | 'error'
      syncedCount: number
      skippedCount: number
      errorMessage?: string | null
    }
  >()

  for (const store of [
    ...categoryResult.storeResults,
    ...salesResult.storeResults,
    ...saleItemsResult.storeResults,
  ]) {
    const key = storeKey(store.tenantId, store.storeId)
    const existing = mergedByStore.get(key)
    if (!existing) {
      mergedByStore.set(key, { ...store })
      continue
    }

    existing.syncedCount += store.syncedCount
    existing.skippedCount += store.skippedCount
    if (store.status === 'error' || existing.status === 'error') {
      existing.status = 'error'
    } else if (store.status === 'skipped' && existing.status === 'skipped') {
      existing.status = 'skipped'
    } else {
      existing.status = 'success'
    }

    const messages = [existing.errorMessage, store.errorMessage]
      .filter((message): message is string => Boolean(message))
    existing.errorMessage = messages.length > 0 ? messages.join('; ') : null
  }

  const storeResults = [...mergedByStore.values()]
  let successCount = 0
  let errorCount = 0
  for (const store of storeResults) {
    if (store.status === 'success') {
      successCount += 1
    } else if (store.status === 'error') {
      errorCount += 1
    }
  }

  let status: 'success' | 'partial' | 'error' = 'success'
  if (errorCount > 0 && successCount === 0) {
    status = 'error'
  } else if (errorCount > 0) {
    status = 'partial'
  } else {
    status = mergeStatus(
      mergeStatus(categoryResult.status, salesResult.status),
      saleItemsResult.status
    )
  }

  return {
    status,
    syncedCount:
      categoryResult.syncedCount + salesResult.syncedCount + saleItemsResult.syncedCount,
    storesProcessed: storeResults.length,
    successCount,
    errorCount,
    storeResults: storeResults.map((store) => ({
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
  const saleItemsDeleted = await saleItemSyncService.deleteStoreSaleItems(
    args.tenantId,
    args.storeId
  )
  const salesDeleted = await saleSyncService.deleteStoreSales(
    args.tenantId,
    args.storeId
  )
  const categoriesDeleted = await categorySyncService.deleteStoreCategories(
    args.tenantId,
    args.storeId
  )
  const { deleteStoreVendedores } = await import('../../../../lib/sync/disconnect-store-data.js')
  const vendedoresDeleted = await deleteStoreVendedores(args.tenantId, args.storeId)
  return {
    storeId: args.storeId,
    deleted: saleItemsDeleted + salesDeleted + categoriesDeleted + vendedoresDeleted,
  }
}
