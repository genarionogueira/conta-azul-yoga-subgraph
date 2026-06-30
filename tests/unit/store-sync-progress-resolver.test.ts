import { afterEach, describe, expect, it } from 'vitest'
import { GraphQLError } from 'graphql'
import { WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import {
  getStoreSyncJobBuffer,
  resetStoreSyncJobBufferForTests,
} from '../../src/lib/sync/store-sync-job-buffer.js'
import { storeSyncProgressSubscription } from '../../src/schema/sync/resolvers/Subscription/storeSyncProgress.js'
import { createTestContext } from '../helpers/test-context.js'

describe('storeSyncProgress subscription resolver', () => {
  afterEach(() => {
    resetStoreSyncJobBufferForTests()
  })

  it('returns async iterable for user auth', () => {
    const context = createTestContext({ tenantId: 'tenant-1' })
    const result = storeSyncProgressSubscription(null, { jobId: 'job-1' }, context)
    expect(result[Symbol.asyncIterator]).toBeTypeOf('function')
  })

  it('forbids worker auth', () => {
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    expect(() =>
      storeSyncProgressSubscription(null, { jobId: 'job-1' }, context)
    ).toThrow(GraphQLError)
  })

  it('filters events by jobId', async () => {
    const context = createTestContext({ tenantId: 'tenant-1' })
    const stream = storeSyncProgressSubscription(null, { jobId: 'job-a' }, context)
    const iterator = stream[Symbol.asyncIterator]()

    getStoreSyncJobBuffer().append('job-b', {
      jobId: 'job-b',
      tenantId: 'tenant-1',
      storeId: 'store-1',
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
      percentage: 20,
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
    expect(first.value?.jobId).toBe('job-a')
  })
})
