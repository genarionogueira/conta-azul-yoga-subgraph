import { describe, expect, it, vi } from 'vitest'
import { enqueueJob, parseJobPayload } from '../../../src/lib/jobs/job-stream.js'

describe('job-stream', () => {
  it('GivenPayload_WhenEnqueue_ThenRoundTrips', async () => {
    const stored: Record<string, string> = {}
    const redis = {
      xadd: vi.fn(async (_key: string, _id: string, field: string, value: string) => {
        stored[field] = value
        return '1-0'
      }),
    }
    const jobId = await enqueueJob(redis as never, {
      type: 'reconcile.store',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      trigger: 'manual',
      attempt: 0,
      enqueuedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(jobId).toBe('1-0')
    expect(parseJobPayload(stored.payload).type).toBe('reconcile.store')
  })
})
