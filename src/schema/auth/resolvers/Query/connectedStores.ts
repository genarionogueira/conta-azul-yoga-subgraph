import { authTokenResolver } from '../../oauth-services.js'

export async function connectedStores() {
  const storeIds = await authTokenResolver.listConnectedStoreIds()
  return storeIds.map((storeId) => ({ storeId }))
}
