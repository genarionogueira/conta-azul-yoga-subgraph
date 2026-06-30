import type { Redis } from 'ioredis'
import { vendedoresCollectionName } from '../persist/index.js'
import { getDb } from '../mongo/connection.js'

const SALES_WATERMARK_PREFIX = 'conta_azul:watermark:sales:'
const PROGRESS_STATE_PREFIX = 'conta_azul:sync:state:'
const BACKFILL_DONE_PREFIX = 'conta_azul:backfill:done:'

export async function deleteStoreVendedores(
  tenantId: string,
  storeId: string
): Promise<number> {
  const result = await getDb()
    .collection(vendedoresCollectionName())
    .deleteMany({ tenantId, storeId })
  return result.deletedCount
}

export async function cleanupStoreDisconnectMetadata(
  redis: Redis,
  tenantId: string,
  storeId: string,
  jobId: string
): Promise<void> {
  await redis.del(`${SALES_WATERMARK_PREFIX}${tenantId}:${storeId}`)
  await redis.del(`${PROGRESS_STATE_PREFIX}${jobId}`)

  const pattern = `${BACKFILL_DONE_PREFIX}${tenantId}:${storeId}:*`
  let cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    cursor = nextCursor
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } while (cursor !== '0')
}
