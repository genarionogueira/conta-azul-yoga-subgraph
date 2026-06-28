import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestContext, TEST_TENANT_ID } from '../helpers/test-context.js'

const mockStartConnect = vi.fn()
const mockCompleteConnect = vi.fn()
const mockGetStatus = vi.fn()
const mockListConnected = vi.fn()
const mockListConnections = vi.fn()
const mockDisconnect = vi.fn()
const mockUpdateConnection = vi.fn()

vi.mock('../../src/schema/auth/oauth-services.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/schema/auth/oauth-services.js')>()
  return {
    ...actual,
    connectionService: {
      startConnect: (...args: unknown[]) => mockStartConnect(...args),
      completeConnect: (...args: unknown[]) => mockCompleteConnect(...args),
      getStatus: (...args: unknown[]) => mockGetStatus(...args),
      listConnected: (...args: unknown[]) => mockListConnected(...args),
      listConnections: (...args: unknown[]) => mockListConnections(...args),
      disconnect: (...args: unknown[]) => mockDisconnect(...args),
      updateConnection: (...args: unknown[]) => mockUpdateConnection(...args),
    },
  }
})

const { contaAzulAuthConfig } = await import(
  '../../src/schema/auth/resolvers/Query/contaAzulAuthConfig.js'
)
const { authorizationUrl } = await import(
  '../../src/schema/auth/resolvers/Query/authorizationUrl.js'
)
const { connectionStatus } = await import(
  '../../src/schema/auth/resolvers/Query/connectionStatus.js'
)
const { connectedStores } = await import(
  '../../src/schema/auth/resolvers/Query/connectedStores.js'
)
const { connections } = await import('../../src/schema/auth/resolvers/Query/connections.js')
const { setupConnection } = await import(
  '../../src/schema/auth/resolvers/Mutation/setupConnection.js'
)
const { disconnectStore } = await import(
  '../../src/schema/auth/resolvers/Mutation/disconnectStore.js'
)
const { updateConnection } = await import(
  '../../src/schema/auth/resolvers/Mutation/updateConnection.js'
)

