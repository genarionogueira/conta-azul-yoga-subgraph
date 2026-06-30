import { describe, expect, it } from 'vitest'
import { MongoClient } from 'mongodb'
import { ConnectionRepository } from '../../src/lib/connections/connection-repository.js'

describe('E2E: Async store disconnect with worker progress (soft)', () => {
  it(
    'should return jobId, report DISCONNECT progress, and soft-disconnect while retaining data',
    async () => {
    const mongoUrl = process.env.E2E_MONGO_URL
    if (!mongoUrl) {
      throw new Error('E2E env not configured')
    }

    const { DEFAULT_DEV_TENANT_ID } = await import('../../src/lib/auth/tenant-context.js')
    const { seedStoreConnection, syncStoreCategoriesViaMutation } = await import(
      './helpers/worker-sync.js'
    )
    const { gqlRaw } = await import('./helpers/gql-client.js')

    const TENANT_ID = DEFAULT_DEV_TENANT_ID
    const STORE_ID = 'store-disconnect-async'

    await seedStoreConnection(TENANT_ID, STORE_ID)
    await syncStoreCategoriesViaMutation(STORE_ID, TENANT_ID)

    const disconnectRes = await gqlRaw(
      `mutation {
        disconnectStore(storeId: "${STORE_ID}") {
          success
          storeId
          jobId
          error
        }
      }`
    )
    expect(disconnectRes.errors).toBeUndefined()
    const disconnect = (
      disconnectRes.data as {
        disconnectStore: {
          success: boolean
          storeId: string
          jobId: string | null
          error: string | null
        }
      }
    ).disconnectStore
    expect(disconnect.success).toBe(true)
    expect(disconnect.storeId).toBe(STORE_ID)
    expect(disconnect.jobId).toBeTruthy()

    const pollJob = async (
      jobId: string,
      predicate: (job: { status?: string; percentage?: number; phase?: string }) => boolean,
      timeoutMs = 90_000
    ) => {
      const client = new MongoClient(mongoUrl)
      await client.connect()
      const db = client.db()
      const deadline = Date.now() + timeoutMs
      try {
        while (Date.now() < deadline) {
          const job = await db.collection('store_sync_jobs').findOne({ jobId })
          if (job && predicate(job as { status?: string; percentage?: number; phase?: string })) {
            return job as { status: string; percentage: number; phase: string }
          }
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        const last = await db.collection('store_sync_jobs').findOne({ jobId })
        throw new Error(`Job ${jobId} did not reach expected state: ${JSON.stringify(last)}`)
      } finally {
        await client.close()
      }
    }

    const job = await pollJob(
      disconnect.jobId!,
      (doc) => doc.status === 'COMPLETE'
    )
    expect(job.phase).toBe('DISCONNECT')

    const connectionsRes = await gqlRaw(
      `{ connections { connectionId storeId id status isConnected } }`
    )
    expect(connectionsRes.errors).toBeUndefined()
    const connections = (
      connectionsRes.data as {
        connections: Array<{
          connectionId: string
          storeId: string
          id: string
          status: string
          isConnected: boolean
        }>
      }
    ).connections
    const row = connections.find((c) => c.storeId === STORE_ID || c.id === STORE_ID)
    expect(row).toBeTruthy()
    expect(row?.status).toBe('DISCONNECTED')
    expect(row?.isConnected).toBe(false)

    const client = new MongoClient(mongoUrl)
    await client.connect()
    const db = client.db()
    try {
      const conn = await db.collection('conta_azul_connections').findOne({
        tenantId: TENANT_ID,
        $or: [{ storeId: STORE_ID }, { id: STORE_ID }],
      })
      expect(conn?.status).toBe('DISCONNECTED')

      const connectionId = conn?.connectionId as string | undefined
      const dataFilter = connectionId
        ? { tenantId: TENANT_ID, $or: [{ storeId: STORE_ID }, { connectionId }] }
        : { tenantId: TENANT_ID, storeId: STORE_ID }

      const [categories, sales, saleItems, vendedores] = await Promise.all([
        db.collection('conta_azul_categories').countDocuments(dataFilter),
        db.collection('sales').countDocuments(dataFilter),
        db.collection('sale_items').countDocuments(dataFilter),
        db.collection('vendedores').countDocuments(dataFilter),
      ])
      expect(categories).toBeGreaterThan(0)
    } finally {
      await client.close()
    }
  },
    120_000
  )

  it('should fail disconnect when store is not connected', async () => {
    const { gqlRaw } = await import('./helpers/gql-client.js')
    const res = await gqlRaw(
      `mutation {
        disconnectStore(storeId: "unknown-store-id") {
          success
          error
        }
      }`
    )
    expect(res.errors).toBeUndefined()
    const result = (res.data as { disconnectStore: { success: boolean; error: string | null } })
      .disconnectStore
    expect(result.success).toBe(false)
    expect(result.error).toContain('not connected')
  })
})
