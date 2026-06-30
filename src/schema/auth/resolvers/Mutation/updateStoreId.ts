import type { AppContext } from '../../../../context.js'
import { requireTenant } from '../../../../lib/auth/tenant-context.js'
import { connectionService } from '../../oauth-services.js'

export async function updateStoreId(
  _parent: unknown,
  args: { connectionId: string; storeId: string },
  context: AppContext
) {
  const tenantId = requireTenant(context)
  return connectionService.updateStoreId(tenantId, args.connectionId, args.storeId)
}
