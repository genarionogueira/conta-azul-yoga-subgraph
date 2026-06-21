import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthConfig } from '../../src/lib/auth-config.js'
import { ConnectionService } from '../../src/lib/credentials/connection-service.js'
import { NoopCredentialsEventBus } from '../../src/lib/credentials/event-bus.js'
import type { OAuthStateStore } from '../../src/lib/oauth-state.js'
import type { TenantTokenStore } from '../../src/lib/credentials/tenant-token-store.js'
import { TEST_TENANT_ID } from '../helpers/test-context.js'

describe('ConnectionService', () => {
  const env = process.env
  let authConfig: AuthConfig
  let oauthStateStore: OAuthStateStore
  let tokenStore: TenantTokenStore
  let service: ConnectionService

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
    tokenStore = {
      saveConnection: vi.fn(),
      deleteConnection: vi.fn(),
      getToken: vi.fn(),
      listConnectedStoreIds: vi.fn(),
      listConnectedStores: vi.fn(),
      ensureFreshToken: vi.fn(),
    } as unknown as TenantTokenStore
    service = new ConnectionService({
      authConfig,
      oauthStateStore,
      tokenStore,
      eventBus: new NoopCredentialsEventBus(),
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    process.env = env
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('GivenStoreId_WhenStartConnect_ThenReturnsUrlWithState', async () => {
    vi.mocked(oauthStateStore.createState).mockResolvedValue('state-abc')

    const result = await service.startConnect(TEST_TENANT_ID, 'store-1')

    expect(result.storeId).toBe('store-1')
    expect(result.state).toBe('state-abc')
    expect(result.url).toContain('client_id=test-client-id')
    expect(oauthStateStore.createState).toHaveBeenCalledWith(TEST_TENANT_ID, 'store-1', undefined)
  })

  it('GivenMissingClientId_WhenStartConnect_ThenThrowsAuthConfigError', async () => {
    delete process.env.CONTA_AZUL_CLIENT_ID
    authConfig = new AuthConfig()
    service = new ConnectionService({
      authConfig,
      oauthStateStore,
      tokenStore,
      eventBus: new NoopCredentialsEventBus(),
    })

    await expect(service.startConnect(TEST_TENANT_ID, 'store-1')).rejects.toThrow(
      'CONTA_AZUL_CLIENT_ID is not configured'
    )
  })

  it('GivenValidCodeAndState_WhenCompleteConnect_ThenSavesToken', async () => {
    vi.mocked(oauthStateStore.consumeState).mockResolvedValue({
      tenantId: TEST_TENANT_ID,
      storeId: 'store-1',
    })
    vi.mocked(tokenStore.saveConnection).mockResolvedValue(undefined)
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

    const result = await service.completeConnect(
      TEST_TENANT_ID,
      'store-1',
      'auth-code',
      'valid-state'
    )

    expect(result).toEqual({ success: true, storeId: 'store-1' })
    expect(tokenStore.saveConnection).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'store-1',
      expect.objectContaining({ access_token: 'access' })
    )
  })

  it('GivenMismatchedTenant_WhenCompleteConnect_ThenReturnsError', async () => {
    vi.mocked(oauthStateStore.consumeState).mockResolvedValue({
      tenantId: 'other-tenant',
      storeId: 'store-1',
    })

    const result = await service.completeConnect(
      TEST_TENANT_ID,
      'store-1',
      'auth-code',
      'valid-state'
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid or expired OAuth state')
    expect(tokenStore.saveConnection).not.toHaveBeenCalled()
  })

  it('GivenValidCallback_WhenCompleteConnectFromCallback_ThenSavesToken', async () => {
    vi.mocked(oauthStateStore.consumeState).mockResolvedValue({
      tenantId: TEST_TENANT_ID,
      storeId: 'store-cb',
    })
    vi.mocked(tokenStore.saveConnection).mockResolvedValue(undefined)
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

    const result = await service.completeConnectFromCallback('auth-code', 'state-x')

    expect(result).toEqual({ success: true, storeId: 'store-cb' })
  })

  it('GivenExistingToken_WhenDisconnect_ThenSuccessTrue', async () => {
    vi.mocked(tokenStore.deleteConnection).mockResolvedValue(true)

    const result = await service.disconnect(TEST_TENANT_ID, 'store-1')

    expect(result).toEqual({
      success: true,
      storeId: 'store-1',
      error: null,
    })
  })

  it('GivenNoToken_WhenDisconnect_ThenSuccessFalse', async () => {
    vi.mocked(tokenStore.deleteConnection).mockResolvedValue(false)

    const result = await service.disconnect(TEST_TENANT_ID, 'store-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('not connected')
  })
})
