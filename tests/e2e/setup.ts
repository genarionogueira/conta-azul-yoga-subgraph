import { DockerComposeEnvironment, Wait } from 'testcontainers'
import { MongoClient } from 'mongodb'
import { Redis } from 'ioredis'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_DEV_TENANT_ID } from '../../src/lib/auth/tenant-context.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

let compose: Awaited<ReturnType<InstanceType<typeof DockerComposeEnvironment>['up']>>

const TEST_TOKEN = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_at: Date.now() + 3_600_000,
  connected_at: Date.now(),
}

async function seedWorkerSyncedData(
  workerUrl: string,
  mongoUrl: string,
  tenantId: string,
  storeIds: string[]
): Promise<void> {
  const response = await fetch(`${workerUrl}/internal/reconcile-once`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(
      `E2E setup: worker reconcile-once failed: ${response.status} ${response.statusText}`
    )
  }

  const client = new MongoClient(mongoUrl)
  try {
    const db = client.db()
    const deadline = Date.now() + 60_000
    const expectedPerStore = 2
    const expectedSaleItemsPerStore = 3
    while (Date.now() < deadline) {
      const categoryCount = await db.collection('conta_azul_categories').countDocuments({
        tenantId,
        storeId: { $in: storeIds },
      })
      const salesCount = await db.collection('sales').countDocuments({
        tenantId,
        storeId: { $in: storeIds },
      })
      const saleItemsCount = await db.collection('sale_items').countDocuments({
        tenantId,
        storeId: { $in: storeIds },
      })
      const perStoreReady = await Promise.all(
        storeIds.map(async (storeId) => {
          const [categories, sales, items] = await Promise.all([
            db.collection('conta_azul_categories').countDocuments({ tenantId, storeId }),
            db.collection('sales').countDocuments({ tenantId, storeId }),
            db.collection('sale_items').countDocuments({ tenantId, storeId }),
          ])
          return (
            categories >= expectedPerStore &&
            sales >= expectedPerStore &&
            items >= expectedSaleItemsPerStore
          )
        })
      )
      if (
        categoryCount >= storeIds.length * expectedPerStore &&
        salesCount >= storeIds.length * expectedPerStore &&
        saleItemsCount >= storeIds.length * expectedSaleItemsPerStore &&
        perStoreReady.every(Boolean)
      ) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    const categoryCount = await db.collection('conta_azul_categories').countDocuments({
      tenantId,
      storeId: { $in: storeIds },
    })
    const salesCount = await db.collection('sales').countDocuments({
      tenantId,
      storeId: { $in: storeIds },
    })
    const saleItemsCount = await db.collection('sale_items').countDocuments({
      tenantId,
      storeId: { $in: storeIds },
    })
    throw new Error(
      `E2E setup: worker did not sync expected data within 60s (categories=${categoryCount}, sales=${salesCount}, saleItems=${saleItemsCount}, expected=${storeIds.length * expectedPerStore} categories/sales and ${storeIds.length * expectedSaleItemsPerStore} sale items)`
    )
  } finally {
    await client.close()
  }
}

async function seedTenantConnection(
  redis: Redis,
  tenantId: string,
  storeId: string
): Promise<void> {
  const tokenValue = `plain:${JSON.stringify(TEST_TOKEN)}`
  const tokenKey = `conta_azul:token:${tenantId}:${storeId}`
  const indexKey = `conta_azul:connected_stores:${tenantId}`
  const ttlSeconds = Math.max(
    Math.ceil((TEST_TOKEN.expires_at - Date.now() + 86_400_000) / 1000),
    60
  )
  await redis.setex(tokenKey, ttlSeconds, tokenValue)
  await redis.zadd(indexKey, TEST_TOKEN.connected_at, storeId)
}

export async function reseedDefaultE2eConnections(redisUrl: string): Promise<void> {
  const redis = new Redis(redisUrl)
  await seedTenantConnection(redis, DEFAULT_DEV_TENANT_ID, 'store-1')
  await seedTenantConnection(redis, DEFAULT_DEV_TENANT_ID, 'store-2')
  await redis.quit()
}

export async function setup(): Promise<void> {
  if (!process.env.ZITADEL_HOST_IP?.trim()) {
    process.env.ZITADEL_HOST_IP = '127.0.0.1'
  }

  compose = await new DockerComposeEnvironment(ROOT, [
    'compose.yaml',
    'compose.dev.yaml',
    'compose.override.e2e.yaml',
  ])
    .withWaitStrategy('redis', Wait.forHealthCheck())
    .withWaitStrategy('mongo', Wait.forHealthCheck())
    .withWaitStrategy('mock-conta-azul', Wait.forHealthCheck())
    .withWaitStrategy('worker', Wait.forHealthCheck())
    .withWaitStrategy('yoga-subgraph', Wait.forHealthCheck())
    .up()

  const yogaContainer = compose.getContainer('yoga-subgraph-1')
  const port = yogaContainer.getMappedPort(4000)
  const baseUrl = `http://localhost:${port}`
  process.env.E2E_BASE_URL = baseUrl

  const redisContainer = compose.getContainer('redis-1')
  const redisPort = redisContainer.getMappedPort(6379)
  const redisUrl = `redis://localhost:${redisPort}`
  process.env.E2E_REDIS_URL = redisUrl

  const mongoContainer = compose.getContainer('mongo-1')
  const mongoPort = mongoContainer.getMappedPort(27017)
  const mongoUrl = `mongodb://localhost:${mongoPort}/conta_azul`
  process.env.E2E_MONGO_URL = mongoUrl

  const wiremockContainer = compose.getContainer('mock-conta-azul-1')
  const wiremockPort = wiremockContainer.getMappedPort(8080)
  process.env.E2E_WIREMOCK_ADMIN_URL = `http://localhost:${wiremockPort}`

  const workerContainer = compose.getContainer('worker-1')
  const workerPort = workerContainer.getMappedPort(8010)
  const workerUrl = `http://localhost:${workerPort}`
  process.env.E2E_WORKER_URL = workerUrl

  const redis = new Redis(redisUrl)
  await seedTenantConnection(redis, DEFAULT_DEV_TENANT_ID, 'store-1')
  await seedTenantConnection(redis, DEFAULT_DEV_TENANT_ID, 'store-2')
  await redis.quit()

  await seedWorkerSyncedData(workerUrl, mongoUrl, DEFAULT_DEV_TENANT_ID, [
    'store-1',
    'store-2',
  ])
}

export async function teardown(): Promise<void> {
  await compose?.down({ removeVolumes: true })
}
