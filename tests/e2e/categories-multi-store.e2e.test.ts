import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Redis } from 'ioredis'
import { gqlRaw } from './helpers/gql-client.js'
import { DEFAULT_DEV_TENANT_ID } from '../../src/lib/auth/tenant-context.js'
import { reseedDefaultE2eConnections } from './setup.js'

const CONNECTED_STORES_KEY = `conta_azul:connected_stores:${DEFAULT_DEV_TENANT_ID}`

const QUERY = '{ contaAzulCategories { nodes { storeId id nome tipo } } }'

function getRedisUrl(): string {
  const base = process.env.E2E_REDIS_URL
  if (!base) throw new Error('E2E_REDIS_URL not set — globalSetup may not have run')
  return base
}

describe('E2E: contaAzulCategories multi-store aggregation', () => {
  it('GivenTwoConnectedStores_WhenQueryingWithoutArgs_ThenReturnsCategoriesFromBothStores', async () => {
    const res = await gqlRaw(QUERY)
    expect(res.errors).toBeUndefined()
    const cats = (res.data as { contaAzulCategories: { nodes: Array<{ storeId: string }> } })
      .contaAzulCategories.nodes
    const seeded = cats.filter((c) => c.storeId === 'store-1' || c.storeId === 'store-2')
    expect(seeded.length).toBe(4)
    const storeIds = new Set(seeded.map((c) => c.storeId))
    expect(storeIds).toEqual(new Set(['store-1', 'store-2']))
  })

  it('GivenTwoConnectedStores_WhenQuerying_ThenEveryRowHasStoreIdIdNomeTipo', async () => {
    const res = await gqlRaw(QUERY)
    const cats = (
      res.data as {
        contaAzulCategories: {
          nodes: Array<{ storeId: string; id: string; nome: string; tipo: string }>
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

  describe('GivenNoConnectedStores_WhenQuerying_ThenReturnsCachedCategories', () => {
    let redis: Redis

    beforeAll(async () => {
      redis = new Redis(getRedisUrl())
      let cursor = '0'
      do {
        const [next, keys] = await redis.scan(
          cursor,
          'MATCH',
          `conta_azul:token:${DEFAULT_DEV_TENANT_ID}:*`,
          'COUNT',
          100
        )
        cursor = next
        if (keys.length > 0) {
          await redis.del(...keys)
        }
      } while (cursor !== '0')
      await redis.del(CONNECTED_STORES_KEY)
    })

    afterAll(async () => {
      await redis.quit()
      await reseedDefaultE2eConnections(getRedisUrl())
    })

    it('returns cached MongoDB data with no GraphQL errors', async () => {
      const res = await gqlRaw(QUERY)
      expect(res.errors).toBeUndefined()
      const cats = (res.data as { contaAzulCategories: { nodes: unknown[] } }).contaAzulCategories
        .nodes
      expect(cats.length).toBeGreaterThan(0)
    })
  })
})
