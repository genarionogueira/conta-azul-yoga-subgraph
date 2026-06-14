import { AuthConfigError } from '../../../../lib/auth-config.js'
import { buildAuthorizationUrl } from '../../../../lib/conta-azul-oauth.js'
import { authConfig, oauthStateStore } from '../../oauth-services.js'

export async function authorizationUrl(
  _parent: unknown,
  args: { storeId: string }
) {
  const redirectUri = authConfig.requireRedirectUri()
  const clientId = authConfig.getClientId()
  if (!clientId) {
    throw new AuthConfigError('CONTA_AZUL_CLIENT_ID is not configured')
  }
  const state = await oauthStateStore.createState(args.storeId)
  const url = buildAuthorizationUrl({
    clientId,
    redirectUri,
    state,
    scope: authConfig.getScope(),
    authUrl: authConfig.getAuthUrl(),
  })
  return { storeId: args.storeId, url, state }
}
