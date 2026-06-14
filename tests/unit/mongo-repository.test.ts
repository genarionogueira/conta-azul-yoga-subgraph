import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MongoRepository } from '../../src/lib/mongo/repository.js'
import { getDb } from '../../src/lib/mongo/connection.js'
import type { Collection, Document } from 'mongodb'

function createMockCollection() {
  const toArray = vi.fn().mockResolvedValue([])
  const limit = vi.fn().mockReturnThis()
  const skip = vi.fn().mockReturnThis()
  const sort = vi.fn().mockReturnThis()
  const find = vi.fn().mockReturnValue({ sort, skip, limit, toArray })
  const countDocuments = vi.fn().mockResolvedValue(0)
  const collection = { find, countDocuments } as unknown as Collection<Document>
  return { collection, find, sort, skip, limit, toArray, countDocuments }
}

describe('MongoRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GivenNoFilter_WhenFindMany_ThenPassesEmptyFilterToCollection', async () => {
    const { collection, find } = createMockCollection()
    const repo = new MongoRepository(collection)

    await repo.findMany()

    expect(find).toHaveBeenCalledWith({})
  })

  it('GivenEqWhereFilter_WhenFindMany_ThenPassesTranslatedMongoFilter', async () => {
    const { collection, find } = createMockCollection()
    const repo = new MongoRepository(collection)

    await repo.findMany({ where: { tipo: { _eq: 'RECEITA' } } })

    expect(find).toHaveBeenCalledWith({ tipo: { $eq: 'RECEITA' } })
  })

  it('GivenLimitAndOffset_WhenFindMany_ThenAppliesSkipAndLimit', async () => {
    const { collection, skip, limit } = createMockCollection()
    const repo = new MongoRepository(collection)

    await repo.findMany({ limit: 5, offset: 10 })

    expect(skip).toHaveBeenCalledWith(10)
    expect(limit).toHaveBeenCalledWith(5)
  })

  it('GivenDefaultArgs_WhenFindMany_ThenUsesLimit100AndOffset0', async () => {
    const { collection, skip, limit } = createMockCollection()
    const repo = new MongoRepository(collection)

    await repo.findMany({})

    expect(skip).toHaveBeenCalledWith(0)
    expect(limit).toHaveBeenCalledWith(100)
  })

  it('GivenNoFilter_WhenCount_ThenPassesEmptyFilter', async () => {
    const { collection, countDocuments } = createMockCollection()
    const repo = new MongoRepository(collection)

    await repo.count()

    expect(countDocuments).toHaveBeenCalledWith({})
  })

  it('GivenWhereFilter_WhenCount_ThenPassesTranslatedFilter', async () => {
    const { collection, countDocuments } = createMockCollection()
    const repo = new MongoRepository(collection)

    await repo.count({ storeId: { _eq: 'store-1' } })

    expect(countDocuments).toHaveBeenCalledWith({ storeId: { $eq: 'store-1' } })
  })

  it('GivenNullWhere_WhenFindMany_ThenPassesEmptyFilter', async () => {
    const { collection, find } = createMockCollection()
    const repo = new MongoRepository(collection)

    await repo.findMany({ where: null })

    expect(find).toHaveBeenCalledWith({})
  })

  it('GivenUninitializedDb_WhenGetDb_ThenThrows', () => {
    expect(() => getDb()).toThrow('MongoDB not initialized')
  })
})
