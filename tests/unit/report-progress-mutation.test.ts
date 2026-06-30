import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import { createTestContext } from '../helpers/test-context.js'

const mockUpsertProgress = vi.fn()
const mockAppend = vi.fn()

vi.mock('../../src/lib/mongo/connection.js', () => ({
  getDb: () => ({}),
}))

vi.mock('../../src/lib/sync/store-sync-job-repository.js', () => ({
  StoreSyncJobRepository: vi.fn().mockImplementation(() => ({
    upsertProgress: mockUpsertProgress,
  })),
  toGraphqlStoreSyncJob: (doc: unknown) => doc,
}))

vi.mock('../../src/lib/sync/store-sync-job-buffer.js', () => ({
  getStoreSyncJobBuffer: () => ({ append: mockAppend }),
}))

const { reportStoreSyncProgress } = await import(
  '../../src/schema/sync/resolvers/Mutation/reportStoreSyncProgress.js'
)

describe('reportStoreSyncProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsertProgress.mockResolvedValue({
      jobId: 'job-1',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      phase: 'BACKFILL',
      status: 'RUNNING',
      percentage: 40,
      resources: [],
      startedAt: new Date(),
      updatedAt: new Date(),
    })
  })

  it('upserts progress and publishes to buffer for worker auth', async () => {
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    await reportStoreSyncProgress(
      null,
      {
        input: {
          jobId: 'job-1',
          tenantId: 'tenant-1',
          storeId: 'store-1',
          phase: 'BACKFILL',
          status: 'RUNNING',
          percentage: 40,
          resources: [],
        },
      },
      context
    )
    expect(mockUpsertProgress).toHaveBeenCalled()
    expect(mockAppend).toHaveBeenCalledWith('job-1', expect.any(Object))
  })
})
