import { describe, expect, it } from 'vitest'
import { MongoClient } from 'mongodb'
import { DEFAULT_DEV_TENANT_ID } from '../../src/lib/auth/tenant-context.js'
import { gqlRaw } from './helpers/gql-client.js'
import { waitForStoreSyncJobComplete, waitForStoreCategoryCount } from './helpers/worker-sync.js'

const TENANT_ID = DEFAULT_DEV_TENANT_ID
const STORE_A = 'store-soft-reconnect-a'
const STORE_B = 'store-soft-reconnect-b'
const E2E_CNPJ = '12345678000190'

async function connectStore(storeId: string, name?: string): Promise<void> {
  const authRes = await gqlRaw(`{ authorizationUrl(storeId: "${storeId}") { state } }`)
  expect(authRes.errors).toBeUndefined()
  const { state } = (authRes.data as { authorizationUrl: { state: string } }).authorizationUrl

  const nameArg = name ? `, name: "${name}"` : ''
  const setupRes = await gqlRaw(
    `mutation {
      setupConnection(storeId: "${storeId}", code: "e2e-auth-code", state: "${state}"${nameArg}) {
        success
        storeId
        jobId
        error
      }
    }`
  )
  expect(setupRes.errors).toBeUndefined()
  const result = (
    setupRes.data as {
      setupConnection: { success: boolean; jobId: string | null; error: string | null }
    }
  ).setupConnection
  expect(result.success).toBe(true)
  if (result.jobId) {
    try {
      await waitForStoreSyncJobComplete(result.jobId, 60_000)
    } catch {
      await waitForStoreCategoryCount(storeId, 2, 60_000)
    }
  } else {
    await waitForStoreCategoryCount(storeId, 2, 60_000)
  }
}

describe('E2E: Soft reconnect preserves connectionId and synced data', () => {
  it(
    'GivenDisconnectThenReconnectNewStoreId_WhenSameContaAzulAccount_ThenReusesConnectionIdAndData',
    async () => {
    const mongoUrl = process.env.E2E_MONGO_URL
    if (!mongoUrl) {
      throw new Error('E2E env not configured')
    }

    await connectStore(STORE_A, 'Soft Reconnect A')

    const client = new MongoClient(mongoUrl)
    await client.connect()
    const db = client.db()

    let connectionId: string
    try {
      const connA = await db.collection('conta_azul_connections').findOne({
        tenantId: TENANT_ID,
        $or: [{ storeId: STORE_A }, { id: STORE_A }],
      })
      expect(connA).toBeTruthy()
      connectionId = connA!.connectionId as string
      expect(connA!.contaAzulAccountId).toBe(E2E_CNPJ)
      expect(connA!.status).toBe('ACTIVE')

      const categoriesBefore = await db.collection('conta_azul_categories').countDocuments({
        tenantId: TENANT_ID,
        $or: [{ storeId: STORE_A }, { connectionId }],
      })
      expect(categoriesBefore).toBeGreaterThan(0)
    } finally {
      await client.close()
    }

    const disconnectRes = await gqlRaw(
      `mutation {
        disconnectStore(storeId: "${STORE_A}") {
          success
          jobId
        }
      }`
    )
    expect(disconnectRes.errors).toBeUndefined()
    const disconnectJobId = (
      disconnectRes.data as { disconnectStore: { success: boolean; jobId: string | null } }
    ).disconnectStore.jobId
    expect(disconnectJobId).toBeTruthy()
    await waitForStoreSyncJobComplete(disconnectJobId!, 90_000)

    await connectStore(STORE_B, 'Soft Reconnect B')

    const client2 = new MongoClient(mongoUrl)
    await client2.connect()
    const db2 = client2.db()
    try {
      const connB = await db2.collection('conta_azul_connections').findOne({
        tenantId: TENANT_ID,
        connectionId,
      })
      expect(connB).toBeTruthy()
      expect(connB!.storeId).toBe(STORE_B)
      expect(connB!.status).toBe('ACTIVE')
      expect(connB!.contaAzulAccountId).toBe(E2E_CNPJ)

      const categoriesAfter = await db2.collection('conta_azul_categories').countDocuments({
        tenantId: TENANT_ID,
        connectionId,
      })
      expect(categoriesAfter).toBeGreaterThan(0)

      const recentJobs = await db2
        .collection('store_sync_jobs')
        .find({ tenantId: TENANT_ID, storeId: STORE_B })
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray()
      const reconnectJob = recentJobs.find((j) => j.phase !== 'DISCONNECT')
      if (reconnectJob?.mode) {
        expect(reconnectJob.mode).toBe('INCREMENTAL')
      }
    } finally {
      await client2.close()
    }

    const connectedRes = await gqlRaw(`{ connectedStores { storeId isConnected } }`)
    expect(connectedRes.errors).toBeUndefined()
    const stores = (
      connectedRes.data as { connectedStores: Array<{ storeId: string; isConnected: boolean }> }
    ).connectedStores
    expect(stores.some((s) => s.storeId === STORE_B && s.isConnected)).toBe(true)
    expect(stores.some((s) => s.storeId === STORE_A && s.isConnected)).toBe(false)
  },
    180_000
  )
})
