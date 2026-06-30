import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import { createTestContext } from '../helpers/test-context.js'

const mockPersistToCollection = vi.fn()
const mockGetSalesWatermark = vi.fn()
const mockSetSalesWatermark = vi.fn()

vi.mock('../../src/lib/mongo/connection.js', () => ({
  getDb: () => ({}),
}))

vi.mock('../../src/lib/redis/create-redis-client.js', () => ({
  createRedisClient: () => ({}),
}))

vi.mock('../../src/lib/sync/watermark.js', () => ({
  getSalesWatermark: (...args: unknown[]) => mockGetSalesWatermark(...args),
  setSalesWatermark: (...args: unknown[]) => mockSetSalesWatermark(...args),
  maxDataAlteracao: (values: Array<string | null>) =>
    values.filter(Boolean).sort().at(-1) ?? null,
}))

vi.mock('../../src/lib/persist/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/persist/index.js')>()
  return {
    ...actual,
    persistToCollection: (...args: unknown[]) => mockPersistToCollection(...args),
  }
})

const { persistSales } = await import(
  '../../src/schema/persist/resolvers/Mutation/persistMutations.js'
)

describe('persistSales watermark advance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPersistToCollection.mockResolvedValue({ synced: 1, deleted: 0 })
  })

  it('advances watermark when newer dataAlteracao arrives', async () => {
    mockGetSalesWatermark.mockResolvedValue('2026-01-01T00:00:00Z')
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    await persistSales(
      null,
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        documents: [{ id: 'sale-1', data: { dataAlteracao: '2026-02-01T00:00:00Z' } }],
      },
      context
    )
    expect(mockSetSalesWatermark).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      'store-1',
      '2026-02-01T00:00:00Z'
    )
  })

  it('does not regress watermark for older dataAlteracao', async () => {
    mockGetSalesWatermark.mockResolvedValue('2026-03-01T00:00:00Z')
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    await persistSales(
      null,
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        documents: [{ id: 'sale-1', data: { dataAlteracao: '2026-01-01T00:00:00Z' } }],
      },
      context
    )
    expect(mockSetSalesWatermark).not.toHaveBeenCalled()
  })
})
