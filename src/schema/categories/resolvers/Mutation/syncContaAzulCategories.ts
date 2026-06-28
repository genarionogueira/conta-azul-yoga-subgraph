import type { AppContext } from '../../../../context.js'
import { requireTenant } from '../../../../lib/auth/tenant-context.js'
import { triggerReconcile } from '../../../../lib/worker-client/trigger-reconcile.js'

export async function syncContaAzulCategories(
  _parent: unknown,
  args: { storeId?: string | null },
  context: AppContext
) {
  const tenantId = requireTenant(context)
  const storeId = args.storeId?.trim() || context.storeId?.trim() || undefined

  const result = await triggerReconcile({ tenantId, storeId })
  return {
    syncedCount: result.syncedCount,
    syncedAt: result.syncedAt,
    status: result.status,
    errorMessage: result.errorMessage,
  }
}
