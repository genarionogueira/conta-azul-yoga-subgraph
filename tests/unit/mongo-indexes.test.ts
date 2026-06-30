import { describe, expect, it, vi } from 'vitest'
import { MongoServerError } from 'mongodb'
import { ensureCategoriesIndexes, ensureSaleItemIndexes, ensureSalesIndexes } from '../../src/lib/mongo/indexes.js'
import type { Db } from 'mongodb'

describe('ensureCategoriesIndexes', () => {
  it('GivenDb_WhenEnsuringIndexes_ThenSyncedAtIndexHasNoTtl', async () => {
    const createIndex = vi.fn().mockResolvedValue('ok')
    const db = {
      collection: vi.fn().mockReturnValue({ createIndex }),
    } as unknown as Db

    await ensureCategoriesIndexes(db)

    const syncedAtCall = createIndex.mock.calls.find(
      (call) => JSON.stringify(call[0]) === JSON.stringify({ _syncedAt: 1 })
    )
    expect(syncedAtCall).toBeDefined()
    expect(syncedAtCall?.[1]).toBeUndefined()

    const expiresAtCall = createIndex.mock.calls.find(
      (call) => JSON.stringify(call[0]) === JSON.stringify({ expiresAt: 1 })
    )
    expect(expiresAtCall).toBeDefined()
  })

  it('GivenIndexOptionsConflict_WhenEnsuringIndexes_ThenContinuesWithoutThrowing', async () => {
    const conflict = new MongoServerError('IndexOptionsConflict')
    conflict.code = 85
    const createIndex = vi
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValue('ok')
    const db = {
      collection: vi.fn().mockReturnValue({ createIndex }),
    } as unknown as Db

    await expect(ensureCategoriesIndexes(db)).resolves.toBeUndefined()
  })
})

describe('ensureSalesIndexes', () => {
  it('GivenDb_WhenEnsuringIndexes_ThenCreatesSalesLookupIndexes', async () => {
    const createIndex = vi.fn().mockResolvedValue('ok')
    const db = {
      collection: vi.fn().mockReturnValue({ createIndex }),
    } as unknown as Db

    await ensureSalesIndexes(db)

    expect(createIndex.mock.calls.some(
      (call) => JSON.stringify(call[0]) === JSON.stringify({ data: 1 })
    )).toBe(true)
    expect(createIndex.mock.calls.some(
      (call) => JSON.stringify(call[0]) === JSON.stringify({ tenantId: 1, storeId: 1, id: 1 })
    )).toBe(true)
  })
})

describe('ensureSaleItemIndexes', () => {
  it('GivenDb_WhenEnsuringIndexes_ThenCreatesSaleItemLookupIndexes', async () => {
    const createIndex = vi.fn().mockResolvedValue('ok')
    const db = {
      collection: vi.fn().mockReturnValue({ createIndex }),
    } as unknown as Db

    await ensureSaleItemIndexes(db)

    expect(createIndex.mock.calls.some(
      (call) => JSON.stringify(call[0]) === JSON.stringify({ saleId: 1 })
    )).toBe(true)
    expect(createIndex.mock.calls.some(
      (call) => JSON.stringify(call[0]) === JSON.stringify({ tenantId: 1, storeId: 1, id: 1 })
    )).toBe(true)
  })
})
