import { afterEach, describe, expect, it } from 'vitest'
import { gqlRaw } from './helpers/gql-client.js'
import {
  clearStoreCategories,
  expireCacheMeta,
  seedStaleCategories,
} from './helpers/mongo-e2e.js'
import {
  getRequestCount,
  removePriorityStubs,
  resetWireMockRequests,
  setWireMockStub,
} from './helpers/wiremock-admin.js'

const CATEGORIES_QUERY = `
  query Categories($where: ContaAzulCategory_bool_exp) {
    contaAzulCategories(where: $where) {
      nodes { storeId id nome tipo }
      totalCount
    }
  }
`

describe('E2E: cache-aside categories', () => {
  afterEach(async () => {
    await removePriorityStubs()
  })

  it('cold query fetches API, warm query skips API, expired TTL refetches', async () => {
    await clearStoreCategories('store-1')
    await resetWireMockRequests()

    const cold = await gqlRaw(CATEGORIES_QUERY, {
      where: { storeId: { _eq: 'store-1' } },
    })
    expect(cold.errors).toBeUndefined()
    const coldNodes = (
      cold.data as { contaAzulCategories: { nodes: unknown[]; totalCount: number } }
    ).contaAzulCategories
    expect(coldNodes.totalCount).toBe(2)
    expect(coldNodes.nodes).toHaveLength(2)
    expect(await getRequestCount('/v1/categorias')).toBe(1)

    const warm = await gqlRaw(CATEGORIES_QUERY, {
      where: { storeId: { _eq: 'store-1' } },
    })
    expect(warm.errors).toBeUndefined()
    expect(
      (warm.data as { contaAzulCategories: { totalCount: number } }).contaAzulCategories
        .totalCount
    ).toBe(2)
    expect(await getRequestCount('/v1/categorias')).toBe(1)

    await expireCacheMeta('store-1')
    const stale = await gqlRaw(CATEGORIES_QUERY, {
      where: { storeId: { _eq: 'store-1' } },
    })
    expect(stale.errors).toBeUndefined()
    expect(await getRequestCount('/v1/categorias')).toBe(2)
  })

  it('API failure serves stale Mongo when data exists', async () => {
    await seedStaleCategories('store-1')
    await resetWireMockRequests()
    await setWireMockStub('/v1/categorias', 500)

    const res = await gqlRaw(CATEGORIES_QUERY, {
      where: { storeId: { _eq: 'store-1' } },
    })

    expect(res.errors).toBeUndefined()
    const nodes = (
      res.data as {
        contaAzulCategories: {
          nodes: Array<{ id: string; nome: string }>
          totalCount: number
        }
      }
    ).contaAzulCategories
    expect(nodes.totalCount).toBe(1)
    expect(nodes.nodes[0]?.id).toBe('cat-stale-1')
    expect(nodes.nodes[0]?.nome).toBe('Stale Receitas')
  })
})
