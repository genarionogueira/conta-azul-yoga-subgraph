import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { Redis } from 'ioredis'
import { gqlClient } from './gql-client.js'
import { workerAuthHeaders } from './vendas-rest-persist.js'
import { DEFAULT_DEV_TENANT_ID } from '../../../src/lib/auth/tenant-context.js'

const E2E_CNPJ = '12345678000190'

function getWorkerUrl(): string {
  return process.env.E2E_WORKER_URL ?? process.env.WORKER_URL ?? 'http://localhost:8010'
}

function getRedisUrl(): string {
  const url = process.env.E2E_REDIS_URL ?? process.env.REDIS_URL
  if (!url) throw new Error('E2E_REDIS_URL not set')
  return url
}

function getMongoUrl(): string {
  const url = process.env.E2E_MONGO_URL
  if (!url) throw new Error('E2E_MONGO_URL not set')
  return url
}

export async function disconnectStoreFully(storeId: string): Promise<void> {
  const { gqlRaw } = await import('./gql-client.js')
  const disconnectRes = await gqlRaw(
    `mutation {
      disconnectStore(storeId: "${storeId}") {
        success
        jobId
        error
      }
    }`
  )
  const disconnect = (
    disconnectRes.data as {
      disconnectStore: { success: boolean; jobId: string | null; error: string | null }
    }
  ).disconnectStore
  if (disconnect.success && disconnect.jobId) {
    await waitForStoreSyncJobComplete(disconnect.jobId)
  }
}

export async function triggerReconcileOnce(): Promise<void> {
  const response = await fetch(`${getWorkerUrl()}/internal/reconcile-once`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Worker reconcile-once failed: ${response.status} ${response.statusText}`)
  }
}

export async function seedStoreConnection(
  tenantId: string,
  storeId: string
): Promise<{ connectionId: string }> {
  const connectionId = randomUUID()
  const redis = new Redis(getRedisUrl())
  const tokenValue = `plain:${JSON.stringify({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Date.now() + 3_600_000,
    connected_at: Date.now(),
  })}`
  await redis.setex(`conta_azul:token:${tenantId}:${connectionId}`, 3600, tokenValue)
  await redis.set(`conta_azul:store_link:${tenantId}:${storeId}`, connectionId)
  await redis.zadd(`conta_azul:connected_stores:${tenantId}`, Date.now(), storeId)
  await redis.quit()

  const client = new MongoClient(getMongoUrl())
  await client.connect()
  try {
    const db = client.db()
    const now = new Date()
    await db.collection('conta_azul_connections').deleteMany({
      tenantId,
      $or: [
        { storeId },
        { connectionId },
        { id: storeId },
        { id: null },
        { contaAzulAccountId: E2E_CNPJ, status: 'ACTIVE' },
      ],
    })
    await db.collection('conta_azul_connections').replaceOne(
      { tenantId, connectionId },
      {
        tenantId,
        connectionId,
        storeId,
        id: storeId,
        contaAzulAccountId: E2E_CNPJ,
        name: storeId,
        status: 'ACTIVE',
        connectedAt: now,
        disconnectedAt: null,
        updatedAt: now,
      },
      { upsert: true }
    )
  } finally {
    await client.close()
  }

  return { connectionId }
}

export async function enqueueBackfillForStore(args: {
  tenantId: string
  storeId: string
  trigger: string
}): Promise<string> {
  const result = await gqlClient<{ enqueueReconcileStore: { enqueued: boolean; jobId: string } }>(
    `mutation($tenantId: String!, $storeId: String!, $trigger: String!) {
      enqueueReconcileStore(
        tenantId: $tenantId
        storeId: $storeId
        trigger: $trigger
        mode: BACKFILL
      ) {
        enqueued
        jobId
      }
    }`,
    {
      tenantId: args.tenantId,
      storeId: args.storeId,
      trigger: args.trigger,
    },
    workerAuthHeaders()
  )
  if (!result.enqueueReconcileStore.enqueued) {
    throw new Error(`Failed to enqueue backfill for store ${args.storeId}`)
  }
  return result.enqueueReconcileStore.jobId
}

export async function waitForStoreSyncJobComplete(
  jobId: string,
  timeoutMs = 90_000
): Promise<void> {
  const mongoUrl = getMongoUrl()
  const client = new MongoClient(mongoUrl)
  await client.connect()
  try {
    const db = client.db()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const jobDoc = await db.collection('store_sync_jobs').findOne({ jobId })
      if (jobDoc?.status === 'COMPLETE') {
        return
      }
      // The worker executor auto-drains the job stream; no reconcile-once nudge
      // needed. Nudging here would enqueue all-store reconciles and starve the
      // targeted job.
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`)
  } finally {
    await client.close()
  }
}

