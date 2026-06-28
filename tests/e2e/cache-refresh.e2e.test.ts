import { afterEach, describe, expect, it } from 'vitest'
import { gqlRaw } from './helpers/gql-client.js'
import { clearStoreCategories, seedStaleCategories } from './helpers/mongo-e2e.js'
import { triggerWorkerSyncForStore } from './helpers/worker-sync.js'
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

describe('E2E: worker-owned categories read path', () => {
  afterEach(async () => {
    await removePriorityStubs()
  })

  it('GraphQL query reads Mongo synced by worker without yoga calling Conta Azul API', async () => {
    await clearStoreCategories('store-1')
    await resetWireMockRequests()

    await triggerWorkerSyncForStore('store-1', 2)

    const beforeQueryCount = await getRequestCount('/v1/categorias')

    const res = await gqlRaw(CATEGORIES_QUERY, {
      where: { storeId: { _eq: 'store-1' } },
    })
    expect(res.errors).toBeUndefined()
    const nodes = (
      res.data as { contaAzulCategories: { nodes: unknown[]; totalCount: number } }
    ).contaAzulCategories
    expect(nodes.totalCount).toBe(2)
    expect(nodes.nodes).toHaveLength(2)

    const afterQueryCount = await getRequestCount('/v1/categorias')
    expect(afterQueryCount).toBe(beforeQueryCount)
  })

  it('serves existing Mongo data when Conta Azul API is unavailable', async () => {
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
