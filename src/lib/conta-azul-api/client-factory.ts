import type { Redis } from 'ioredis'
import { createRateLimiter } from './rate-limiter.js'
import { createContaAzulClient } from '../conta-azul-client.js'

export function createLimitedContaAzulClient(
  redis: Redis,
  accessToken: string,
  tenantId: string,
  storeId: string
) {
  const limiter = createRateLimiter(redis)
  return createContaAzulClient(accessToken, undefined, {
    tenantId,
    storeId,
    limiter,
  })
}
