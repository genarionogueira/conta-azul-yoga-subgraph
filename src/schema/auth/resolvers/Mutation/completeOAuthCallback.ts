import type { AppContext } from '../../../../context.js'
import { connectionService } from '../../oauth-services.js'

export async function completeOAuthCallback(
  _parent: unknown,
  args: { code: string; state: string; name?: string | null },
  _context: AppContext
) {
  const result = await connectionService.completeConnectFromCallback(
    args.code,
    args.state,
    args.name ?? undefined
  )
  return {
    success: result.success,
    storeId: result.storeId,
    error: result.success ? null : result.error,
  }
}
