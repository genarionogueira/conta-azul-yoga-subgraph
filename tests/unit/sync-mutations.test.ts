import { describe, expect, it, vi, beforeEach } from 'vitest'
import { GraphQLError } from 'graphql'
import {
  reconcileAll,
  reconcileStore,
  disconnectStoreData,
} from '../../src/schema/sync/resolvers/Mutation/syncMutations.js'
import { WORKER_CONTEXT_TENANT_ID } from '../../src/lib/auth/tenant-context.js'
import { WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import { createTestContext } from '../helpers/test-context.js'

const mockCategoryReconcileAll = vi.fn()
const mockCategorySyncStore = vi.fn()
const mockCategoryDisconnect = vi.fn()
const mockSalesReconcileAll = vi.fn()
const mockSalesSyncStore = vi.fn()
const mockSalesDelete = vi.fn()
const mockSaleItemsReconcileAll = vi.fn()
const mockSaleItemsSyncStore = vi.fn()
const mockSaleItemsDelete = vi.fn()
const mockDeleteStoreVendedores = vi.fn()

vi.mock('../../src/lib/sync/disconnect-store-data.js', () => ({
  deleteStoreVendedores: (...args: unknown[]) => mockDeleteStoreVendedores(...args),
}))

vi.mock('../../src/lib/category-sync/index.js', () => ({
  categorySyncService: {
    reconcileAll: (...args: unknown[]) => mockCategoryReconcileAll(...args),
    syncStore: (...args: unknown[]) => mockCategorySyncStore(...args),
    deleteStoreCategories: (...args: unknown[]) => mockCategoryDisconnect(...args),
  },
}))

vi.mock('../../src/lib/sale-sync/index.js', () => ({
  saleSyncService: {
    reconcileAll: (...args: unknown[]) => mockSalesReconcileAll(...args),
    syncStore: (...args: unknown[]) => mockSalesSyncStore(...args),
    deleteStoreSales: (...args: unknown[]) => mockSalesDelete(...args),
  },
}))

vi.mock('../../src/lib/sale-item-sync/index.js', () => ({
  saleItemSyncService: {
    reconcileAll: (...args: unknown[]) => mockSaleItemsReconcileAll(...args),
    syncStore: (...args: unknown[]) => mockSaleItemsSyncStore(...args),
    deleteStoreSaleItems: (...args: unknown[]) => mockSaleItemsDelete(...args),
  },
}))

describe('sync mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCategoryReconcileAll.mockResolvedValue({
      status: 'success',
      syncedCount: 2,
      storesProcessed: 1,
      successCount: 1,
      errorCount: 0,
      storeResults: [
        {
          tenantId: 'tenant-1',
          storeId: 'store-1',
          status: 'success',
          syncedCount: 2,
          skippedCount: 0,
        },
      ],
    })
    mockSalesReconcileAll.mockResolvedValue({
      status: 'success',
      syncedCount: 2,
      storesProcessed: 1,
      successCount: 1,
      errorCount: 0,
      storeResults: [
        {
          tenantId: 'tenant-1',
          storeId: 'store-1',
          status: 'success',
          syncedCount: 2,
          skippedCount: 0,
        },
      ],
    })
    mockCategorySyncStore.mockResolvedValue({
      storeId: 'store-1',
      synced: 2,
      deleted: 0,
      errors: [],
    })
    mockSalesSyncStore.mockResolvedValue({
      storeId: 'store-1',
      synced: 2,
      deleted: 0,
      errors: [],
    })
    mockSaleItemsReconcileAll.mockResolvedValue({
      status: 'success',
      syncedCount: 2,
      storesProcessed: 1,
      successCount: 1,
      errorCount: 0,
      storeResults: [
        {
          tenantId: 'tenant-1',
          storeId: 'store-1',
          status: 'success',
          syncedCount: 2,
          skippedCount: 0,
        },
      ],
    })
    mockSaleItemsSyncStore.mockResolvedValue({
      storeId: 'store-1',
      synced: 2,
      deleted: 0,
      errors: [],
    })
    mockCategoryDisconnect.mockResolvedValue(2)
    mockSalesDelete.mockResolvedValue(3)
    mockSaleItemsDelete.mockResolvedValue(4)
    mockDeleteStoreVendedores.mockResolvedValue(1)
  })

  it('GivenWorkerContext_WhenReconcileAll_ThenCallsCategorySalesAndSaleItemsServices', async () => {
    const context = createTestContext({
      tenantId: WORKER_CONTEXT_TENANT_ID,
      authClaims: { sub: WORKER_JWT_SUBJECT },
    })

    const result = await reconcileAll(null, { trigger: 'scheduled' }, context)

    expect(mockCategoryReconcileAll).toHaveBeenCalledWith('scheduled')
    expect(mockSalesReconcileAll).toHaveBeenCalledWith('scheduled')
    expect(mockSaleItemsReconcileAll).toHaveBeenCalledWith('scheduled')
    expect(result.status).toBe('success')
    expect(result.syncedCount).toBe(6)
    expect(result.storeResults).toHaveLength(1)
    expect(result.storeResults[0]?.syncedCount).toBe(6)
  })

  it('GivenWorkerContext_WhenReconcileStore_ThenRunsCategorySalesAndSaleItems', async () => {
    const context = createTestContext({
      tenantId: WORKER_CONTEXT_TENANT_ID,
      authClaims: { sub: WORKER_JWT_SUBJECT },
    })

    const result = await reconcileStore(
      null,
      { storeId: 'store-1', tenantId: 'tenant-1', trigger: 'manual' },
      context
    )

    expect(mockCategorySyncStore).toHaveBeenCalledWith('tenant-1', 'store-1', 'manual')
    expect(mockSalesSyncStore).toHaveBeenCalledWith('tenant-1', 'store-1', 'manual')
    expect(mockSaleItemsSyncStore).toHaveBeenCalledWith('tenant-1', 'store-1', 'manual')
    expect(result.synced).toBe(6)
    expect(result.deleted).toBe(0)
  })

  it('GivenWorkerContext_WhenDisconnectStoreData_ThenDeletesSalesSaleItemsAndCategories', async () => {
    const context = createTestContext({
      tenantId: WORKER_CONTEXT_TENANT_ID,
      authClaims: { sub: WORKER_JWT_SUBJECT },
    })

    const result = await disconnectStoreData(
      null,
      { storeId: 'store-1', tenantId: 'tenant-1' },
      context
    )

    expect(mockSaleItemsDelete).toHaveBeenCalledWith('tenant-1', 'store-1')
    expect(mockSalesDelete).toHaveBeenCalledWith('tenant-1', 'store-1')
    expect(mockCategoryDisconnect).toHaveBeenCalledWith('tenant-1', 'store-1')
    expect(mockDeleteStoreVendedores).toHaveBeenCalledWith('tenant-1', 'store-1')
    expect(result.deleted).toBe(10)
  })

  it('GivenNonWorkerContext_WhenReconcileAll_ThenThrowsForbidden', async () => {
    const context = createTestContext({
      tenantId: 'tenant-1',
      authClaims: { sub: 'other-client' },
    })

    await expect(reconcileAll(null, { trigger: 'scheduled' }, context)).rejects.toThrow(
      GraphQLError
    )
    await expect(reconcileAll(null, { trigger: 'scheduled' }, context)).rejects.toThrow(
      /worker authentication required/
    )
    expect(mockCategoryReconcileAll).not.toHaveBeenCalled()
    expect(mockSalesReconcileAll).not.toHaveBeenCalled()
    expect(mockSaleItemsReconcileAll).not.toHaveBeenCalled()
  })
})
