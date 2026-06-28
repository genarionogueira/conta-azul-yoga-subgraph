import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthConfig } from '../../src/lib/auth-config.js'
import { ConnectionService } from '../../src/lib/credentials/connection-service.js'
import type { OAuthStateStore } from '../../src/lib/oauth-state.js'
import type { TenantTokenStore } from '../../src/lib/credentials/tenant-token-store.js'
import type { ConnectionRepository } from '../../src/lib/connections/connection-repository.js'
import { TEST_TENANT_ID } from '../helpers/test-context.js'

describe('ConnectionService', () => {
  const env = process.env
  let authConfig: AuthConfig
  let oauthStateStore: OAuthStateStore
  let tokenStore: TenantTokenStore
  let connectionRepository: ConnectionRepository
  let storeDataCleaner: { cleanup: ReturnType<typeof vi.fn> }
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
    connectionRepository = {
      upsert: vi.fn(),
      delete: vi.fn(),
      listByTenant: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
    } as unknown as ConnectionRepository
    storeDataCleaner = { cleanup: vi.fn().mockResolvedValue(undefined) }
    service = new ConnectionService({
      authConfig,
      oauthStateStore,
      tokenStore,
      connectionRepository,
      storeDataCleaner,
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
      connectionRepository,
      storeDataCleaner,
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
    expect(connectionRepository.upsert).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'store-1',
      'store-1'
    )
  })

  it('GivenCustomName_WhenCompleteConnect_ThenUpsertsMongoWithName', async () => {
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

    await service.completeConnect(
      TEST_TENANT_ID,
      'store-1',
      'auth-code',
      'valid-state',
      undefined,
      'Butantã'
    )

    expect(connectionRepository.upsert).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'store-1',
      'Butantã'
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
    vi.mocked(tokenStore.getToken).mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3600_000,
      connected_at: Date.now(),
    })

    const result = await service.disconnect(TEST_TENANT_ID, 'store-1')

    expect(result).toEqual({
      success: true,
      storeId: 'store-1',
      error: null,
    })
    expect(storeDataCleaner.cleanup).toHaveBeenCalledWith(TEST_TENANT_ID, 'store-1')
    expect(tokenStore.deleteConnection).toHaveBeenCalledWith(TEST_TENANT_ID, 'store-1')
    expect(connectionRepository.delete).toHaveBeenCalledWith(TEST_TENANT_ID, 'store-1')
  })

  it('GivenConnectedStore_WhenDisconnect_ThenCleanupThenDeleteConnection', async () => {
    const callOrder: string[] = []
    vi.mocked(tokenStore.getToken).mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3600_000,
      connected_at: Date.now(),
    })
    vi.mocked(storeDataCleaner.cleanup).mockImplementation(async () => {
      callOrder.push('cleanup')
    })
    vi.mocked(tokenStore.deleteConnection).mockImplementation(async () => {
      callOrder.push('deleteConnection')
    })

    await service.disconnect(TEST_TENANT_ID, 'store-1')

    expect(callOrder).toEqual(['cleanup', 'deleteConnection'])
  })

  it('GivenCleanupFails_WhenDisconnect_ThenStillDeletesRedisConnection', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3600_000,
      connected_at: Date.now(),
    })
    vi.mocked(storeDataCleaner.cleanup).mockRejectedValue(new Error('Worker disconnect-store failed: 500'))

    const result = await service.disconnect(TEST_TENANT_ID, 'store-1')

    expect(result.success).toBe(true)
    expect(result.error).toContain('500')
    expect(tokenStore.deleteConnection).toHaveBeenCalledWith(TEST_TENANT_ID, 'store-1')
  })

  it('GivenNoToken_WhenDisconnect_ThenSuccessFalse', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue(null)

    const result = await service.disconnect(TEST_TENANT_ID, 'store-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('not connected')
    expect(storeDataCleaner.cleanup).not.toHaveBeenCalled()
    expect(tokenStore.deleteConnection).not.toHaveBeenCalled()
  })

  it('GivenNotConnected_WhenDisconnect_ThenCleanupNotCalled', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue(null)

    await service.disconnect(TEST_TENANT_ID, 'store-1')

    expect(storeDataCleaner.cleanup).not.toHaveBeenCalled()
  })

  it('GivenMongoWithToken_WhenListConnections_ThenReturnsNamedRows', async () => {
    vi.mocked(tokenStore.listConnectedStoreIds).mockResolvedValue(['store-1'])
    vi.mocked(tokenStore.getToken).mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3600_000,
      connected_at: Date.parse('2026-06-27T19:00:00.000Z'),
    })
    vi.mocked(connectionRepository.listByTenant).mockResolvedValue([
      {
        tenantId: TEST_TENANT_ID,
        id: 'store-1',
        name: 'Butantã',
        connectedAt: new Date('2026-06-27T19:00:00.000Z'),
        updatedAt: new Date('2026-06-27T19:00:00.000Z'),
      },
    ])

    const rows = await service.listConnections(TEST_TENANT_ID)

    expect(rows).toEqual([
      {
        id: 'store-1',
        name: 'Butantã',
        connectedAt: '2026-06-27T19:00:00.000Z',
        isConnected: true,
      },
    ])
  })

  it('GivenMongoWithoutToken_WhenListConnections_ThenPrunesOrphanDoc', async () => {
    vi.mocked(tokenStore.listConnectedStoreIds).mockResolvedValue([])
    vi.mocked(connectionRepository.listByTenant).mockResolvedValue([
      {
        tenantId: TEST_TENANT_ID,
        id: 'orphan-store',
        name: 'Orphan',
        connectedAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const rows = await service.listConnections(TEST_TENANT_ID)

    expect(rows).toEqual([])
    expect(connectionRepository.delete).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'orphan-store'
    )
  })

  it('GivenConnectedStore_WhenUpdateConnection_ThenUpsertsName', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3600_000,
      connected_at: Date.now(),
    })

    const result = await service.updateConnection(TEST_TENANT_ID, 'store-1', 'Renamed Store')

    expect(result).toEqual({
      success: true,
      id: 'store-1',
      name: 'Renamed Store',
      error: null,
    })
    expect(connectionRepository.upsert).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'store-1',
      'Renamed Store'
    )
  })

  it('GivenEmptyName_WhenUpdateConnection_ThenUpsertsIdAsName', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3600_000,
      connected_at: Date.now(),
    })

    const result = await service.updateConnection(TEST_TENANT_ID, 'store-1', '')

    expect(result).toEqual({
      success: true,
      id: 'store-1',
      name: 'store-1',
      error: null,
    })
    expect(connectionRepository.upsert).toHaveBeenCalledWith(TEST_TENANT_ID, 'store-1', '')
  })

  it('GivenWhitespaceOnlyName_WhenUpdateConnection_ThenUpsertsIdAsName', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3600_000,
      connected_at: Date.now(),
    })

    const result = await service.updateConnection(TEST_TENANT_ID, 'store-1', '   ')

    expect(result).toEqual({
      success: true,
      id: 'store-1',
      name: 'store-1',
      error: null,
    })
  })

  it('GivenNoToken_WhenUpdateConnection_ThenSuccessFalse', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue(null)

    const result = await service.updateConnection(TEST_TENANT_ID, 'store-1', 'Renamed')

    expect(result.success).toBe(false)
    expect(result.name).toBeNull()
    expect(result.error).toContain('not connected')
    expect(connectionRepository.upsert).not.toHaveBeenCalled()
  })

  it('GivenInvalidStoreId_WhenUpdateConnection_ThenThrows', async () => {
    await expect(
      service.updateConnection(TEST_TENANT_ID, 'bad id!', 'Renamed')
    ).rejects.toThrow('Invalid storeId')
  })

  it('GivenTokenWithoutMongo_WhenListConnections_ThenLazyUpsertsAndReturnsIdAsName', async () => {
    vi.mocked(tokenStore.listConnectedStoreIds).mockResolvedValue(['legacy-store'])
    vi.mocked(tokenStore.getToken).mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3600_000,
      connected_at: Date.parse('2026-06-27T19:00:00.000Z'),
    })
    vi.mocked(connectionRepository.listByTenant).mockResolvedValue([])

    const rows = await service.listConnections(TEST_TENANT_ID)

    expect(connectionRepository.upsert).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'legacy-store',
      'legacy-store'
    )
    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: 'legacy-store',
        name: 'legacy-store',
        isConnected: true,
      })
    )
  })
})
