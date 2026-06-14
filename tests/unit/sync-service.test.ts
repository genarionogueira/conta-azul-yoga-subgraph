import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncToMongo } from '../../src/lib/sync/service.js'
import type { Db } from 'mongodb'

function createMockDb() {
  const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 })
  const insertMany = vi.fn().mockResolvedValue({ insertedCount: 0 })
  const collection = vi.fn().mockReturnValue({ deleteMany, insertMany })
  const db = { collection } as unknown as Db
  return { db, deleteMany, insertMany, collection }
}

describe('syncToMongo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GivenFetcherReturns2Items_WhenSyncing_ThenSyncedCountIs2', async () => {
    const { db } = createMockDb()
    const fetcher = vi.fn().mockResolvedValue([
      { id: 'a', nome: 'A', tipo: 'RECEITA' },
      { id: 'b', nome: 'B', tipo: 'DESPESA' },
    ])

    const result = await syncToMongo(db, {
      collectionName: 'conta_azul_categories',
      storeId: 'store-1',
      fetcher,
    })

    expect(result.syncedCount).toBe(2)
  })

  it('GivenFetcherReturns2Items_WhenSyncing_ThenDeleteManyCalledBeforeInsertMany', async () => {
    const { db, deleteMany, insertMany } = createMockDb()
    const order: string[] = []
    deleteMany.mockImplementation(async () => {
      order.push('delete')
      return { deletedCount: 0 }
    })
    insertMany.mockImplementation(async () => {
      order.push('insert')
      return { insertedCount: 2 }
    })
    const fetcher = vi.fn().mockResolvedValue([
      { id: 'a', nome: 'A', tipo: 'RECEITA' },
      { id: 'b', nome: 'B', tipo: 'DESPESA' },
    ])

    await syncToMongo(db, {
      collectionName: 'conta_azul_categories',
      storeId: 'store-1',
      fetcher,
    })

    expect(order).toEqual(['delete', 'insert'])
    expect(deleteMany).toHaveBeenCalledWith({ storeId: 'store-1' })
  })

  it('GivenFetcherReturnsEmpty_WhenSyncing_ThenInsertManyNotCalled', async () => {
    const { db, insertMany } = createMockDb()
    const fetcher = vi.fn().mockResolvedValue([])

    const result = await syncToMongo(db, {
      collectionName: 'conta_azul_categories',
      storeId: 'store-1',
      fetcher,
    })

    expect(insertMany).not.toHaveBeenCalled()
    expect(result.syncedCount).toBe(0)
  })

  it('GivenItems_WhenSyncing_ThenEachDocHasStoreIdAndSyncedAt', async () => {
    const { db, insertMany } = createMockDb()
    const fetcher = vi.fn().mockResolvedValue([{ id: 'a', nome: 'A', tipo: 'RECEITA' }])

    await syncToMongo(db, {
      collectionName: 'conta_azul_categories',
      storeId: 'store-1',
      fetcher,
    })

    const docs = insertMany.mock.calls[0][0]
    expect(docs[0].storeId).toBe('store-1')
    expect(docs[0]._syncedAt).toBeInstanceOf(Date)
  })

  it('GivenSuccess_WhenSyncing_ThenStatusIsSuccess', async () => {
    const { db } = createMockDb()
    const fetcher = vi.fn().mockResolvedValue([{ id: 'a', nome: 'A', tipo: 'RECEITA' }])

    const result = await syncToMongo(db, {
      collectionName: 'conta_azul_categories',
      storeId: 'store-1',
      fetcher,
    })

    expect(result.status).toBe('success')
    expect(result.syncedAt).toBeTruthy()
  })

  it('GivenFetcherThrows_WhenSyncing_ThenStatusIsError', async () => {
    const { db } = createMockDb()
    const fetcher = vi.fn().mockRejectedValue(new Error('REST failed'))

    const result = await syncToMongo(db, {
      collectionName: 'conta_azul_categories',
      storeId: 'store-1',
      fetcher,
    })

    expect(result.status).toBe('error')
    expect(result.errorMessage).toBe('REST failed')
    expect(result.syncedCount).toBe(0)
  })

  it('GivenFetcherThrows_WhenSyncing_ThenDoesNotRethrow', async () => {
    const { db } = createMockDb()
    const fetcher = vi.fn().mockRejectedValue(new Error('REST failed'))

    await expect(
      syncToMongo(db, {
        collectionName: 'conta_azul_categories',
        storeId: 'store-1',
        fetcher,
      })
    ).resolves.toBeDefined()
  })

  it('GivenDbInsertFails_WhenSyncing_ThenStatusIsError', async () => {
    const { db, insertMany } = createMockDb()
    insertMany.mockRejectedValue(new Error('insert failed'))
    const fetcher = vi.fn().mockResolvedValue([{ id: 'a', nome: 'A', tipo: 'RECEITA' }])

    const result = await syncToMongo(db, {
      collectionName: 'conta_azul_categories',
      storeId: 'store-1',
      fetcher,
    })

    expect(result.status).toBe('error')
    expect(result.errorMessage).toBe('insert failed')
  })
})
