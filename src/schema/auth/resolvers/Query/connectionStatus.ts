import { authTokenResolver } from '../../oauth-services.js'

export async function connectionStatus(
  _parent: unknown,
  args: { storeId: string }
) {
  try {
    const token = await authTokenResolver.getToken(args.storeId)
    return {
      storeId: args.storeId,
      isConnected: token !== null,
      error: null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return {
      storeId: args.storeId,
      isConnected: false,
      error: message,
    }
  }
}
