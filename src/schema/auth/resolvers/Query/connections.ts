import type { AppContext } from '../../../../context.js'
import { requireTenant } from '../../../../lib/auth/tenant-context.js'
import { connectionService } from '../../oauth-services.js'

export async function connections(_parent: unknown, _args: unknown, context: AppContext) {
  const tenantId = requireTenant(context)
  return connectionService.listConnections(tenantId)
}
