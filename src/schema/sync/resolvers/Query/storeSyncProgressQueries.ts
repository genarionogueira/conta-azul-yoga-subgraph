import type { AppContext } from '../../../../context.js'
import { requireTenant } from '../../../../lib/auth/tenant-context.js'
import { requireWorkerAuth } from '../../../../lib/auth/worker-auth.js'
import { createRedisClient } from '../../../../lib/redis/create-redis-client.js'
import { getDb } from '../../../../lib/mongo/connection.js'
import {
  getSalesWatermark,
  shrinkWindowStart,
} from '../../../../lib/sync/watermark.js'
import { salesDateWindow } from '../../../../lib/conta-azul-client.js'
import {
  StoreSyncJobRepository,
  toGraphqlStoreSyncJob,
} from '../../../../lib/sync/store-sync-job-repository.js'

const sharedRedis = createRedisClient(process.env.REDIS_URL, 'command')

export async function storeSyncJob(
  _parent: unknown,
  args: { jobId: string },
  context: AppContext
) {
  requireWorkerAuth(context)
  const repo = new StoreSyncJobRepository(getDb)
  const doc = await repo.findByJobId(args.jobId)
  return doc ? toGraphqlStoreSyncJob(doc) : null
}

export async function activeStoreSyncJob(
  _parent: unknown,
  args: { storeId: string },
  context: AppContext
) {
  const tenantId = requireTenant(context)
  const repo = new StoreSyncJobRepository(getDb)
  const active = await repo.findActiveJob(tenantId, args.storeId)
  if (active) {
    return toGraphqlStoreSyncJob(active)
  }

  const latest = await repo.findLatestFailedJob(tenantId, args.storeId)
  if (latest) {
    return toGraphqlStoreSyncJob(latest)
  }

  return null
}

export async function contaAzulSalesWatermark(
  _parent: unknown,
  args: { tenantId: string; storeId: string },
  context: AppContext
) {
  requireWorkerAuth(context)
  const watermark = await getSalesWatermark(sharedRedis, args.tenantId, args.storeId)
  if (!watermark) return null
  const window = salesDateWindow()
  return shrinkWindowStart(watermark, window.data_inicio)
}

export async function contaAzulActiveBackfill(
  _parent: unknown,
  args: { tenantId: string; storeId: string },
  context: AppContext
) {
  requireWorkerAuth(context)
  const repo = new StoreSyncJobRepository(getDb)
  const active = await repo.findActiveBackfill(args.tenantId, args.storeId)
  return active !== null
}
