import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthConfig } from '../../src/lib/auth-config.js'
import { ConnectionService } from '../../src/lib/credentials/connection-service.js'
import type { OAuthStateStore } from '../../src/lib/oauth-state.js'
import type { TenantTokenStore } from '../../src/lib/credentials/tenant-token-store.js'
import type { ConnectionRepository } from '../../src/lib/connections/connection-repository.js'
import { TEST_TENANT_ID } from '../helpers/test-context.js'

function mockOAuthAndAccountFetch() {
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const href = typeof input === 'string' ? input : input.toString()
    if (href.includes('conta-conectada')) {
      return new Response(
        JSON.stringify({ documento: '12.345.678/0001-90', nome: 'Empresa Teste' }),
        { status: 200 }
      )
    }
    return new Response(
      JSON.stringify({
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 3600,
      }),
      { status: 200 }
    )
  })
}

function createConnectionDoc(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TEST_TENANT_ID,
    connectionId: 'conn-1',
    storeId: 'store-1',
    contaAzulAccountId: '12345678000190',
    name: 'store-1',
    status: 'ACTIVE' as const,
    connectedAt: new Date('2026-06-27T19:00:00.000Z'),
    disconnectedAt: null,
    updatedAt: new Date('2026-06-27T19:00:00.000Z'),
    ...overrides,
  }
}

const mockEnqueueStoreReconcileJob = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ jobId: 'job-test', streamId: '1-0' })
)
const mockEnqueueStoreDisconnectJob = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ jobId: 'disconnect-job', streamId: '2-0' })
)

vi.mock('../../src/lib/redis/create-redis-client.js', () => ({
  createRedisClient: () => ({ quit: vi.fn().mockResolvedValue('OK') }),
}))

vi.mock('../../src/lib/sync/store-sync-job-service.js', () => ({
  enqueueStoreReconcileJob: (...args: unknown[]) => mockEnqueueStoreReconcileJob(...args),
  enqueueStoreDisconnectJob: (...args: unknown[]) => mockEnqueueStoreDisconnectJob(...args),
}))

