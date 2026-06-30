import { describe, expect, it } from 'vitest'
import { MongoClient } from 'mongodb'
import { Redis } from 'ioredis'
import { DEFAULT_DEV_TENANT_ID } from '../../src/lib/auth/tenant-context.js'
import { gqlClient } from './helpers/gql-client.js'
import { workerAuthHeaders } from './helpers/vendas-rest-persist.js'
import {
  getWiremockRequests,
  registerParallelBackfillSalesStub,
  removePriorityStubs,
  resetWireMockRequests,
} from './helpers/wiremock-admin.js'
import { clearTenantRateLimits, disconnectStores } from './helpers/redis-e2e.js'
import { reseedDefaultE2eConnections } from './setup.js'

const TENANT_ID = DEFAULT_DEV_TENANT_ID
const STORE_ID = 'store-parallel-backfill'
const SALE_COUNT = 50
const MAX_ELAPSED_MS = 180_000
const MIN_CALLS_PER_SEC = 2
const MAX_CONCURRENT_BURST = 30

function getMongoUrl(): string {
  const url = process.env.E2E_MONGO_URL
  if (!url) throw new Error('E2E_MONGO_URL not set')
  return url
}

function getRedisUrl(): string {
  const url = process.env.E2E_REDIS_URL
  if (!url) throw new Error('E2E_REDIS_URL not set')
  return url
}

async function seedStore(): Promise<void> {
  const redis = new Redis(getRedisUrl())
  const tokenValue = `plain:${JSON.stringify({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Date.now() + 3_600_000,
    connected_at: Date.now(),
  })}`
  await redis.setex(`conta_azul:token:${TENANT_ID}:${STORE_ID}`, 3600, tokenValue)
  await redis.zadd(`conta_azul:connected_stores:${TENANT_ID}`, Date.now(), STORE_ID)
  await redis.quit()
}

function maxConcurrentInSlidingWindow(timestamps: number[], windowMs = 1000): number {
  if (timestamps.length === 0) return 0
  const sorted = [...timestamps].sort((a, b) => a - b)
  let max = 0
  let left = 0
  for (let right = 0; right < sorted.length; right += 1) {
    while (sorted[right] - sorted[left] > windowMs) {
      left += 1
    }
    max = Math.max(max, right - left + 1)
  }
  return max
}

async function cleanupParallelStore(): Promise<void> {
  const client = new MongoClient(getMongoUrl())
  await client.connect()
  try {
    const db = client.db()
    await db.collection('sales').deleteMany({
      tenantId: TENANT_ID,
      id: { $regex: '^sale-pb-' },
    })
    await db.collection('sale_items').deleteMany({
      tenantId: TENANT_ID,
      saleId: { $regex: '^sale-pb-' },
    })
    await db.collection('sales').deleteMany({ tenantId: TENANT_ID, storeId: STORE_ID })
    await db.collection('sale_items').deleteMany({ tenantId: TENANT_ID, storeId: STORE_ID })
    await db.collection('store_sync_jobs').deleteMany({ tenantId: TENANT_ID, storeId: STORE_ID })
  } finally {
    await client.close()
  }
  const redis = new Redis(getRedisUrl())
  await redis.del(`conta_azul:token:${TENANT_ID}:${STORE_ID}`)
  await redis.zrem(`conta_azul:connected_stores:${TENANT_ID}`, STORE_ID)
  await redis.quit()
  await clearTenantRateLimits(getRedisUrl(), TENANT_ID)
}

describe('E2E: Parallel backfill - saturates RPS without rate-limit storm', () => {
  it('should complete BACKFILL faster than baseline and stay under rate limit', async () => {
    await cleanupParallelStore()
    await disconnectStores(getRedisUrl(), TENANT_ID, ['store-1', 'store-2'])
    await resetWireMockRequests()
    await registerParallelBackfillSalesStub(SALE_COUNT)
    await seedStore()

    const startedAt = Date.now()
    const enqueue = await gqlClient<{ enqueueReconcileStore: { enqueued: boolean; jobId: string } }>(
      `mutation($tenantId: String!, $storeId: String!, $mode: SyncMode) {
        enqueueReconcileStore(tenantId: $tenantId, storeId: $storeId, trigger: "parallel-e2e", mode: $mode) {
          enqueued
          jobId
        }
      }`,
      { tenantId: TENANT_ID, storeId: STORE_ID, mode: 'BACKFILL' },
      workerAuthHeaders()
    )
    expect(enqueue.enqueueReconcileStore.enqueued).toBe(true)
    const jobId = enqueue.enqueueReconcileStore.jobId

    const client = new MongoClient(getMongoUrl())
    await client.connect()
    const db = client.db()

    try {
      const deadline = Date.now() + MAX_ELAPSED_MS
      let jobDoc: { status?: string; percentage?: number } | null = null
      while (Date.now() < deadline) {
        jobDoc = await db.collection('store_sync_jobs').findOne({ jobId })
        if (jobDoc?.status === 'COMPLETE' && jobDoc.percentage === 100) break
        // Executor auto-drains; no all-store reconcile-once nudge needed.
        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      const elapsedMs = Date.now() - startedAt
      expect(jobDoc?.status).toBe('COMPLETE')
      expect(jobDoc?.percentage).toBe(100)

      const saleItems = await db.collection('sale_items').countDocuments({
        tenantId: TENANT_ID,
        storeId: STORE_ID,
      })
      expect(saleItems).toBeGreaterThan(0)

      const requests = await getWiremockRequests()
      const itemTimestamps = requests
        .filter(
          (entry) =>
            (entry.request?.loggedDate ?? 0) >= startedAt &&
            entry.request?.url?.includes('/v1/venda/sale-pb-') &&
            entry.request.url.includes('/itens')
        )
        .map((entry) => entry.request?.loggedDate ?? 0)
        .filter((ts) => ts > 0)
      expect(itemTimestamps.length).toBeGreaterThanOrEqual(SALE_COUNT)

      const callsPerSec = itemTimestamps.length / Math.max(elapsedMs / 1000, 1)
      expect(callsPerSec).toBeGreaterThanOrEqual(MIN_CALLS_PER_SEC)
      expect(elapsedMs).toBeLessThan(MAX_ELAPSED_MS)

      const maxConcurrent = maxConcurrentInSlidingWindow(itemTimestamps, 1000)
      expect(maxConcurrent).toBeLessThanOrEqual(MAX_CONCURRENT_BURST)
    } finally {
      await client.close()
      await removePriorityStubs()
      await cleanupParallelStore()
      await clearTenantRateLimits(getRedisUrl(), TENANT_ID)
      await reseedDefaultE2eConnections(getRedisUrl())
    }
  }, 240_000)
})
