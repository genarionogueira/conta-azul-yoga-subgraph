import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TokenNotFoundError,
  TokenRefreshError,
  TokenResolver,
  type ContaAzulToken,
} from '../../src/lib/token-resolver.js'

function createMockRedis() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    scan: vi.fn(),
    del: vi.fn(),
  }
}

describe('TokenResolver', () => {
  const storeId = 'store-1'
  const clientId = 'client-id'
  const clientSecret = 'client-secret'
  const tokenUrl = 'https://auth.contaazul.com/oauth2/token'

  let redis: ReturnType<typeof createMockRedis>
  let resolver: TokenResolver

  beforeEach(() => {
    redis = createMockRedis()
    resolver = new TokenResolver(
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

    const result = await resolver.getToken(storeId)

    expect(result).toEqual(token)
    expect(redis.get).toHaveBeenCalledWith('conta_azul:token:store-1')
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

    const result = await resolver.ensureFreshToken(storeId)

    expect(result.access_token).toBe('new-access')
    expect(result.refresh_token).toBe('new-refresh')
    expect(redis.set).toHaveBeenCalledWith(
      'conta_azul:token:store-1',
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

    const result = await resolver.ensureFreshToken(storeId)

    expect(result).toEqual(fresh)
    expect(fetch).not.toHaveBeenCalled()
    expect(redis.set).not.toHaveBeenCalled()
  })

  it('GivenMissingToken_WhenEnsureFresh_ThenThrowsTokenNotFoundError', async () => {
    redis.get.mockResolvedValue(null)

    await expect(resolver.ensureFreshToken(storeId)).rejects.toBeInstanceOf(
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

    await expect(resolver.ensureFreshToken(storeId)).rejects.toBeInstanceOf(
      TokenRefreshError
    )
  })

  it('GivenTwoTokenKeys_WhenListConnectedStoreIds_ThenReturnsBothStoreIds', async () => {
    redis.scan
      .mockResolvedValueOnce([
        '1',
        ['conta_azul:token:store-2', 'conta_azul:token:store-1'],
      ])
      .mockResolvedValueOnce(['0', []])

    const result = await resolver.listConnectedStoreIds()

    expect(result).toEqual(['store-1', 'store-2'])
    expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'conta_azul:token:*', 'COUNT', 100)
  })

  it('GivenNoTokenKeys_WhenListConnectedStoreIds_ThenReturnsEmptyArray', async () => {
    redis.scan.mockResolvedValueOnce(['0', []])

    const result = await resolver.listConnectedStoreIds()

    expect(result).toEqual([])
  })

  it('GivenDuplicateScanPages_WhenListConnectedStoreIds_ThenReturnsUniqueSortedIds', async () => {
    redis.scan
      .mockResolvedValueOnce(['5', ['conta_azul:token:store-b']])
      .mockResolvedValueOnce(['0', ['conta_azul:token:store-a']])

    const result = await resolver.listConnectedStoreIds()

    expect(result).toEqual(['store-a', 'store-b'])
  })

  it('GivenExistingToken_WhenDeleteToken_ThenKeyRemoved', async () => {
    redis.del.mockResolvedValue(1)

    const result = await resolver.deleteToken(storeId)

    expect(result).toBe(true)
    expect(redis.del).toHaveBeenCalledWith('conta_azul:token:store-1')
  })

  it('GivenMissingToken_WhenDeleteToken_ThenReturnsFalse', async () => {
    redis.del.mockResolvedValue(0)

    const result = await resolver.deleteToken(storeId)

    expect(result).toBe(false)
  })
})
