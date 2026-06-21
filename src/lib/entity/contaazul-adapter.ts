import { listConnectedStoreIds, getContaAzulClientForStore } from '../../context.js'
import { registerRestAdapter, type RestAdapterClient } from './adapters.js'

export function registerContaAzulAdapter(): void {
  registerRestAdapter('contaAzul', {
    listConnectedStoreIds: (tenantId: string) => listConnectedStoreIds(tenantId),
    getClientForStore: async (
      tenantId: string,
      storeId: string
    ): Promise<RestAdapterClient | undefined> => {
      const client = await getContaAzulClientForStore(tenantId, storeId)
      if (!client) {
        return undefined
      }
      return {
        listCategorias: () =>
          client.listCategorias().then((items) => items as unknown as Record<string, unknown>[]),
      }
    },
  })
}
