import { describe, it, expect } from 'vitest'
import { gqlRaw } from './helpers/gql-client.js'

const QUERY = '{ contaAzulCategories { nodes { storeId id nome tipo } } }'
const STORE1_QUERY =
  '{ contaAzulCategories(where: { storeId: { _eq: "store-1" } }) { nodes { storeId id nome tipo } } }'

describe('E2E: contaAzulCategories query', () => {
  it('GivenConnectedStores_WhenQuerying_ThenReturnsListWithExpectedShape', async () => {
    const res = await gqlRaw(QUERY)
    expect(res.errors).toBeUndefined()
    const cats = (res.data as { contaAzulCategories: { nodes: unknown[] } }).contaAzulCategories
      .nodes
    expect(cats.length).toBeGreaterThan(0)
  })

  it('GivenConnectedStores_WhenQuerying_ThenEachCategoryHasStoreIdIdNomeTipo', async () => {
    const res = await gqlRaw(QUERY)
    const cats = (
      res.data as {
        contaAzulCategories: {
          nodes: Array<{
            storeId: string
            id: string
            nome: string
            tipo: string
          }>
        }
      }
    ).contaAzulCategories.nodes
    for (const cat of cats) {
      expect(typeof cat.storeId).toBe('string')
      expect(typeof cat.id).toBe('string')
      expect(typeof cat.nome).toBe('string')
      expect(typeof cat.tipo).toBe('string')
    }
  })

  it('GivenConnectedStores_WhenQuerying_ThenIncludesStore1Categories', async () => {
    const res = await gqlRaw(STORE1_QUERY)
    const cats = (
      res.data as { contaAzulCategories: { nodes: Array<{ storeId: string }> } }
    ).contaAzulCategories.nodes
    expect(cats.some((c) => c.storeId === 'store-1')).toBe(true)
  })
})
