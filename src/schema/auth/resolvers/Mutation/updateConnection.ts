import type { AppContext } from '../../../../context.js'
import { requireTenant } from '../../../../lib/auth/tenant-context.js'
import { connectionService } from '../../oauth-services.js'

export async function updateConnection(
  _parent: unknown,
  args: { id: string; name: string },
  context: AppContext
) {
  const tenantId = requireTenant(context)
  return connectionService.updateConnection(tenantId, args.id, args.name)
}
