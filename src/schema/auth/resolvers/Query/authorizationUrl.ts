import type { AppContext } from '../../../../context.js'
import { requireTenant } from '../../../../lib/auth/tenant-context.js'
import { connectionService } from '../../oauth-services.js'
import { validateReturnUrl } from '../../../../lib/oauth-return-url.js'

export async function authorizationUrl(
  _parent: unknown,
  args: { storeId: string; returnUrl?: string | null },
  context: AppContext
) {
  const tenantId = requireTenant(context)
  const returnUrl = validateReturnUrl(args.returnUrl ?? undefined) ?? undefined
  return connectionService.startConnect(tenantId, args.storeId, returnUrl)
}
