import { MongoClient } from 'mongodb'

function getWorkerUrl(): string {
  return process.env.E2E_WORKER_URL ?? process.env.WORKER_URL ?? 'http://localhost:8010'
}

function getMongoUrl(): string {
  const url = process.env.E2E_MONGO_URL
  if (!url) throw new Error('E2E_MONGO_URL not set')
  return url
}

export async function triggerReconcileOnce(): Promise<void> {
  const response = await fetch(`${getWorkerUrl()}/internal/reconcile-once`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Worker reconcile-once failed: ${response.status} ${response.statusText}`)
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
    const db = client.db('conta_azul')
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
  minCategories = 2
): Promise<void> {
  await triggerReconcileOnce()
  await waitForStoreCategoryCount(storeId, minCategories)
}

export async function countStoreCategories(storeId: string): Promise<number> {
  const client = new MongoClient(getMongoUrl())
  await client.connect()
  try {
    const db = client.db('conta_azul')
    return db.collection('conta_azul_categories').countDocuments({ storeId })
  } finally {
    await client.close()
  }
}

export async function storeCacheMetaExists(storeId: string): Promise<boolean> {
  const client = new MongoClient(getMongoUrl())
  await client.connect()
  try {
    const db = client.db('conta_azul')
    const meta = await db.collection('datasource_cache_meta').findOne({
      _id: `conta_azul_categories:${storeId}`,
    })
    return meta !== null
  } finally {
    await client.close()
  }
}
