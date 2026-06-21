import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TenantTokenStore,
  TokenNotFoundError,
  TokenRefreshError,
  type ContaAzulToken,
} from '../../src/lib/credentials/tenant-token-store.js'
import { TEST_TENANT_ID } from '../helpers/test-context.js'

function createMockRedis() {
  return {
    get: vi.fn(),
    setex: vi.fn(),
    zadd: vi.fn(),
    zrange: vi.fn(),
    zrem: vi.fn(),
    zscore: vi.fn(),
    del: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn(),
  }
}

describe('TenantTokenStore', () => {
  const storeId = 'store-1'
  const tenantId = TEST_TENANT_ID
  const clientId = 'client-id'
  const clientSecret = 'client-secret'
  const tokenUrl = 'https://auth.contaazul.com/oauth2/token'

  let redis: ReturnType<typeof createMockRedis>
  let store: TenantTokenStore

  beforeEach(() => {
    redis = createMockRedis()
    store = new TenantTokenStore(
      redis as unknown as import('ioredis').Redis,
      clientId,
      clientSecret,
      tokenUrl
    )
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('GivenStoredToken_WhenGetToken_ThenReturnsParsed', async () => {
    const token: ContaAzulToken = {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3_600_000,
    }
    redis.get.mockResolvedValue(`plain:${JSON.stringify(token)}`)

    const result = await store.getToken(tenantId, storeId)

    expect(result).toEqual(token)
    expect(redis.get).toHaveBeenCalledWith(`conta_azul:token:${tenantId}:${storeId}`)
  })

  it('GivenExpiredToken_WhenEnsureFresh_ThenRefreshesAndReturnsNewToken', async () => {
    const expired: ContaAzulToken = {
      access_token: 'old-access',
      refresh_token: 'refresh',
      expires_at: Date.now() - 1_000,
    }
    redis.get.mockResolvedValue(`plain:${JSON.stringify(expired)}`)
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
        { status: 200 }
      )
    )

    const result = await store.ensureFreshToken(tenantId, storeId)

    expect(result.access_token).toBe('new-access')
    expect(redis.setex).toHaveBeenCalledWith(
      `conta_azul:token:${tenantId}:${storeId}`,
      expect.any(Number),
      expect.stringContaining('new-access')
    )
  })

  it('GivenFreshToken_WhenEnsureFresh_ThenReturnsExistingWithoutRefresh', async () => {
    const fresh: ContaAzulToken = {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3_600_000,
    }
    redis.get.mockResolvedValue(`plain:${JSON.stringify(fresh)}`)

    const result = await store.ensureFreshToken(tenantId, storeId)

    expect(result).toEqual(fresh)
    expect(fetch).not.toHaveBeenCalled()
    expect(redis.setex).not.toHaveBeenCalled()
  })

  it('GivenMissingToken_WhenEnsureFresh_ThenThrowsTokenNotFoundError', async () => {
    redis.get.mockResolvedValue(null)

    await expect(store.ensureFreshToken(tenantId, storeId)).rejects.toBeInstanceOf(
      TokenNotFoundError
    )
  })

  it('GivenExpiredToken_WhenRefreshFails_ThenThrowsTokenRefreshError', async () => {
    const expired: ContaAzulToken = {
      access_token: 'old-access',
      refresh_token: 'refresh',
      expires_at: Date.now() - 1_000,
    }
    redis.get.mockResolvedValue(`plain:${JSON.stringify(expired)}`)
    vi.mocked(fetch).mockResolvedValue(new Response('error', { status: 401 }))

    await expect(store.ensureFreshToken(tenantId, storeId)).rejects.toBeInstanceOf(
      TokenRefreshError
    )
  })

  it('GivenTwoStoresInIndex_WhenListConnectedStoreIds_ThenReturnsBothStoreIds', async () => {
    redis.zrange.mockResolvedValue(['store-2', 'store-1'])
    redis.get.mockImplementation(async (key: string) => {
      if (key.includes('store-1') || key.includes('store-2')) {
        return `plain:${JSON.stringify({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_at: Date.now() + 3_600_000,
        })}`
      }
      return null
    })

    const result = await store.listConnectedStoreIds(tenantId)

    expect(result).toEqual(['store-1', 'store-2'])
    expect(redis.zrange).toHaveBeenCalledWith(`conta_azul:connected_stores:${tenantId}`, 0, -1)
  })

  it('GivenNoStoresInIndex_WhenListConnectedStoreIds_ThenReturnsEmptyArray', async () => {
    redis.zrange.mockResolvedValue([])

    const result = await store.listConnectedStoreIds(tenantId)

    expect(result).toEqual([])
  })

  it('GivenStaleIndexEntry_WhenListConnectedStoreIds_ThenRemovesOrphanAndReturnsValid', async () => {
    redis.zrange.mockResolvedValue(['store-a', 'store-b'])
    redis.get.mockImplementation(async (key: string) => {
      if (key.includes('store-a')) {
        return `plain:${JSON.stringify({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_at: Date.now() + 3_600_000,
        })}`
      }
      return null
    })

    const result = await store.listConnectedStoreIds(tenantId)

    expect(result).toEqual(['store-a'])
    expect(redis.zrem).toHaveBeenCalledWith(`conta_azul:connected_stores:${tenantId}`, 'store-b')
  })

  it('GivenExistingToken_WhenDeleteConnection_ThenKeyRemoved', async () => {
    redis.del.mockResolvedValue(1)

    const result = await store.deleteConnection(tenantId, storeId)

    expect(result).toBe(true)
    expect(redis.del).toHaveBeenCalledWith(`conta_azul:token:${tenantId}:${storeId}`)
    expect(redis.zrem).toHaveBeenCalledWith(`conta_azul:connected_stores:${tenantId}`, storeId)
  })

  it('GivenMissingToken_WhenDeleteConnection_ThenReturnsFalse', async () => {
    redis.del.mockResolvedValue(0)

    const result = await store.deleteConnection(tenantId, storeId)

    expect(result).toBe(false)
  })
})
