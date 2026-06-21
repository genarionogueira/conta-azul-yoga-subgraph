import { DockerComposeEnvironment, Wait } from 'testcontainers'
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

async function seedCategoriesViaSync(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation { syncContaAzulCategories { syncedCount status errorMessage } }`,
      }),
    })
    const body = (await res.json()) as {
      data?: {
        syncContaAzulCategories: {
          syncedCount: number
          status: string
          errorMessage?: string | null
        }
      }
      errors?: Array<{ message: string }>
    }
    if (body.errors?.length) {
      throw new Error(`E2E setup sync GraphQL errors: ${body.errors.map((e) => e.message).join(', ')}`)
    }
    const result = body.data?.syncContaAzulCategories
    if (result && result.status === 'success' && result.syncedCount > 0) {
      return
    }
    if (attempt === 29) {
      throw new Error(
        `E2E setup sync failed after retries: ${JSON.stringify(body.data?.syncContaAzulCategories ?? body.errors)}`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
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
  compose = await new DockerComposeEnvironment(ROOT, [
    'docker-compose.yml',
    'docker-compose.e2e.yml',
  ])
    .withWaitStrategy('redis', Wait.forHealthCheck())
    .withWaitStrategy('mongo', Wait.forHealthCheck())
    .withWaitStrategy('mock-conta-azul', Wait.forHealthCheck())
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
  process.env.E2E_MONGO_URL = `mongodb://localhost:${mongoPort}/conta_azul`

  const wiremockContainer = compose.getContainer('mock-conta-azul-1')
  const wiremockPort = wiremockContainer.getMappedPort(8080)
  process.env.E2E_WIREMOCK_ADMIN_URL = `http://localhost:${wiremockPort}`

  const redis = new Redis(redisUrl)
  await seedTenantConnection(redis, DEFAULT_DEV_TENANT_ID, 'store-1')
  await seedTenantConnection(redis, DEFAULT_DEV_TENANT_ID, 'store-2')
  await redis.quit()

  await seedCategoriesViaSync(baseUrl)
}

export async function teardown(): Promise<void> {
  await compose?.down({ removeVolumes: true })
}
