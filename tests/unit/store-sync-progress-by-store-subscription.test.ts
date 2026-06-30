import { afterEach, describe, expect, it, vi } from 'vitest'
import { GraphQLError } from 'graphql'
import { WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import {
  getStoreSyncJobBuffer,
  resetStoreSyncJobBufferForTests,
} from '../../src/lib/sync/store-sync-job-buffer.js'
import { storeSyncProgressByStoreSubscription } from '../../src/schema/sync/resolvers/Subscription/storeSyncProgressByStore.js'
import { createTestContext } from '../helpers/test-context.js'

const mockFindActiveJob = vi.fn()

vi.mock('../../src/lib/mongo/connection.js', () => ({
  getDb: () => ({}),
}))

vi.mock('../../src/lib/sync/store-sync-job-repository.js', () => ({
  StoreSyncJobRepository: class {
    findActiveJob = mockFindActiveJob
  },
  toGraphqlStoreSyncJob: (doc: Record<string, unknown>) => doc,
}))

describe('storeSyncProgressByStore subscription resolver', () => {
  afterEach(() => {
    resetStoreSyncJobBufferForTests()
    mockFindActiveJob.mockReset()
  })

  it('GivenUserAuth_WhenActiveJobExists_ThenReturnsAsyncIterable', async () => {
    mockFindActiveJob.mockResolvedValue({
      jobId: 'job-a',
      tenantId: 'tenant-1',
      storeId: 'store-1',
    })

    const result = await storeSyncProgressByStoreSubscription(
      null,
      { storeId: 'store-1' },
      createTestContext({ tenantId: 'tenant-1' })
    )

    expect(result[Symbol.asyncIterator]).toBeTypeOf('function')
  })

  it('GivenWorkerAuth_WhenSubscribe_ThenForbidden', async () => {
    await expect(
      storeSyncProgressByStoreSubscription(
        null,
        { storeId: 'store-1' },
        createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
      )
    ).rejects.toThrow(GraphQLError)
  })

  it('GivenActiveJob_WhenProgressReported_ThenFiltersByStoreId', async () => {
    mockFindActiveJob.mockResolvedValue({
      jobId: 'job-a',
      tenantId: 'tenant-1',
      storeId: 'store-1',
    })

    const stream = await storeSyncProgressByStoreSubscription(
      null,
      { storeId: 'store-1' },
      createTestContext({ tenantId: 'tenant-1' })
    )
    const iterator = stream[Symbol.asyncIterator]()

    getStoreSyncJobBuffer().append('job-a', {
      jobId: 'job-a',
      tenantId: 'tenant-1',
      storeId: 'store-2',
      phase: 'BACKFILL',
      status: 'RUNNING',
      percentage: 10,
      resources: [],
      startedAt: new Date(),
      updatedAt: new Date(),
    } as never)

    getStoreSyncJobBuffer().append('job-a', {
      jobId: 'job-a',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      phase: 'BACKFILL',
      status: 'RUNNING',
      percentage: 55,
      resources: [],
      startedAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const first = await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout waiting for event')), 500)
      ),
    ])

    expect(first.value?.storeId).toBe('store-1')
    expect(first.value?.percentage).toBe(55)
  })
})
