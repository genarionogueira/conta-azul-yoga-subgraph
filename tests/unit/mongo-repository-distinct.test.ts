import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MongoRepository } from '../../src/lib/mongo/repository.js'
import type { Collection, Document } from 'mongodb'

function createMockCollection() {
  const toArray = vi.fn().mockResolvedValue([])
  const limit = vi.fn().mockReturnThis()
  const skip = vi.fn().mockReturnThis()
  const sort = vi.fn().mockReturnThis()
  const find = vi.fn().mockReturnValue({ sort, skip, limit, toArray })
  const countDocuments = vi.fn().mockResolvedValue(0)
  const aggregate = vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })
  const collection = { find, countDocuments, aggregate } as unknown as Collection<Document>
  return { collection, find, sort, skip, limit, toArray, countDocuments, aggregate }
}

describe('MongoRepository distinctOn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GivenDuplicateTipoRows_WhenFindManyDistinctOnTipo_ThenUsesGroupPipeline', async () => {
    const { collection, aggregate } = createMockCollection()
    const repo = new MongoRepository(collection)

    await repo.findMany({ distinctOn: ['tipo'], limit: 10, offset: 0 })

    expect(aggregate).toHaveBeenCalled()
    const pipeline = aggregate.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(pipeline.some((stage) => '$group' in stage)).toBe(true)
  })

  it('GivenDistinctOn_WhenCount_ThenUsesDistinctCountPipeline', async () => {
    const { collection, aggregate } = createMockCollection()
    aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ total: 2 }]),
    })
    const repo = new MongoRepository(collection)

    const result = await repo.count({ storeId: { _eq: 'store-1' } }, ['tipo'])

    expect(result).toBe(2)
    const pipeline = aggregate.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(pipeline[0]).toEqual({ $match: { storeId: { $eq: 'store-1' } } })
    expect(pipeline.some((stage) => '$group' in stage)).toBe(true)
  })

  it('GivenNullDistinctOn_WhenFindMany_ThenFallsBackToNormalFind', async () => {
    const { collection, find, aggregate } = createMockCollection()
    const repo = new MongoRepository(collection)

    await repo.findMany({ where: { tipo: { _eq: 'RECEITA' } } })

    expect(find).toHaveBeenCalledWith({ tipo: { $eq: 'RECEITA' } })
    expect(aggregate).not.toHaveBeenCalled()
  })
})
