import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { gqlRaw } from './helpers/gql-client.js'
import { clearStoreCategories, seedStaleCategories } from './helpers/mongo-e2e.js'
import { syncStoreCategoriesViaMutation } from './helpers/worker-sync.js'
import {
  getRequestCount,
  removePriorityStubs,
  resetWireMockRequests,
  setWireMockStub,
} from './helpers/wiremock-admin.js'
import { clearTenantRateLimits } from './helpers/redis-e2e.js'
import { DEFAULT_DEV_TENANT_ID } from '../../src/lib/auth/tenant-context.js'

const TENANT_ID = DEFAULT_DEV_TENANT_ID

function getRedisUrl(): string {
  const url = process.env.E2E_REDIS_URL
  if (!url) throw new Error('E2E_REDIS_URL not set')
  return url
}

const CATEGORIES_QUERY = `
  query Categories($where: ContaAzulCategory_bool_exp) {
    contaAzulCategories(where: $where) {
      nodes { storeId id nome tipo }
      totalCount
    }
  }
`

async function restoreStoreCategories(storeId: string): Promise<void> {
  await clearStoreCategories(storeId, TENANT_ID)
  await syncStoreCategoriesViaMutation(storeId, TENANT_ID)
}

describe('E2E: worker-owned categories read path', () => {
  beforeAll(async () => {
    await clearTenantRateLimits(getRedisUrl(), TENANT_ID)
  })

  afterEach(async () => {
    await removePriorityStubs()
    await restoreStoreCategories('store-1')
    await restoreStoreCategories('store-2')
  })

  it('GraphQL query reads Mongo synced by worker without yoga calling Conta Azul API', async () => {
    await clearStoreCategories('store-1', TENANT_ID)
    await syncStoreCategoriesViaMutation('store-1', TENANT_ID)
    await resetWireMockRequests()

    const beforeQueryCount = await getRequestCount('/v1/categorias')

    const res = await gqlRaw(CATEGORIES_QUERY, {
      where: { storeId: { _eq: 'store-1' } },
    })
    expect(res.errors).toBeUndefined()
    const nodes = (
      res.data as {
        contaAzulCategories: {
          nodes: Array<{ id: string }>
          totalCount: number
        }
      }
    ).contaAzulCategories
    expect(nodes.totalCount).toBe(2)
    expect(nodes.nodes).toHaveLength(2)
    expect(nodes.nodes.map((node) => node.id).sort()).toEqual(['cat-1', 'cat-2'])

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
