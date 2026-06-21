import type { AppContext } from '../../../../context.js'
import { requireTenant } from '../../../../lib/auth/tenant-context.js'
import { connectionService } from '../../oauth-services.js'

export async function connectionStatus(
  _parent: unknown,
  args: { storeId: string },
  context: AppContext
) {
  const tenantId = requireTenant(context)
  return connectionService.getStatus(tenantId, args.storeId)
}
