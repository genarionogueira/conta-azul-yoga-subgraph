import { completeConnect, startConnect } from '../../../../lib/auth/connect-flow.js'
import { authConfig, authTokenResolver, oauthStateStore } from '../../oauth-services.js'

const connectDeps = {
  authConfig,
  oauthStateStore,
  tokenResolver: authTokenResolver,
}

export async function authorizationUrl(
  _parent: unknown,
  args: { storeId: string }
) {
  return startConnect(args.storeId, connectDeps)
}
