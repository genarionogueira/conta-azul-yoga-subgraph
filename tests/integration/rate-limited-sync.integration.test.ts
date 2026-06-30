import { describe, expect, it } from 'vitest'
import { enqueueJob, parseJobPayload } from '../../src/lib/jobs/job-stream.js'
import { createRateLimiter } from '../../src/lib/conta-azul-api/rate-limiter.js'

describe('integration: limiter + job stream', () => {
  it('GivenLimiterAndStream_WhenEnqueueJob_ThenPayloadIsValid', async () => {
    const stored: Record<string, string> = {}
    const redis = {
      eval: async () => 0,
      xadd: async (_key: string, _id: string, field: string, value: string) => {
        stored[field] = value
        return '1-0'
      },
    }
    const limiter = createRateLimiter(redis as never)
    await limiter.acquire('tenant-1', 'store-1')
    const jobId = await enqueueJob(redis as never, {
      type: 'sync.sales',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      trigger: 'worker',
      attempt: 0,
      enqueuedAt: new Date().toISOString(),
    })
    expect(jobId).toBe('1-0')
    expect(parseJobPayload(stored.payload).storeId).toBe('store-1')
  })
})
