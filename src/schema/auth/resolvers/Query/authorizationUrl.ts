import { completeConnect, startConnect } from '../../../../lib/auth/connect-flow.js'
import { validateReturnUrl } from '../../../../lib/oauth-return-url.js'
import { authConfig, authTokenResolver, oauthStateStore } from '../../oauth-services.js'

const connectDeps = {
  authConfig,
  oauthStateStore,
  tokenResolver: authTokenResolver,
}

export async function authorizationUrl(
  _parent: unknown,
  args: { storeId: string; returnUrl?: string | null }
) {
  const returnUrl = validateReturnUrl(args.returnUrl ?? undefined) ?? undefined
  return startConnect(args.storeId, connectDeps, returnUrl)
}
