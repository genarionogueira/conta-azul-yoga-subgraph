import type { AppContext } from '../../../../context.js'
import { requireTenant } from '../../../../lib/auth/tenant-context.js'
import { connectionService } from '../../oauth-services.js'

export async function setupConnection(
  _parent: unknown,
  args: { storeId: string; code: string; state: string; name?: string | null },
  context: AppContext
) {
  const tenantId = requireTenant(context)
  const result = await connectionService.completeConnect(
    tenantId,
    args.storeId,
    args.code,
    args.state,
    context.authClaims as Record<string, unknown> | undefined,
    args.name ?? undefined
  )
  return {
    success: result.success,
    storeId: result.storeId,
    error: result.success ? null : result.error,
  }
}
