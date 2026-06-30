import type { AppContext } from '../../../../context.js'
import { requireTenant } from '../../../../lib/auth/tenant-context.js'
import { saleItemSyncService } from '../../../../lib/sale-item-sync/index.js'
import type { SyncResult } from '../../../../lib/sale-item-sync/types.js'

function toGraphqlSyncResult(
  syncedCount: number,
  status: 'success' | 'partial' | 'error',
  errorMessage: string | null
) {
  return {
    syncedCount,
    syncedAt: new Date().toISOString(),
    status,
    errorMessage,
  }
}

function mapStoreSyncResult(result: SyncResult) {
  if (result.errors.includes('token_not_found')) {
    return toGraphqlSyncResult(0, 'success', null)
  }

  const status = result.errors.length > 0 ? 'error' : 'success'
  return toGraphqlSyncResult(
    result.synced,
    status,
    result.errors.length > 0 ? result.errors.join('; ') : null
  )
}

export async function syncContaAzulSaleItems(
  _parent: unknown,
  args: { storeId?: string | null },
  context: AppContext
) {
  const tenantId = requireTenant(context)
  const storeId = args.storeId?.trim() || context.storeId?.trim() || undefined

  if (storeId) {
    const result = await saleItemSyncService.syncStore(tenantId, storeId, 'manual')
    return mapStoreSyncResult(result)
  }

  const result = await saleItemSyncService.reconcileAll('manual')
  const errorMessages = result.storeResults
    .map((store) => store.errorMessage)
    .filter((message): message is string => Boolean(message))

  return toGraphqlSyncResult(
    result.syncedCount,
    result.status,
    errorMessages.length > 0 ? errorMessages.join('; ') : null
  )
}
