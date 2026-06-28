import { describe, it, expect } from 'vitest'
import { Redis } from 'ioredis'
import { gqlRaw } from './helpers/gql-client.js'
import { DEFAULT_DEV_TENANT_ID } from '../../src/lib/auth/tenant-context.js'
import { triggerWorkerSyncForStore } from './helpers/worker-sync.js'

const TEST_TOKEN = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_at: Date.now() + 3_600_000,
  connected_at: Date.now(),
}

const CONNECTED_STORES_KEY = `conta_azul:connected_stores:${DEFAULT_DEV_TENANT_ID}`

function tokenKey(storeId: string): string {
  return `conta_azul:token:${DEFAULT_DEV_TENANT_ID}:${storeId}`
}

function getRedisUrl(): string {
  const url = process.env.E2E_REDIS_URL
  if (!url) throw new Error('E2E_REDIS_URL not set')
  return url
}

const QUERY_WITH_DIAGNOSTICS = `
  query MyQuery($where: ContaAzulCategory_bool_exp, $first: Int) {
    contaAzulCategories(where: $where, first: $first) {
      totalCount
      diagnostics {
        code
        message
        hint
        storeId
      }
    }
  }
`

describe('E2E: contaAzulCategories diagnostics', () => {
  it('GivenTokenMissingForRegisteredStore_WhenQuerying_ThenReturnsTokenMissingDiagnostic', async () => {
    const redis = new Redis(getRedisUrl())
    await redis.zadd(CONNECTED_STORES_KEY, Date.now(), 'butanta')
    await redis.del(tokenKey('butanta'))
    await redis.quit()

    const res = await gqlRaw(QUERY_WITH_DIAGNOSTICS, {
      where: { storeId: { _eq: 'butanta' } },
    })

    expect(res.errors).toBeUndefined()
    const connection = (
      res.data as {
        contaAzulCategories: {
          totalCount: number
          diagnostics: Array<{ code: string; storeId?: string | null }>
        }
      }
    ).contaAzulCategories
    expect(connection.totalCount).toBe(0)
    expect(connection.diagnostics.some((d) => d.code === 'TOKEN_MISSING' && d.storeId === 'butanta')).toBe(
      true
    )
  })

  it('GivenTokenWithoutPriorSync_WhenWorkerReconciles_ThenQueryReturnsData', async () => {
    const redis = new Redis(getRedisUrl())
    const tokenValue = `plain:${JSON.stringify(TEST_TOKEN)}`
    await redis.set(tokenKey('unsynced-store'), tokenValue)
    await redis.zadd(CONNECTED_STORES_KEY, TEST_TOKEN.connected_at, 'unsynced-store')
    await redis.quit()

    await triggerWorkerSyncForStore('unsynced-store', 2)

    const res = await gqlRaw(QUERY_WITH_DIAGNOSTICS, {
      where: { storeId: { _eq: 'unsynced-store' } },
    })

    expect(res.errors).toBeUndefined()
    const connection = (
      res.data as {
        contaAzulCategories: {
          totalCount: number
          diagnostics: Array<{ code: string; storeId?: string | null; hint: string }>
        }
      }
    ).contaAzulCategories
    expect(connection.totalCount).toBeGreaterThan(0)
    expect(connection.diagnostics).toEqual([])
  })

  it('GivenInvalidFirst_WhenQuerying_ThenReturnsBadUserInputError', async () => {
    const res = await gqlRaw(QUERY_WITH_DIAGNOSTICS, { first: -1 })
    expect(res.errors?.length).toBeGreaterThan(0)
    const error = res.errors?.[0] as { extensions?: { code?: string } }
    expect(error.extensions?.code).toBe('BAD_USER_INPUT')
  })

  it('GivenEmptyStoreIdFilter_WhenQuerying_ThenReturnsDataWithoutDiagnostics', async () => {
    const res = await gqlRaw(QUERY_WITH_DIAGNOSTICS, { where: { storeId: {} } })
    expect(res.errors).toBeUndefined()
    const connection = (
      res.data as {
        contaAzulCategories: {
          totalCount: number
          diagnostics: unknown[]
        }
      }
    ).contaAzulCategories
    expect(connection.totalCount).toBeGreaterThan(0)
    expect(connection.diagnostics).toEqual([])
  })

  it('GivenSyncedData_WhenQuerying_ThenReturnsEmptyDiagnostics', async () => {
    const res = await gqlRaw(`
      {
        contaAzulCategories {
          totalCount
          diagnostics { code }
        }
      }
    `)
    expect(res.errors).toBeUndefined()
    const connection = (
      res.data as { contaAzulCategories: { totalCount: number; diagnostics: unknown[] } }
    ).contaAzulCategories
    expect(connection.totalCount).toBeGreaterThan(0)
    expect(connection.diagnostics).toEqual([])
  })
})
