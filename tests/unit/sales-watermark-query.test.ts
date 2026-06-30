import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GraphQLError } from 'graphql'
import { WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import { createTestContext } from '../helpers/test-context.js'

const mockGetSalesWatermark = vi.fn()
const mockFindActiveBackfill = vi.fn()

vi.mock('../../src/lib/redis/create-redis-client.js', () => ({
  createRedisClient: () => ({}),
}))

vi.mock('../../src/lib/mongo/connection.js', () => ({
  getDb: () => ({}),
}))

vi.mock('../../src/lib/sync/watermark.js', () => ({
  getSalesWatermark: (...args: unknown[]) => mockGetSalesWatermark(...args),
  shrinkWindowStart: (watermark: string, fallback: string) => watermark || fallback,
}))

vi.mock('../../src/lib/conta-azul-client.js', () => ({
  salesDateWindow: () => ({ data_inicio: '2025-01-01', data_fim: '2026-12-31' }),
}))

vi.mock('../../src/lib/sync/store-sync-job-repository.js', () => ({
  StoreSyncJobRepository: vi.fn().mockImplementation(() => ({
    findActiveBackfill: mockFindActiveBackfill,
  })),
  toGraphqlStoreSyncJob: (doc: unknown) => doc,
}))

const { contaAzulSalesWatermark, contaAzulActiveBackfill } = await import(
  '../../src/schema/sync/resolvers/Query/storeSyncProgressQueries.js'
)

describe('sales watermark queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSalesWatermark.mockResolvedValue('2026-02-15T00:00:00Z')
    mockFindActiveBackfill.mockResolvedValue(null)
  })

  it('returns watermark for worker auth', async () => {
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    const value = await contaAzulSalesWatermark(
      null,
      { tenantId: 'tenant-1', storeId: 'store-1' },
      context
    )
    expect(value).toBe('2026-02-15T00:00:00Z')
  })

  it('reports active backfill', async () => {
    mockFindActiveBackfill.mockResolvedValue({ jobId: 'job-1' })
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    const active = await contaAzulActiveBackfill(
      null,
      { tenantId: 'tenant-1', storeId: 'store-1' },
      context
    )
    expect(active).toBe(true)
  })

  it('rejects non-worker auth for watermark query', async () => {
    const context = createTestContext({ tenantId: 'tenant-1' })
    await expect(
      contaAzulSalesWatermark(null, { tenantId: 'tenant-1', storeId: 'store-1' }, context)
    ).rejects.toThrow(GraphQLError)
  })
})
