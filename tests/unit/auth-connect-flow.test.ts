import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthConfig } from '../../src/lib/auth-config.js'
import {
  completeConnect,
  completeConnectFromCallback,
  startConnect,
  type ConnectFlowDeps,
} from '../../src/lib/auth/connect-flow.js'
import type { OAuthStateStore } from '../../src/lib/oauth-state.js'
import type { TokenResolver } from '../../src/lib/token-resolver.js'

describe('connect-flow', () => {
  const env = process.env
  let authConfig: AuthConfig
  let oauthStateStore: OAuthStateStore
  let tokenResolver: TokenResolver
  let deps: ConnectFlowDeps

  beforeEach(() => {
    process.env = {
      ...env,
      CONTA_AZUL_CLIENT_ID: 'test-client-id',
      CONTA_AZUL_CLIENT_SECRET: 'test-client-secret',
      CONTA_AZUL_REDIRECT_URI: 'http://localhost:4000/callback',
      CONTA_AZUL_AUTH_URL: 'https://auth.example.com/login',
      CONTA_AZUL_TOKEN_URL: 'https://auth.example.com/oauth2/token',
    }
    authConfig = new AuthConfig()
    oauthStateStore = {
      createState: vi.fn(),
      consumeState: vi.fn(),
    } as unknown as OAuthStateStore
    tokenResolver = {
      saveToken: vi.fn(),
    } as unknown as TokenResolver
    deps = { authConfig, oauthStateStore, tokenResolver }
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    process.env = env
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('GivenStoreId_WhenStartConnect_ThenReturnsUrlWithState', async () => {
    vi.mocked(oauthStateStore.createState).mockResolvedValue('state-abc')

    const result = await startConnect('store-1', deps)

    expect(result.storeId).toBe('store-1')
    expect(result.state).toBe('state-abc')
    expect(result.url).toContain('client_id=test-client-id')
    expect(result.url).toContain('redirect_uri=')
    expect(oauthStateStore.createState).toHaveBeenCalledWith('store-1', undefined)
  })

  it('GivenMissingClientId_WhenStartConnect_ThenThrowsAuthConfigError', async () => {
    delete process.env.CONTA_AZUL_CLIENT_ID
    authConfig = new AuthConfig()
    deps = { authConfig, oauthStateStore, tokenResolver }

    await expect(startConnect('store-1', deps)).rejects.toThrow(
      'CONTA_AZUL_CLIENT_ID is not configured'
    )
  })

  it('GivenEmptyStoreId_WhenStartConnect_ThenThrows', async () => {
    await expect(startConnect('  ', deps)).rejects.toThrow('storeId is required')
  })

  it('GivenValidCodeAndState_WhenCompleteConnect_ThenSavesToken', async () => {
    vi.mocked(oauthStateStore.consumeState).mockResolvedValue({ storeId: 'store-1' })
    vi.mocked(tokenResolver.saveToken).mockResolvedValue(undefined)
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

    const result = await completeConnect('store-1', 'auth-code', 'valid-state', deps)

    expect(result).toEqual({ success: true, storeId: 'store-1' })
    expect(tokenResolver.saveToken).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({ access_token: 'access' })
    )
  })

  it('GivenMismatchedState_WhenCompleteConnect_ThenReturnsError', async () => {
    vi.mocked(oauthStateStore.consumeState).mockResolvedValue({ storeId: 'other-store' })

    const result = await completeConnect('store-1', 'auth-code', 'valid-state', deps)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid or expired OAuth state')
    expect(tokenResolver.saveToken).not.toHaveBeenCalled()
  })

  it('GivenExpiredState_WhenCompleteConnect_ThenReturnsError', async () => {
    vi.mocked(oauthStateStore.consumeState).mockResolvedValue(null)

    const result = await completeConnect('store-1', 'auth-code', 'expired-state', deps)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid or expired OAuth state')
  })

  it('GivenTokenExchangeFailure_WhenCompleteConnect_ThenReturnsError', async () => {
    vi.mocked(oauthStateStore.consumeState).mockResolvedValue({ storeId: 'store-1' })
    vi.mocked(fetch).mockResolvedValue(new Response('error', { status: 401 }))

    const result = await completeConnect('store-1', 'bad-code', 'valid-state', deps)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Authorization code exchange failed')
  })

  it('GivenValidCallback_WhenCompleteConnectFromCallback_ThenSavesToken', async () => {
    vi.mocked(oauthStateStore.consumeState).mockResolvedValue({ storeId: 'store-cb' })
    vi.mocked(tokenResolver.saveToken).mockResolvedValue(undefined)
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

    const result = await completeConnectFromCallback('auth-code', 'state-x', deps)

    expect(result).toEqual({ success: true, storeId: 'store-cb' })
  })
})
