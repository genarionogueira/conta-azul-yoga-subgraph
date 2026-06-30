import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import { createTestContext } from '../helpers/test-context.js'

const mockEnqueueStoreReconcileJob = vi.fn()

vi.mock('../../src/lib/redis/create-redis-client.js', () => ({
  createRedisClient: () => ({}),
}))

vi.mock('../../src/lib/sync/store-sync-job-service.js', () => ({
  enqueueStoreReconcileJob: (...args: unknown[]) => mockEnqueueStoreReconcileJob(...args),
}))

const { enqueueReconcileStore } = await import(
  '../../src/schema/sync/resolvers/Mutation/granularSyncMutations.js'
)

describe('enqueueReconcileStore mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueueStoreReconcileJob.mockResolvedValue({ jobId: 'uuid-job', streamId: '1-0' })
  })

  it('passes mode and returns jobId', async () => {
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    const result = await enqueueReconcileStore(
      null,
      { tenantId: 'tenant-1', storeId: 'store-1', trigger: 'manual', mode: 'BACKFILL' },
      context
    )
    expect(result).toEqual({ enqueued: true, jobId: 'uuid-job' })
    expect(mockEnqueueStoreReconcileJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: 'BACKFILL' })
    )
  })
})