export async function triggerReconcileOnceForStore(args: {
  tenantId: string
  storeId: string
}): Promise<void> {
  const response = await fetch(`${getWorkerUrl()}/internal/reconcile-once`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: args.tenantId, storeId: args.storeId }),
  })
  if (!response.ok) {
    throw new Error(
      `Worker reconcile-once failed: ${response.status} ${response.statusText}`
    )
  }
}

export async function waitForStoreCategoryCount(
  storeId: string,
  minCount: number,
  timeoutMs = 30_000
): Promise<void> {
  const client = new MongoClient(getMongoUrl())
  await client.connect()
  try {
    const db = client.db()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const count = await db.collection('conta_azul_categories').countDocuments({ storeId })
      if (count >= minCount) return
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error(
      `Worker did not sync ${minCount} categories for store ${storeId} within ${timeoutMs}ms`
    )
  } finally {
    await client.close()
  }
}

export async function triggerWorkerSyncForStore(
  storeId: string,
  minCategories = 2,
  tenantId: string = DEFAULT_DEV_TENANT_ID
): Promise<void> {
  await triggerReconcileOnceForStore({ tenantId, storeId })
  await waitForStoreCategoryCount(storeId, minCategories)
}

/**
 * Synchronously sync a store's categories via the worker-auth `syncCategories`
 * mutation. Unlike the async worker reconcile loop, this blocks on the rate
 * limiter and returns once Mongo is updated, making category-dependent E2E
 * setup deterministic and immune to cross-test rate-limit accumulation.
 */
export async function syncStoreCategoriesViaMutation(
  storeId: string,
  tenantId: string = DEFAULT_DEV_TENANT_ID
): Promise<void> {
  const result = await gqlClient<{
    syncCategories: { storeId: string; synced: number; deleted: number; errors: string[] }
  }>(
    `mutation($tenantId: String!, $storeId: String!) {
      syncCategories(tenantId: $tenantId, storeId: $storeId, trigger: "e2e-setup") {
        storeId
        synced
        deleted
        errors
      }
    }`,
    { tenantId, storeId },
    workerAuthHeaders()
  )
  if (result.syncCategories.errors.length > 0) {
    throw new Error(
      `syncCategories failed for ${storeId}: ${result.syncCategories.errors.join(', ')}`
    )
  }
}

export async function countStoreCategories(storeId: string): Promise<number> {
  const client = new MongoClient(getMongoUrl())
  await client.connect()
  try {
    const db = client.db()
    return db.collection('conta_azul_categories').countDocuments({ storeId })
  } finally {
    await client.close()
  }
}

export async function countStoreSales(storeId: string): Promise<number> {
  const client = new MongoClient(getMongoUrl())
  await client.connect()
  try {
    const db = client.db()
    return db.collection('sales').countDocuments({ storeId })
  } finally {
    await client.close()
  }
}

export async function storeCacheMetaExists(storeId: string): Promise<boolean> {
  const client = new MongoClient(getMongoUrl())
  await client.connect()
  try {
    const db = client.db()
    const meta = await db.collection('datasource_cache_meta').findOne({
      _id: `conta_azul_categories:${storeId}`,
    })
    return meta !== null
  } finally {
    await client.close()
  }
}
