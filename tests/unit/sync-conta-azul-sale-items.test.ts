import { describe, expect, it, vi, beforeEach } from 'vitest'
import { syncContaAzulSaleItems } from '../../src/schema/sale-items/resolvers/Mutation/syncContaAzulSaleItems.js'
import { createTestContext } from '../helpers/test-context.js'

const mockSyncStore = vi.fn()
const mockReconcileAll = vi.fn()

vi.mock('../../src/lib/sale-item-sync/index.js', () => ({
  saleItemSyncService: {
    syncStore: (...args: unknown[]) => mockSyncStore(...args),
    reconcileAll: (...args: unknown[]) => mockReconcileAll(...args),
  },
}))

describe('syncContaAzulSaleItems mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GivenConnectedStore_WhenSync_ThenReconcilesStoreInYoga', async () => {
    mockSyncStore.mockResolvedValue({
      storeId: 'store-1',
      synced: 3,
      deleted: 0,
      errors: [],
    })

    const result = await syncContaAzulSaleItems(
      null,
      { storeId: 'store-1' },
      createTestContext({ tenantId: 'tenant-1', storeId: 'store-1' })
    )

    expect(mockSyncStore).toHaveBeenCalledWith('tenant-1', 'store-1', 'manual')
    expect(result.syncedCount).toBe(3)
    expect(result.status).toBe('success')
    expect(result.errorMessage).toBeNull()
  })

  it('GivenNoStoreScope_WhenSync_ThenReconcilesAllStores', async () => {
    mockReconcileAll.mockResolvedValue({
      status: 'success',
      syncedCount: 5,
      storesProcessed: 2,
      successCount: 2,
      errorCount: 0,
      storeResults: [],
    })

    const result = await syncContaAzulSaleItems(null, {}, createTestContext({ tenantId: 'tenant-1' }))

    expect(mockReconcileAll).toHaveBeenCalledWith('manual')
    expect(mockSyncStore).not.toHaveBeenCalled()
    expect(result.syncedCount).toBe(5)
  })

  it('GivenSyncErrors_WhenSync_ThenReturnsErrorStatus', async () => {
    mockSyncStore.mockResolvedValue({
      storeId: 'store-1',
      synced: 0,
      deleted: 0,
      errors: ['Conta Azul API unavailable'],
    })

    const result = await syncContaAzulSaleItems(
      null,
      { storeId: 'store-1' },
      createTestContext({ tenantId: 'tenant-1' })
    )

    expect(result.status).toBe('error')
    expect(result.errorMessage).toBe('Conta Azul API unavailable')
  })
})
