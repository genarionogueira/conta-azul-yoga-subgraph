import { completeConnect } from '../../../../lib/auth/connect-flow.js'
import { authConfig, authTokenResolver, oauthStateStore } from '../../oauth-services.js'

const connectDeps = {
  authConfig,
  oauthStateStore,
  tokenResolver: authTokenResolver,
}

export async function setupConnection(
  _parent: unknown,
  args: { storeId: string; code: string; state: string }
) {
  const result = await completeConnect(args.storeId, args.code, args.state, connectDeps)
  return {
    success: result.success,
    storeId: result.storeId,
    error: result.success ? null : result.error,
  }
}
