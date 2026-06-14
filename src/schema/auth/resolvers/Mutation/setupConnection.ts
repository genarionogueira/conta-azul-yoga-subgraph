import { exchangeAuthorizationCode } from '../../../../lib/conta-azul-oauth.js'
import { authConfig, authTokenResolver, oauthStateStore } from '../../oauth-services.js'

export async function setupConnection(
  _parent: unknown,
  args: { storeId: string; code: string; state: string }
) {
  try {
    const storedStoreId = await oauthStateStore.consumeState(args.state)
    if (!storedStoreId || storedStoreId !== args.storeId) {
      return {
        success: false,
        storeId: args.storeId,
        error: 'Invalid or expired OAuth state',
      }
    }
    const redirectUri = authConfig.requireRedirectUri()
    const token = await exchangeAuthorizationCode({
      code: args.code,
      redirectUri,
      clientId: authConfig.getClientId(),
      clientSecret: authConfig.getClientSecret(),
      tokenUrl: authConfig.getTokenUrl(),
    })
    await authTokenResolver.saveToken(args.storeId, token)
    return { success: true, storeId: args.storeId, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, storeId: args.storeId, error: message }
  }
}
