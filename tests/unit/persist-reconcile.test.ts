import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Db } from 'mongodb'
import { reconcileDocuments } from '../../src/lib/persist/reconcile.js'
import { normalizePersistDocument } from '../../src/lib/persist/normalize.js'

describe('reconcileDocuments', () => {
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
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    }
    db = {
      collection: vi.fn().mockReturnValue(collection),
    } as unknown as Db
  })

  it('GivenStaleRows_WhenReconciling_ThenDeletesMissingIds', async () => {
    collection.find.mockReturnValue({
      limit: () => ({
        toArray: async () => [
          { id: 'sale-1' },
          { id: 'sale-2' },
        ],
      }),
    })

    const keep = normalizePersistDocument(
      { id: 'sale-1', data: { tipo: 'VENDA' } },
      'tenant-1',
      'store-1'
    )

    collection.deleteMany.mockResolvedValue({ deletedCount: 1 })
    const result = await reconcileDocuments(db, 'sales', 'tenant-1', 'store-1', [keep])

    expect(result.deleted).toBe(1)
    expect(collection.deleteMany).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      id: { $in: ['sale-2'] },
    })
  })

  it('GivenSaleScopedItems_WhenReconciling_ThenScopesDeleteFilter', async () => {
    collection.find.mockReturnValue({
      limit: () => ({
        toArray: async () => [{ id: 'line-1' }, { id: 'line-2' }],
      }),
    })

    const keep = normalizePersistDocument(
      { id: 'line-1', saleId: 'sale-1', data: { nome: 'A' } },
      'tenant-1',
      'store-1',
      'sale-1'
    )

    collection.deleteMany.mockResolvedValue({ deletedCount: 1 })
    await reconcileDocuments(db, 'sale_items', 'tenant-1', 'store-1', [keep], {
      saleId: 'sale-1',
    })

    expect(collection.deleteMany).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      saleId: 'sale-1',
      id: { $in: ['line-2'] },
    })
  })
})
