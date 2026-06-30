import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Db } from 'mongodb'
import {
  pruneOrphanSaleItems,
  reconcileSaleItemsForSale,
} from '../../src/lib/sale-item-sync/reconcile-mongo.js'

describe('reconcileSaleItemsForSale', () => {
  let collection: {
    find: ReturnType<typeof vi.fn>
    insertOne: ReturnType<typeof vi.fn>
    updateOne: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  let db: Db

  beforeEach(() => {
    collection = {
      find: vi.fn(),
      insertOne: vi.fn(),
      updateOne: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    }
    db = {
      collection: vi.fn().mockReturnValue(collection),
    } as unknown as Db
  })

  it('GivenNewItems_WhenReconcile_ThenInsertsDocuments', async () => {
    collection.find.mockReturnValue({
      toArray: async () => [],
    })

    const result = await reconcileSaleItemsForSale(
      db,
      'sale_items',
      'tenant-1',
      'store-1',
      'sale-1',
      [
        {
          id: 'line-1',
          saleId: 'sale-1',
          nome: 'Widget',
          tipo: 'PRODUTO',
          quantidade: 1,
          valor: 10,
        },
      ]
    )

    expect(result.synced).toBe(1)
    expect(collection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'line-1',
        saleId: 'sale-1',
        tenantId: 'tenant-1',
        storeId: 'store-1',
      })
    )
  })

  it('GivenUnchangedItems_WhenReconcile_ThenSkipsUpdates', async () => {
    collection.find.mockReturnValue({
      toArray: async () => [
        {
          id: 'line-1',
          saleId: 'sale-1',
          nome: 'Widget',
          tipo: 'PRODUTO',
          quantidade: 1,
          valor: 10,
          tenantId: 'tenant-1',
          storeId: 'store-1',
        },
      ],
    })

    const result = await reconcileSaleItemsForSale(
      db,
      'sale_items',
      'tenant-1',
      'store-1',
      'sale-1',
      [
        {
          id: 'line-1',
          saleId: 'sale-1',
          nome: 'Widget',
          tipo: 'PRODUTO',
          quantidade: 1,
          valor: 10,
        },
      ]
    )

    expect(result.synced).toBe(0)
    expect(collection.updateOne).not.toHaveBeenCalled()
  })

  it('GivenChangedFields_WhenReconcile_ThenUpdatesDocument', async () => {
    collection.find.mockReturnValue({
      toArray: async () => [
        {
          id: 'line-1',
          saleId: 'sale-1',
          nome: 'Widget',
          tipo: 'PRODUTO',
          quantidade: 1,
          valor: 10,
          tenantId: 'tenant-1',
          storeId: 'store-1',
        },
      ],
    })

    const result = await reconcileSaleItemsForSale(
      db,
      'sale_items',
      'tenant-1',
      'store-1',
      'sale-1',
      [
        {
          id: 'line-1',
          saleId: 'sale-1',
          nome: 'Widget',
          tipo: 'PRODUTO',
          quantidade: 2,
          valor: 10,
        },
      ]
    )

    expect(result.synced).toBe(1)
    expect(collection.updateOne).toHaveBeenCalled()
  })

  it('GivenStaleItems_WhenReconcile_ThenDeletesMissing', async () => {
    collection.find.mockReturnValue({
      toArray: async () => [
        {
          id: 'old-line',
          saleId: 'sale-1',
          tenantId: 'tenant-1',
          storeId: 'store-1',
        },
      ],
    })
    collection.deleteMany.mockResolvedValue({ deletedCount: 1 })

    const result = await reconcileSaleItemsForSale(
      db,
      'sale_items',
      'tenant-1',
      'store-1',
      'sale-1',
      []
    )

    expect(result.deleted).toBe(1)
    expect(collection.deleteMany).toHaveBeenCalled()
  })
})

describe('pruneOrphanSaleItems', () => {
  it('GivenOrphanSaleIds_WhenPruning_ThenDeletesRowsForMissingSales', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 2 })
    const db = {
      collection: vi.fn().mockReturnValue({ deleteMany }),
    } as unknown as Db

    const deleted = await pruneOrphanSaleItems(
      db,
      'sale_items',
      'tenant-1',
      'store-1',
      ['sale-1']
    )

    expect(deleted).toBe(2)
    expect(deleteMany).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      saleId: { $nin: ['sale-1'] },
    })
  })
})
