import { describe, expect, it, vi, beforeEach } from 'vitest'
import { syncContaAzulCategories } from '../../src/schema/categories/resolvers/Mutation/syncContaAzulCategories.js'
import { createTestContext } from '../helpers/test-context.js'

const mockSyncStore = vi.fn()
const mockReconcileAll = vi.fn()

vi.mock('../../src/lib/category-sync/index.js', () => ({
  categorySyncService: {
    syncStore: (...args: unknown[]) => mockSyncStore(...args),
    reconcileAll: (...args: unknown[]) => mockReconcileAll(...args),
  },
}))

describe('syncContaAzulCategories mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GivenConnectedStore_WhenSync_ThenReconcilesStoreInYoga', async () => {
    mockSyncStore.mockResolvedValue({
      storeId: 'store-1',
      synced: 12,
      deleted: 0,
      errors: [],
    })

    const result = await syncContaAzulCategories(
      null,
      { storeId: 'store-1' },
      createTestContext({ tenantId: 'tenant-1', storeId: 'store-1' })
    )

    expect(mockSyncStore).toHaveBeenCalledWith('tenant-1', 'store-1', 'manual')
    expect(result.syncedCount).toBe(12)
    expect(result.status).toBe('success')
    expect(result.errorMessage).toBeNull()
    expect(result.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('GivenNoStoreIdArg_WhenSync_ThenUsesContextStoreId', async () => {
    mockSyncStore.mockResolvedValue({
      storeId: 'store-2',
      synced: 0,
      deleted: 0,
      errors: [],
    })

    await syncContaAzulCategories(null, {}, createTestContext({ tenantId: 'tenant-1', storeId: 'store-2' }))

    expect(mockSyncStore).toHaveBeenCalledWith('tenant-1', 'store-2', 'manual')
  })

  it('GivenNoStoreScope_WhenSync_ThenReconcilesAllStores', async () => {
    mockReconcileAll.mockResolvedValue({
      status: 'success',
      syncedCount: 24,
      storesProcessed: 2,
      successCount: 2,
      errorCount: 0,
      storeResults: [],
    })

    const result = await syncContaAzulCategories(
      null,
      {},
      createTestContext({ tenantId: 'tenant-1' })
    )

    expect(mockReconcileAll).toHaveBeenCalledWith('manual')
    expect(mockSyncStore).not.toHaveBeenCalled()
    expect(result.syncedCount).toBe(24)
    expect(result.status).toBe('success')
  })

  it('GivenSyncErrors_WhenSync_ThenReturnsErrorStatus', async () => {
    mockSyncStore.mockResolvedValue({
      storeId: 'store-1',
      synced: 0,
      deleted: 0,
      errors: ['Conta Azul API unavailable'],
    })

    const result = await syncContaAzulCategories(
      null,
      { storeId: 'store-1' },
      createTestContext({ tenantId: 'tenant-1' })
    )

    expect(result.status).toBe('error')
    expect(result.errorMessage).toBe('Conta Azul API unavailable')
  })
})
