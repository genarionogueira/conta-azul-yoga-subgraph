import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionService } from '../../src/lib/credentials/connection-service.js'
import { AuthConfig } from '../../src/lib/auth-config.js'
import type { OAuthStateStore } from '../../src/lib/oauth-state.js'
import type { TenantTokenStore } from '../../src/lib/credentials/tenant-token-store.js'
import type { ConnectionRepository } from '../../src/lib/connections/connection-repository.js'
import { TEST_TENANT_ID } from '../helpers/test-context.js'

const mockEnqueueStoreReconcileJob = vi.fn()
const mockRedisQuit = vi.fn()

vi.mock('../../src/lib/redis/create-redis-client.js', () => ({
  createRedisClient: () => ({ quit: mockRedisQuit }),
}))

vi.mock('../../src/lib/sync/store-sync-job-service.js', () => ({
  enqueueStoreReconcileJob: (...args: unknown[]) => mockEnqueueStoreReconcileJob(...args),
}))

vi.mock('../../src/lib/conta-azul-oauth.js', () => ({
  exchangeAuthorizationCode: vi.fn().mockResolvedValue({
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
  }),
}))

vi.stubGlobal('fetch', vi.fn())

describe('connect enqueues BACKFILL', () => {
  const env = process.env

  beforeEach(() => {
    process.env = {
      ...env,
      REDIS_URL: 'redis://localhost:6379',
      CONTA_AZUL_CLIENT_ID: 'test-client-id',
      CONTA_AZUL_CLIENT_SECRET: 'test-client-secret',
      CONTA_AZUL_REDIRECT_URI: 'http://localhost:4000/callback',
      CONTA_AZUL_AUTH_URL: 'https://auth.example.com/login',
      CONTA_AZUL_TOKEN_URL: 'https://auth.example.com/oauth2/token',
    }
    mockEnqueueStoreReconcileJob.mockResolvedValue({ jobId: 'job-connect-1', streamId: '1-0' })
    mockRedisQuit.mockResolvedValue('OK')
  })

  afterEach(() => {
    process.env = env
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns jobId and enqueues BACKFILL on successful connect', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ documento: '12.345.678/0001-90', nome: 'Empresa' }), {
        status: 200,
      })
    )
    const oauthStateStore = {
      consumeState: vi.fn().mockResolvedValue({
        tenantId: TEST_TENANT_ID,
        storeId: 'store-1',
        returnUrl: undefined,
      }),
      markCompleted: vi.fn().mockResolvedValue(undefined),
      peekCompleted: vi.fn().mockResolvedValue(null),
    } as unknown as OAuthStateStore

    const service = new ConnectionService({
      authConfig: new AuthConfig(),
      oauthStateStore,
      tokenStore: {
        saveConnection: vi.fn(),
      } as unknown as TenantTokenStore,
      connectionRepository: {
        findByContaAzulAccountId: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          connectionId: 'conn-1',
          storeId: 'store-1',
          status: 'ACTIVE',
        }),
        hasSyncedData: vi.fn().mockResolvedValue(false),
      } as unknown as ConnectionRepository,
    })

    const result = await service.completeConnectForTenant(
      TEST_TENANT_ID,
      'code-123',
      'state-abc'
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.jobId).toBe('job-connect-1')
    }
    expect(mockEnqueueStoreReconcileJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: 'BACKFILL', trigger: 'connect' })
    )
  })
})
