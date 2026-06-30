import { describe, expect, it } from 'vitest'
import { MongoClient } from 'mongodb'
import { Redis } from 'ioredis'
import { gqlClient } from './helpers/gql-client.js'
import { workerAuthHeaders } from './helpers/vendas-rest-persist.js'
import { DEFAULT_DEV_TENANT_ID } from '../../src/lib/auth/tenant-context.js'

const TENANT_ID = DEFAULT_DEV_TENANT_ID
const STORE_ID = 'store-two-phase'

describe('E2E: Two-phase sync - connect store backfills with progress then increments', () => {
  it('should backfill to 100% then incrementally respect watermark when a store connects', async () => {
    const redisUrl = process.env.E2E_REDIS_URL
    const mongoUrl = process.env.E2E_MONGO_URL
    const workerUrl = process.env.E2E_WORKER_URL
    if (!redisUrl || !mongoUrl || !workerUrl) {
      throw new Error('E2E env not configured')
    }

    const redis = new Redis(redisUrl)
    const tokenValue = `plain:${JSON.stringify({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: Date.now() + 3_600_000,
      connected_at: Date.now(),
    })}`
    await redis.setex(`conta_azul:token:${TENANT_ID}:${STORE_ID}`, 3600, tokenValue)
    await redis.zadd(`conta_azul:connected_stores:${TENANT_ID}`, Date.now(), STORE_ID)
    await redis.quit()

    const enqueue = await gqlClient<{ enqueueReconcileStore: { enqueued: boolean; jobId: string } }>(
      `mutation($tenantId: String!, $storeId: String!, $mode: SyncMode) {
        enqueueReconcileStore(tenantId: $tenantId, storeId: $storeId, trigger: "e2e", mode: $mode) {
          enqueued
          jobId
        }
      }`,
      { tenantId: TENANT_ID, storeId: STORE_ID, mode: 'BACKFILL' },
      workerAuthHeaders()
    )
    expect(enqueue.enqueueReconcileStore.enqueued).toBe(true)
    expect(enqueue.enqueueReconcileStore.jobId).toBeTruthy()
    const jobId = enqueue.enqueueReconcileStore.jobId

    const client = new MongoClient(mongoUrl)
    await client.connect()
    const db = client.db()
    // The worker executor auto-drains the job stream once enqueued; no
    // reconcile-once nudge needed (and nudging would flood the queue with
    // all-store reconciles, starving this backfill).
    const deadline = Date.now() + 90_000
    let jobDoc: { status?: string; percentage?: number } | null = null
    while (Date.now() < deadline) {
      jobDoc = await db.collection('store_sync_jobs').findOne({ jobId })
      if (jobDoc?.status === 'COMPLETE' && jobDoc.percentage === 100) break
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    expect(jobDoc?.status).toBe('COMPLETE')
    expect(jobDoc?.percentage).toBe(100)

    const [categories, sales, saleItems, vendedores] = await Promise.all([
      db.collection('conta_azul_categories').countDocuments({ tenantId: TENANT_ID, storeId: STORE_ID }),
      db.collection('sales').countDocuments({ tenantId: TENANT_ID, storeId: STORE_ID }),
      db.collection('sale_items').countDocuments({ tenantId: TENANT_ID, storeId: STORE_ID }),
      db.collection('vendedores').countDocuments({ tenantId: TENANT_ID, storeId: STORE_ID }),
    ])
    expect(categories).toBeGreaterThan(0)
    expect(sales).toBeGreaterThan(0)
    expect(saleItems).toBeGreaterThan(0)
    expect(vendedores).toBeGreaterThan(0)

    const watermark = await gqlClient<{ contaAzulSalesWatermark: string | null }>(
      `query($tenantId: String!, $storeId: String!) {
        contaAzulSalesWatermark(tenantId: $tenantId, storeId: $storeId)
      }`,
      { tenantId: TENANT_ID, storeId: STORE_ID },
      workerAuthHeaders()
    )
    expect(watermark.contaAzulSalesWatermark).toBeTruthy()

    const incremental = await gqlClient<{
      enqueueReconcileStore: { enqueued: boolean; jobId: string }
    }>(
      `mutation($tenantId: String!, $storeId: String!) {
        enqueueReconcileStore(tenantId: $tenantId, storeId: $storeId, trigger: "e2e-incremental", mode: INCREMENTAL) {
          enqueued
          jobId
        }
      }`,
      { tenantId: TENANT_ID, storeId: STORE_ID },
      workerAuthHeaders()
    )
    const incrementalJobId = incremental.enqueueReconcileStore.jobId
    const incDeadline = Date.now() + 60_000
    while (Date.now() < incDeadline) {
      const incDoc = await db.collection('store_sync_jobs').findOne({ jobId: incrementalJobId })
      if (incDoc?.status === 'COMPLETE' && incDoc.percentage === 100) break
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const wiremockAdmin = process.env.E2E_WIREMOCK_ADMIN_URL
    if (wiremockAdmin) {
      const journal = await fetch(`${wiremockAdmin}/__admin/requests`)
      const body = (await journal.json()) as {
        requests?: Array<{ request?: { url?: string; queryParameters?: Record<string, { values?: string[] }> } }>
      }
      const vendasCalls = (body.requests ?? []).filter((entry) =>
        entry.request?.url?.includes('/v1/venda/busca')
      )
      const withWatermark = vendasCalls.some((entry) => {
        const params = entry.request?.queryParameters ?? {}
        const fromParams =
          params.data_inicio?.values?.[0] ?? params.dataInicio?.values?.[0]
        if (fromParams) return true
        const url = entry.request?.url ?? ''
        return /[?&]data_inicio=/.test(url)
      })
      expect(withWatermark).toBe(true)
    }

    await client.close()
  }, 180_000)
})
