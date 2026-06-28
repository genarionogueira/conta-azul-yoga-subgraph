import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Db } from 'mongodb'
import { reconcileCategoriesToMongo } from '../../src/lib/category-sync/reconcile-mongo.js'

describe('reconcileCategoriesToMongo', () => {
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

    const result = await reconcileCategoriesToMongo(
      db,
      'conta_azul_categories',
      'tenant-1',
      'store-1',
      [{ id: '1', nome: 'A', tipo: 'RECEITA' }]
    )

    expect(result.synced).toBe(1)
    expect(collection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '1',
        tenantId: 'tenant-1',
        storeId: 'store-1',
      })
    )
  })

  it('GivenStaleItems_WhenReconcile_ThenDeletesMissing', async () => {
    collection.find.mockReturnValue({
      limit: () => ({
        toArray: async () => [
          { id: 'old', nome: 'Old', tipo: 'DESPESA', tenantId: 'tenant-1', storeId: 'store-1' },
        ],
      }),
    })
    collection.deleteMany.mockResolvedValue({ deletedCount: 1 })

    const result = await reconcileCategoriesToMongo(
      db,
      'conta_azul_categories',
      'tenant-1',
      'store-1',
      []
    )

    expect(result.deleted).toBe(1)
    expect(collection.deleteMany).toHaveBeenCalled()
  })
})
