import { authTokenResolver } from '../../oauth-services.js'

export async function disconnectStore(
  _parent: unknown,
  args: { storeId: string }
) {
  const deleted = await authTokenResolver.deleteToken(args.storeId)
  if (!deleted) {
    return {
      success: false,
      storeId: args.storeId,
      error: `Store ${args.storeId} is not connected`,
    }
  }
  return {
    success: true,
    storeId: args.storeId,
    error: null,
  }
}
