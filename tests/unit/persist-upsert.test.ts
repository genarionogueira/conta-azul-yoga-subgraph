import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Db } from 'mongodb'
import { upsertDocuments } from '../../src/lib/persist/upsert.js'
import { normalizePersistDocument } from '../../src/lib/persist/normalize.js'

describe('upsertDocuments', () => {
  let collection: {
    updateOne: ReturnType<typeof vi.fn>
  }
  let db: Db

  beforeEach(() => {
    collection = {
      updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 }),
    }
    db = {
      collection: vi.fn().mockReturnValue(collection),
    } as unknown as Db
  })

  it('GivenNewDocument_WhenUpserting_ThenCallsUpdateOneWithUpsert', async () => {
    const doc = normalizePersistDocument(
      { id: 'sale-1', data: { tipo: 'VENDA' } },
      'tenant-1',
      'store-1'
    )

    const result = await upsertDocuments(db, 'sales', 'tenant-1', 'store-1', [doc])
    expect(result.synced).toBe(1)
    expect(collection.updateOne).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', storeId: 'store-1', id: 'sale-1' },
      { $set: doc },
      { upsert: true }
    )
  })

  it('GivenSaleScopedDocument_WhenUpserting_ThenIncludesSaleIdInFilter', async () => {
    const doc = normalizePersistDocument(
      { id: 'line-1', saleId: 'sale-1', data: { nome: 'Item' } },
      'tenant-1',
      'store-1',
      'sale-1'
    )

    await upsertDocuments(db, 'sale_items', 'tenant-1', 'store-1', [doc], {
      saleId: 'sale-1',
    })

    expect(collection.updateOne).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', storeId: 'store-1', id: 'line-1', saleId: 'sale-1' },
      { $set: doc },
      { upsert: true }
    )
  })
})
