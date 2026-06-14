import type { ContaAzulCategory, ContaAzulClient } from './conta-azul-client.js'

export interface ContaAzulCategoryWithStore extends ContaAzulCategory {
  storeId: string
}

export interface CategoriesAggregatorDeps {
  listConnectedStoreIds: () => Promise<string[]>
  getClientForStore: (storeId: string) => Promise<ContaAzulClient | undefined>
}

export async function fetchAllStoreCategories(
  deps: CategoriesAggregatorDeps
): Promise<ContaAzulCategoryWithStore[]> {
  const storeIds = await deps.listConnectedStoreIds()
  if (storeIds.length === 0) {
    return []
  }

  const results = await Promise.allSettled(
    storeIds.map(async (storeId) => {
      const client = await deps.getClientForStore(storeId)
      if (!client) {
        throw new Error(`No token for store ${storeId}`)
      }
      const items = await client.listCategorias()
      return items.map((item) => ({ ...item, storeId }))
    })
  )

  const merged: ContaAzulCategoryWithStore[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      merged.push(...result.value)
    }
  }

  if (merged.length === 0 && results.every((r) => r.status === 'rejected')) {
    throw new Error('Failed to fetch categories from all connected stores')
  }

  return merged
}
