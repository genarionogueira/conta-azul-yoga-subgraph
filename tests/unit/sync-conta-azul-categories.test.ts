import { describe, expect, it, vi, beforeEach } from 'vitest'
import { syncContaAzulCategories } from '../../src/schema/categories/resolvers/Mutation/syncContaAzulCategories.js'
import { createTestContext } from '../helpers/test-context.js'

const triggerReconcile = vi.fn()

vi.mock('../../src/lib/worker-client/trigger-reconcile.js', () => ({
  triggerReconcile: (...args: unknown[]) => triggerReconcile(...args),
}))

describe('syncContaAzulCategories mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GivenConnectedStore_WhenSync_ThenCallsWorkerWithTenantAndStore', async () => {
    triggerReconcile.mockResolvedValue({
      syncedCount: 12,
      syncedAt: '2026-01-01T00:00:00.000Z',
      status: 'success',
      errorMessage: null,
    })

    const result = await syncContaAzulCategories(
      null,
      { storeId: 'store-1' },
      createTestContext({ tenantId: 'tenant-1', storeId: 'store-1' })
    )

    expect(triggerReconcile).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      storeId: 'store-1',
    })
    expect(result).toEqual({
      syncedCount: 12,
      syncedAt: '2026-01-01T00:00:00.000Z',
      status: 'success',
      errorMessage: null,
    })
  })

  it('GivenNoStoreIdArg_WhenSync_ThenUsesContextStoreId', async () => {
    triggerReconcile.mockResolvedValue({
      syncedCount: 0,
      syncedAt: '2026-01-01T00:00:00.000Z',
      status: 'success',
      errorMessage: null,
    })

    await syncContaAzulCategories(null, {}, createTestContext({ tenantId: 'tenant-1', storeId: 'store-2' }))

    expect(triggerReconcile).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      storeId: 'store-2',
    })
  })
})
