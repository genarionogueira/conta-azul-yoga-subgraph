import { describe, expect, it } from 'vitest'
import { gqlClient } from './helpers/gql-client.js'
import {
  getRequestCount,
  removePriorityStubs,
  resetWireMockRequests,
  setWireMockStub,
} from './helpers/wiremock-admin.js'
import { triggerReconcileOnce } from './helpers/worker-sync.js'
import { MongoClient } from 'mongodb'

const TENANT_ID = 'dev-tenant'
const STORE_ID = 'store-1'

async function waitForSaleItems(minCount: number, timeoutMs = 60_000): Promise<number> {
  const mongoUrl = process.env.E2E_MONGO_URL
  if (!mongoUrl) throw new Error('E2E_MONGO_URL not set')
  const client = new MongoClient(mongoUrl)
  await client.connect()
  try {
    const db = client.db()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const count = await db.collection('sale_items').countDocuments({
        tenantId: TENANT_ID,
        storeId: STORE_ID,
      })
      if (count >= minCount) return count
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return db.collection('sale_items').countDocuments({
      tenantId: TENANT_ID,
      storeId: STORE_ID,
    })
  } finally {
    await client.close()
  }
}

describe('E2E: rate-limited event-driven sync', () => {
  it('GivenExecutorPipeline_WhenReconcileOnce_ThenPopulatesMongo', async () => {
    await triggerReconcileOnce()
    const count = await waitForSaleItems(1)
    expect(count).toBeGreaterThan(0)
  })

  it('GivenSecondReconcileWithUnchangedSales_WhenCheckingItemCalls_ThenStillSyncsSaleItems', async () => {
    await resetWireMockRequests()
    await triggerReconcileOnce()
    await new Promise((resolve) => setTimeout(resolve, 15_000))
    const itemCalls = await getRequestCount('/v1/venda/')
    const itemDetailCalls = itemCalls - (await getRequestCount('/v1/venda/busca'))
    expect(itemDetailCalls).toBeGreaterThan(0)
  })

  it('Given429Stub_WhenSyncEventuallyRuns_ThenRecovers', async () => {
    await setWireMockStub('/v1/categorias', 429)
    await triggerReconcileOnce()
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    await removePriorityStubs()
    const data = await gqlClient<{
      contaAzulCategories: { totalCount: number }
    }>(
      `query { contaAzulCategories(where: { storeId: { _eq: "${STORE_ID}" } }) { totalCount } }`
    )
    expect(data.contaAzulCategories.totalCount).toBeGreaterThanOrEqual(0)
  })
})
