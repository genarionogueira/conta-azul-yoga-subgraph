import { Redis } from 'ioredis'

export async function clearTenantRateLimits(
  redisUrl: string,
  tenantId: string
): Promise<void> {
  const redis = new Redis(redisUrl)
  try {
    let cursor = '0'
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        `conta_azul:ratelimit:${tenantId}:*`,
        'COUNT',
        100
      )
      cursor = next
      if (keys.length > 0) {
        await redis.del(...keys)
      }
    } while (cursor !== '0')
  } finally {
    await redis.quit()
  }
}

export async function disconnectStores(
  redisUrl: string,
  tenantId: string,
  storeIds: string[]
): Promise<void> {
  if (storeIds.length === 0) return
  const redis = new Redis(redisUrl)
  try {
    const indexKey = `conta_azul:connected_stores:${tenantId}`
    await redis.zrem(indexKey, ...storeIds)
    for (const storeId of storeIds) {
      await redis.del(`conta_azul:token:${tenantId}:${storeId}`)
    }
  } finally {
    await redis.quit()
  }
}
