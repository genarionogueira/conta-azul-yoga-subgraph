import { describe, expect, it, vi } from 'vitest'
import { createRateLimiter } from '../../../src/lib/conta-azul-api/rate-limiter.js'
import { ContaAzulRateLimitError } from '../../../src/lib/conta-azul-api/errors.js'

describe('rate-limiter', () => {
  it('GivenFreshBucket_WhenAcquire_ThenAllowsRequests', async () => {
    const redis = { eval: vi.fn().mockResolvedValue(0) }
    const limiter = createRateLimiter(redis as never)
    await limiter.acquire('tenant-1', 'store-1')
    expect(redis.eval).toHaveBeenCalled()
  })

  it('GivenExhaustedBucket_WhenAcquireTimesOut_ThenThrows', async () => {
    process.env.CONTA_AZUL_ACQUIRE_MAX_WAIT_MS = '1'
    const redis = { eval: vi.fn().mockResolvedValue(50) }
    const limiter = createRateLimiter(redis as never)
    await expect(limiter.acquire('tenant-1', 'store-1')).rejects.toBeInstanceOf(
      ContaAzulRateLimitError
    )
    delete process.env.CONTA_AZUL_ACQUIRE_MAX_WAIT_MS
  })
})