describe('ConnectionService', () => {
  const env = process.env
  let authConfig: AuthConfig
  let oauthStateStore: OAuthStateStore
  let tokenStore: TenantTokenStore
  let connectionRepository: ConnectionRepository
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
      markCompleted: vi.fn().mockResolvedValue(undefined),
      peekCompleted: vi.fn().mockResolvedValue(null),
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
      upsertActiveName: vi.fn(),
      delete: vi.fn(),
      create: vi.fn().mockImplementation(async (_tenantId, storeId, _cnpj, name) =>
        createConnectionDoc({ storeId, name: name ?? storeId })
      ),
      findByContaAzulAccountId: vi.fn().mockResolvedValue(null),
      findActiveByStoreId: vi.fn().mockResolvedValue(createConnectionDoc()),
      findByConnectionId: vi.fn(),
      hasSyncedData: vi.fn().mockResolvedValue(false),
      listByTenant: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      reactivate: vi.fn(),
      softDisconnect: vi.fn(),
      migrateStoreId: vi.fn(),
    } as unknown as ConnectionRepository
    service = new ConnectionService({
      authConfig,
      oauthStateStore,
      tokenStore,
      connectionRepository,
    })
    vi.stubGlobal('fetch', vi.fn())
    mockEnqueueStoreReconcileJob.mockResolvedValue({ jobId: 'job-test', streamId: '1-0' })
    mockEnqueueStoreDisconnectJob.mockResolvedValue({
      jobId: 'disconnect-job',
      streamId: '2-0',
    })
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
    mockOAuthAndAccountFetch()

    const result = await service.completeConnect(
      TEST_TENANT_ID,
      'store-1',
      'auth-code',
      'valid-state'
    )

    expect(result).toEqual({ success: true, storeId: 'store-1', jobId: 'job-test' })
    expect(tokenStore.saveConnection).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'conn-1',
      'store-1',
      expect.objectContaining({ access_token: 'access' })
    )
    expect(connectionRepository.create).toHaveBeenCalled()
  })

  it('GivenCustomName_WhenCompleteConnect_ThenUpsertsMongoWithName', async () => {
    vi.mocked(oauthStateStore.consumeState).mockResolvedValue({
      tenantId: TEST_TENANT_ID,
      storeId: 'store-1',
    })
    vi.mocked(tokenStore.saveConnection).mockResolvedValue(undefined)
    mockOAuthAndAccountFetch()

    await service.completeConnect(
      TEST_TENANT_ID,
      'store-1',
      'auth-code',
      'valid-state',
      undefined,
      'Butantã'
    )

    expect(connectionRepository.create).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'store-1',
      '12345678000190',
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
    mockOAuthAndAccountFetch()

    const result = await service.completeConnectFromCallback('auth-code', 'state-x')

    expect(result).toEqual({ success: true, storeId: 'store-cb', jobId: 'job-test' })
    expect(oauthStateStore.markCompleted).toHaveBeenCalledWith(
      'state-x',
      expect.objectContaining({ storeId: 'store-cb', jobId: 'job-test' })
    )
  })

  it('GivenAlreadyCompletedState_WhenCompleteConnectFromCallback_ThenReplaysSuccess', async () => {
    vi.mocked(oauthStateStore.consumeState).mockResolvedValue(null)
    vi.mocked(oauthStateStore.peekCompleted).mockResolvedValue({
      storeId: 'store-cb',
      jobId: 'job-prev',
      returnUrl: 'https://dev.avocado.tech/',
    })

    const result = await service.completeConnectFromCallback('reused-code', 'state-x')

    expect(result).toEqual({
      success: true,
      storeId: 'store-cb',
      jobId: 'job-prev',
      returnUrl: 'https://dev.avocado.tech/',
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(tokenStore.saveConnection).not.toHaveBeenCalled()
  })

  it('GivenUnknownState_WhenCompleteConnectFromCallback_ThenReturnsError', async () => {
    vi.mocked(oauthStateStore.consumeState).mockResolvedValue(null)
    vi.mocked(oauthStateStore.peekCompleted).mockResolvedValue(null)

    const result = await service.completeConnectFromCallback('code', 'state-x')

    expect(result.success).toBe(false)
    expect(result).toMatchObject({ error: 'Invalid or expired OAuth state' })
  })

  it('GivenExistingToken_WhenDisconnect_ThenReturnsJobId', async () => {
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
      jobId: 'disconnect-job',
      error: null,
    })
    expect(mockEnqueueStoreDisconnectJob).toHaveBeenCalledWith(expect.anything(), {
      tenantId: TEST_TENANT_ID,
      storeId: 'store-1',
      connectionId: 'conn-1',
    })
    expect(tokenStore.deleteConnection).not.toHaveBeenCalled()
    expect(connectionRepository.delete).not.toHaveBeenCalled()
  })

  it('GivenConnectedStore_WhenDisconnect_ThenEnqueuesWithoutDeletingToken', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3600_000,
      connected_at: Date.now(),
    })

    await service.disconnect(TEST_TENANT_ID, 'store-1')

    expect(mockEnqueueStoreDisconnectJob).toHaveBeenCalled()
    expect(tokenStore.deleteConnection).not.toHaveBeenCalled()
  })

  it('GivenNoToken_WhenDisconnect_ThenSuccessFalse', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue(null)

    const result = await service.disconnect(TEST_TENANT_ID, 'store-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('not connected')
    expect(mockEnqueueStoreDisconnectJob).not.toHaveBeenCalled()
    expect(tokenStore.deleteConnection).not.toHaveBeenCalled()
  })

  it('GivenNotConnected_WhenDisconnect_ThenEnqueueNotCalled', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue(null)

    await service.disconnect(TEST_TENANT_ID, 'store-1')

    expect(mockEnqueueStoreDisconnectJob).not.toHaveBeenCalled()
  })

  it('GivenMongoWithToken_WhenListConnections_ThenReturnsNamedRows', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3600_000,
      connected_at: Date.parse('2026-06-27T19:00:00.000Z'),
    })
    vi.mocked(connectionRepository.listByTenant).mockResolvedValue([
      createConnectionDoc({ storeId: 'store-1', name: 'Butantã' }),
    ])

    const rows = await service.listConnections(TEST_TENANT_ID)

    expect(rows).toEqual([
      {
        connectionId: 'conn-1',
        storeId: 'store-1',
        id: 'store-1',
        name: 'Butantã',
        status: 'ACTIVE',
        connectedAt: '2026-06-27T19:00:00.000Z',
        disconnectedAt: null,
        isConnected: true,
      },
    ])
  })

  it('GivenMongoWithoutToken_WhenListConnections_ThenReturnsDisconnectedRow', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue(null)
    vi.mocked(connectionRepository.listByTenant).mockResolvedValue([
      createConnectionDoc({
        storeId: 'orphan-store',
        name: 'Orphan',
        status: 'DISCONNECTED',
        disconnectedAt: new Date('2026-06-28T10:00:00.000Z'),
      }),
    ])

    const rows = await service.listConnections(TEST_TENANT_ID)

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'orphan-store',
        status: 'DISCONNECTED',
        isConnected: false,
      }),
    ])
    expect(connectionRepository.delete).not.toHaveBeenCalled()
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
    expect(connectionRepository.upsertActiveName).toHaveBeenCalledWith(
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
    expect(connectionRepository.upsertActiveName).toHaveBeenCalledWith(TEST_TENANT_ID, 'store-1', '')
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
    expect(connectionRepository.upsertActiveName).not.toHaveBeenCalled()
  })

  it('GivenInvalidStoreId_WhenUpdateConnection_ThenThrows', async () => {
    await expect(
      service.updateConnection(TEST_TENANT_ID, 'bad id!', 'Renamed')
    ).rejects.toThrow('Invalid storeId')
  })

  it('GivenDisconnectedMongoRow_WhenListConnections_ThenReturnsWithoutToken', async () => {
    vi.mocked(tokenStore.getToken).mockResolvedValue(null)
    vi.mocked(connectionRepository.listByTenant).mockResolvedValue([
      createConnectionDoc({
        storeId: 'legacy-store',
        status: 'DISCONNECTED',
        disconnectedAt: new Date('2026-06-28T10:00:00.000Z'),
      }),
    ])

    const rows = await service.listConnections(TEST_TENANT_ID)

    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: 'legacy-store',
        isConnected: false,
        status: 'DISCONNECTED',
      })
    )
  })
})
