import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Db } from 'mongodb'
import { reconcileSalesToMongo } from '../../src/lib/sale-sync/reconcile-mongo.js'

describe('reconcileSalesToMongo', () => {
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
      limit: () => ({
        toArray: async () => [],
      }),
    })

    const result = await reconcileSalesToMongo(
      db,
      'sales',
      'tenant-1',
      'store-1',
      [{ id: 'sale-1', tipo: 'VENDA', numero: 1001 }]
    )

    expect(result.synced).toBe(1)
    expect(collection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sale-1',
        tenantId: 'tenant-1',
        storeId: 'store-1',
      })
    )
  })

  it('GivenUnchangedItems_WhenReconcile_ThenSkipsUpdates', async () => {
    collection.find.mockReturnValue({
      limit: () => ({
        toArray: async () => [
          {
            id: 'sale-1',
            tipo: 'VENDA',
            numero: 1001,
            tenantId: 'tenant-1',
            storeId: 'store-1',
          },
        ],
      }),
    })

    const result = await reconcileSalesToMongo(
      db,
      'sales',
      'tenant-1',
      'store-1',
      [{ id: 'sale-1', tipo: 'VENDA', numero: 1001 }]
    )

    expect(result.synced).toBe(0)
    expect(collection.updateOne).not.toHaveBeenCalled()
  })

  it('GivenChangedFields_WhenReconcile_ThenUpdatesDocument', async () => {
    collection.find.mockReturnValue({
      limit: () => ({
        toArray: async () => [
          {
            id: 'sale-1',
            tipo: 'VENDA',
            numero: 1001,
            tenantId: 'tenant-1',
            storeId: 'store-1',
          },
        ],
      }),
    })

    const result = await reconcileSalesToMongo(
      db,
      'sales',
      'tenant-1',
      'store-1',
      [{ id: 'sale-1', tipo: 'ORCAMENTO', numero: 1001 }]
    )

    expect(result.synced).toBe(1)
    expect(collection.updateOne).toHaveBeenCalled()
  })

  it('GivenStaleItems_WhenReconcile_ThenDeletesMissing', async () => {
    collection.find.mockReturnValue({
      limit: () => ({
        toArray: async () => [
          {
            id: 'old',
            tipo: 'VENDA',
            tenantId: 'tenant-1',
            storeId: 'store-1',
          },
        ],
      }),
    })
    collection.deleteMany.mockResolvedValue({ deletedCount: 1 })

    const result = await reconcileSalesToMongo(
      db,
      'sales',
      'tenant-1',
      'store-1',
      []
    )

    expect(result.deleted).toBe(1)
    expect(collection.deleteMany).toHaveBeenCalled()
  })
})