describe('auth resolvers', () => {
  const env = process.env
  const context = createTestContext()

  beforeEach(() => {
    process.env = {
      ...env,
      CONTA_AZUL_CLIENT_ID: 'test-client-id',
      CONTA_AZUL_CLIENT_SECRET: 'test-client-secret',
      CONTA_AZUL_REDIRECT_URI: 'http://localhost:4000/callback',
      CONTA_AZUL_AUTH_URL: 'https://auth.example.com/login',
      CONTA_AZUL_TOKEN_URL: 'https://auth.example.com/oauth2/token',
    }
    mockStartConnect.mockReset()
    mockCompleteConnect.mockReset()
    mockGetStatus.mockReset()
    mockListConnected.mockReset()
    mockListConnections.mockReset()
    mockDisconnect.mockReset()
    mockUpdateConnection.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    process.env = env
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('GivenConfiguredEnv_WhenContaAzulAuthConfig_ThenReturnsSnapshot', async () => {
    const result = await contaAzulAuthConfig({}, {}, context, {} as never)

    expect(result).toEqual({
      redirectUri: 'http://localhost:4000/callback',
      authUrl: 'https://auth.example.com/login',
      tokenUrl: 'https://auth.example.com/oauth2/token',
      clientIdConfigured: true,
    })
  })

  it('GivenStoreId_WhenAuthorizationUrl_ThenReturnsUrlWithState', async () => {
    mockStartConnect.mockResolvedValue({
      storeId: 'store-1',
      state: 'state-abc',
      url: 'https://auth.example.com/authorize?state=state-abc',
    })

    const result = await authorizationUrl({}, { storeId: 'store-1' }, context, {} as never)

    expect(result.storeId).toBe('store-1')
    expect(result.state).toBe('state-abc')
    expect(mockStartConnect).toHaveBeenCalledWith(TEST_TENANT_ID, 'store-1', undefined)
  })

  it('GivenMissingClientId_WhenAuthorizationUrl_ThenThrowsAuthConfigError', async () => {
    delete process.env.CONTA_AZUL_CLIENT_ID
    mockStartConnect.mockRejectedValue(new Error('CONTA_AZUL_CLIENT_ID is not configured'))

    await expect(
      authorizationUrl({}, { storeId: 'store-1' }, context, {} as never)
    ).rejects.toThrow('CONTA_AZUL_CLIENT_ID is not configured')
  })

  it('GivenValidStateAndCode_WhenSetupConnection_ThenSavesTokenAndSucceeds', async () => {
    mockCompleteConnect.mockResolvedValue({
      success: true,
      storeId: 'store-1',
    })

    const result = await setupConnection(
      {},
      {
        storeId: 'store-1',
        code: 'auth-code',
        state: 'valid-state',
      },
      context,
      {} as never
    )

    expect(result).toEqual({
      success: true,
      storeId: 'store-1',
      error: null,
    })
    expect(mockCompleteConnect).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'store-1',
      'auth-code',
      'valid-state',
      undefined,
      undefined
    )
  })

  it('GivenCustomName_WhenSetupConnection_ThenPassesNameToService', async () => {
    mockCompleteConnect.mockResolvedValue({
      success: true,
      storeId: 'store-1',
    })

    await setupConnection(
      {},
      {
        storeId: 'store-1',
        code: 'auth-code',
        state: 'valid-state',
        name: 'Butantã',
      },
      context,
      {} as never
    )

    expect(mockCompleteConnect).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'store-1',
      'auth-code',
      'valid-state',
      undefined,
      'Butantã'
    )
  })

  it('GivenMismatchedStateStoreId_WhenSetupConnection_ThenReturnsError', async () => {
    mockCompleteConnect.mockResolvedValue({
      success: false,
      storeId: 'store-1',
      error: 'Invalid or expired OAuth state',
    })

    const result = await setupConnection(
      {},
      {
        storeId: 'store-1',
        code: 'auth-code',
        state: 'valid-state',
      },
      context,
      {} as never
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid or expired OAuth state')
  })

  it('GivenMissingState_WhenSetupConnection_ThenReturnsError', async () => {
    mockCompleteConnect.mockResolvedValue({
      success: false,
      storeId: 'store-1',
      error: 'Invalid or expired OAuth state',
    })

    const result = await setupConnection(
      {},
      {
        storeId: 'store-1',
        code: 'auth-code',
        state: 'expired-state',
      },
      context,
      {} as never
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid or expired OAuth state')
  })

  it('GivenTokenExchangeFailure_WhenSetupConnection_ThenReturnsErrorMessage', async () => {
    mockCompleteConnect.mockResolvedValue({
      success: false,
      storeId: 'store-1',
      error: 'Authorization code exchange failed: 401',
    })

    const result = await setupConnection(
      {},
      {
        storeId: 'store-1',
        code: 'bad-code',
        state: 'valid-state',
      },
      context,
      {} as never
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('Authorization code exchange failed')
  })

  it('GivenTokenInRedis_WhenConnectionStatus_ThenIsConnectedTrue', async () => {
    mockGetStatus.mockResolvedValue({
      storeId: 'store-1',
      isConnected: true,
      connectedAt: '2026-06-21T00:00:00.000Z',
      expiresAt: '2026-06-22T00:00:00.000Z',
      error: null,
    })

    const result = await connectionStatus({}, { storeId: 'store-1' }, context, {} as never)

    expect(result).toEqual({
      storeId: 'store-1',
      isConnected: true,
      connectedAt: '2026-06-21T00:00:00.000Z',
      expiresAt: '2026-06-22T00:00:00.000Z',
      error: null,
    })
  })

  it('GivenNoToken_WhenConnectionStatus_ThenIsConnectedFalse', async () => {
    mockGetStatus.mockResolvedValue({
      storeId: 'store-1',
      isConnected: false,
      connectedAt: null,
      expiresAt: null,
      error: null,
    })

    const result = await connectionStatus({}, { storeId: 'store-1' }, context, {} as never)

    expect(result.isConnected).toBe(false)
  })

  it('GivenConnectedStores_WhenQuery_ThenListsStoreIds', async () => {
    mockListConnected.mockResolvedValue([
      { storeId: 'store-a', isConnected: true, connectedAt: null, expiresAt: null },
      { storeId: 'store-b', isConnected: true, connectedAt: null, expiresAt: null },
    ])

    const result = await connectedStores({}, {}, context, {} as never)

    expect(result).toEqual([
      { storeId: 'store-a', isConnected: true, connectedAt: null, expiresAt: null },
      { storeId: 'store-b', isConnected: true, connectedAt: null, expiresAt: null },
    ])
  })

  it('GivenConnections_WhenQuery_ThenListsIdAndName', async () => {
    mockListConnections.mockResolvedValue([
      {
        id: 'store-a',
        name: 'Butantã',
        connectedAt: '2026-06-27T19:00:00.000Z',
        isConnected: true,
      },
    ])

    const result = await connections({}, {}, context, {} as never)

    expect(result).toEqual([
      {
        id: 'store-a',
        name: 'Butantã',
        connectedAt: '2026-06-27T19:00:00.000Z',
        isConnected: true,
      },
    ])
    expect(mockListConnections).toHaveBeenCalledWith(TEST_TENANT_ID)
  })

  it('GivenExistingToken_WhenDisconnectStore_ThenSuccessTrue', async () => {
    mockDisconnect.mockResolvedValue({
      success: true,
      storeId: 'store-1',
      error: null,
    })

    const result = await disconnectStore({}, { storeId: 'store-1' }, context, {} as never)

    expect(result).toEqual({
      success: true,
      storeId: 'store-1',
      error: null,
    })
  })

  it('GivenNoToken_WhenDisconnectStore_ThenSuccessFalse', async () => {
    mockDisconnect.mockResolvedValue({
      success: false,
      storeId: 'store-1',
      error: 'Store store-1 is not connected',
    })

    const result = await disconnectStore({}, { storeId: 'store-1' }, context, {} as never)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not connected')
  })

  it('GivenValidArgs_WhenUpdateConnection_ThenDelegatesToService', async () => {
    mockUpdateConnection.mockResolvedValue({
      success: true,
      id: 'store-1',
      name: 'Renamed Store',
      error: null,
    })

    const result = await updateConnection(
      {},
      { id: 'store-1', name: 'Renamed Store' },
      context,
      {} as never
    )

    expect(result).toEqual({
      success: true,
      id: 'store-1',
      name: 'Renamed Store',
      error: null,
    })
    expect(mockUpdateConnection).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      'store-1',
      'Renamed Store'
    )
  })

  it('GivenServiceFailure_WhenUpdateConnection_ThenReturnsErrorPayload', async () => {
    mockUpdateConnection.mockResolvedValue({
      success: false,
      id: 'store-1',
      name: null,
      error: 'Store store-1 is not connected',
    })

    const result = await updateConnection(
      {},
      { id: 'store-1', name: 'Renamed Store' },
      context,
      {} as never
    )

    expect(result.success).toBe(false)
    expect(result.name).toBeNull()
    expect(result.error).toContain('not connected')
  })
})
