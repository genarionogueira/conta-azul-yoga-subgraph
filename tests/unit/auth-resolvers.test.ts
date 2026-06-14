import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}

const mockSaveToken = vi.fn()

vi.mock('ioredis', () => ({
  Redis: vi.fn(() => mockRedis),
}))

vi.mock('../../src/lib/token-resolver.js', () => ({
  TokenResolver: vi.fn(() => ({
    saveToken: mockSaveToken,
  })),
}))

const { contaAzulAuthConfig } = await import(
  '../../src/schema/auth/resolvers/Query/contaAzulAuthConfig.js'
)
const { authorizationUrl } = await import(
  '../../src/schema/auth/resolvers/Query/authorizationUrl.js'
)
const { setupConnection } = await import(
  '../../src/schema/auth/resolvers/Mutation/setupConnection.js'
)

describe('auth resolvers', () => {
  const env = process.env

  beforeEach(() => {
    process.env = {
      ...env,
      CONTA_AZUL_CLIENT_ID: 'test-client-id',
      CONTA_AZUL_CLIENT_SECRET: 'test-client-secret',
      CONTA_AZUL_REDIRECT_URI: 'http://localhost:4000/callback',
      CONTA_AZUL_AUTH_URL: 'https://auth.example.com/login',
      CONTA_AZUL_TOKEN_URL: 'https://auth.example.com/oauth2/token',
    }
    mockRedis.set.mockReset()
    mockRedis.get.mockReset()
    mockRedis.del.mockReset()
    mockSaveToken.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    process.env = env
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('GivenConfiguredEnv_WhenContaAzulAuthConfig_ThenReturnsSnapshot', async () => {
    const result = await contaAzulAuthConfig({}, {}, {} as never, {} as never)

    expect(result).toEqual({
      redirectUri: 'http://localhost:4000/callback',
      authUrl: 'https://auth.example.com/login',
      tokenUrl: 'https://auth.example.com/oauth2/token',
      clientIdConfigured: true,
    })
  })

  it('GivenStoreId_WhenAuthorizationUrl_ThenReturnsUrlWithState', async () => {
    mockRedis.set.mockResolvedValue('OK')

    const result = await authorizationUrl(
      {},
      { storeId: 'store-1' },
      {} as never,
      {} as never
    )

    expect(result.storeId).toBe('store-1')
    expect(result.state).toMatch(/^[a-f0-9]{64}$/)
    expect(result.url).toContain('client_id=test-client-id')
    expect(result.url).toContain('redirect_uri=')
    expect(mockRedis.set).toHaveBeenCalledOnce()
  })

  it('GivenMissingClientId_WhenAuthorizationUrl_ThenThrowsAuthConfigError', async () => {
    delete process.env.CONTA_AZUL_CLIENT_ID

    await expect(
      authorizationUrl({}, { storeId: 'store-1' }, {} as never, {} as never)
    ).rejects.toThrow('CONTA_AZUL_CLIENT_ID is not configured')
  })

  it('GivenValidStateAndCode_WhenSetupConnection_ThenSavesTokenAndSucceeds', async () => {
    mockRedis.get.mockResolvedValue('store-1')
    mockRedis.del.mockResolvedValue(1)
    mockSaveToken.mockResolvedValue(undefined)
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
        }),
        { status: 200 }
      )
    )

    const result = await setupConnection(
      {},
      {
        storeId: 'store-1',
        code: 'auth-code',
        state: 'valid-state',
      },
      {} as never,
      {} as never
    )

    expect(result).toEqual({
      success: true,
      storeId: 'store-1',
      error: null,
    })
    expect(mockSaveToken).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({ access_token: 'access' })
    )
  })

  it('GivenMismatchedStateStoreId_WhenSetupConnection_ThenReturnsError', async () => {
    mockRedis.get.mockResolvedValue('other-store')

    const result = await setupConnection(
      {},
      {
        storeId: 'store-1',
        code: 'auth-code',
        state: 'valid-state',
      },
      {} as never,
      {} as never
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid or expired OAuth state')
    expect(mockSaveToken).not.toHaveBeenCalled()
  })

  it('GivenMissingState_WhenSetupConnection_ThenReturnsError', async () => {
    mockRedis.get.mockResolvedValue(null)

    const result = await setupConnection(
      {},
      {
        storeId: 'store-1',
        code: 'auth-code',
        state: 'expired-state',
      },
      {} as never,
      {} as never
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid or expired OAuth state')
  })

  it('GivenTokenExchangeFailure_WhenSetupConnection_ThenReturnsErrorMessage', async () => {
    mockRedis.get.mockResolvedValue('store-1')
    mockRedis.del.mockResolvedValue(1)
    vi.mocked(fetch).mockResolvedValue(new Response('error', { status: 401 }))

    const result = await setupConnection(
      {},
      {
        storeId: 'store-1',
        code: 'bad-code',
        state: 'valid-state',
      },
      {} as never,
      {} as never
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('Authorization code exchange failed')
  })
})
