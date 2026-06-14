import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildConnection } from '../../src/lib/pagination/service.js'
import { encodeCursor } from '../../src/lib/pagination/cursor.js'
import type { MongoRepository } from '../../src/lib/mongo/repository.js'
import type { Document } from 'mongodb'

function createMockRepo(items: Document[], totalCount?: number) {
  const findMany = vi.fn(async ({ limit, offset }: { limit?: number; offset?: number }) => {
    const start = offset ?? 0
    const end = limit != null ? start + limit : items.length
    return items.slice(start, end)
  })
  const count = vi.fn(async () => totalCount ?? items.length)
  const repo = { findMany, count } as unknown as MongoRepository<Document>
  return { repo, findMany, count }
}

describe('buildConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GivenFirst5AndNoAfter_WhenCalled_ThenReturnsFirst5NodesWithCorrectPageInfo', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}` }))
    const { repo } = createMockRepo(items)

    const result = await buildConnection(repo, { first: 5 })

    expect(result.nodes).toHaveLength(5)
    expect(result.edges).toHaveLength(5)
    expect(result.pageInfo.hasNextPage).toBe(true)
    expect(result.pageInfo.hasPreviousPage).toBe(false)
    expect(result.pageInfo.startCursor).toBe(encodeCursor(0))
    expect(result.pageInfo.endCursor).toBe(encodeCursor(4))
    expect(result.totalCount).toBe(10)
  })

  it('GivenFirst5AndAfterOffset4_WhenCalled_ThenSkips5ItemsAndReturnNext5', async () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ id: `item-${i}` }))
    const { repo } = createMockRepo(items)

    const result = await buildConnection(repo, { first: 5, after: encodeCursor(4) })

    expect(result.nodes.map((n) => n.id)).toEqual(['item-5', 'item-6', 'item-7', 'item-8', 'item-9'])
    expect(result.pageInfo.hasPreviousPage).toBe(true)
    expect(result.pageInfo.hasNextPage).toBe(true)
  })

  it('GivenFirst1000AndOnly10Items_WhenCalled_ThenHasNextPageFalse', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}` }))
    const { repo } = createMockRepo(items)

    const result = await buildConnection(repo, { first: 1000 })

    expect(result.pageInfo.hasNextPage).toBe(false)
    expect(result.nodes).toHaveLength(10)
  })

  it('GivenLast3AndBeforeOffset6_WhenCalled_ThenReturnsItems3To5', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}` }))
    const { repo } = createMockRepo(items)

    const result = await buildConnection(repo, { last: 3, before: encodeCursor(6) })

    expect(result.nodes.map((n) => n.id)).toEqual(['item-3', 'item-4', 'item-5'])
    expect(result.pageInfo.hasNextPage).toBe(true)
    expect(result.pageInfo.hasPreviousPage).toBe(true)
  })

  it('GivenNeitherFirstNorLast_WhenCalled_ThenDefaultsToFirst10', async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `item-${i}` }))
    const { repo, findMany } = createMockRepo(items)

    const result = await buildConnection(repo, {})

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ limit: 11, offset: 0 }))
    expect(result.nodes).toHaveLength(10)
    expect(result.pageInfo.hasNextPage).toBe(true)
  })

  it('GivenFirst0_WhenCalled_ThenThrowsBadUserInput', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `item-${i}` }))
    const { repo } = createMockRepo(items)

    await expect(buildConnection(repo, { first: 0 })).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', field: 'first' },
    })
  })

  it('GivenAfterLastItem_WhenCalled_ThenReturnsEmptyWithHasNextPageFalse', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `item-${i}` }))
    const { repo } = createMockRepo(items)

    const result = await buildConnection(repo, { first: 5, after: encodeCursor(4) })

    expect(result.nodes).toHaveLength(0)
    expect(result.pageInfo.hasNextPage).toBe(false)
    expect(result.pageInfo.hasPreviousPage).toBe(true)
  })

  it('GivenFirst1_WhenExactly1ItemExists_ThenHasNextPageFalse', async () => {
    const items = [{ id: 'item-0' }]
    const { repo } = createMockRepo(items)

    const result = await buildConnection(repo, { first: 1 })

    expect(result.nodes).toHaveLength(1)
    expect(result.pageInfo.hasNextPage).toBe(false)
  })

  it('GivenFirst1_WhenMoreThan1ItemExists_ThenHasNextPageTrue', async () => {
    const items = [{ id: 'item-0' }, { id: 'item-1' }]
    const { repo } = createMockRepo(items)

    const result = await buildConnection(repo, { first: 1 })

    expect(result.nodes).toHaveLength(1)
    expect(result.pageInfo.hasNextPage).toBe(true)
  })

  it('GivenInvalidAfterCursor_WhenCalled_ThenReturnsNaN_OffsetFallsBackTo0', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `item-${i}` }))
    const { repo } = createMockRepo(items)

    const result = await buildConnection(repo, { first: 2, after: 'not-valid-base64!!!' })

    expect(result.nodes.map((n) => n.id)).toEqual(['item-0', 'item-1'])
    expect(result.pageInfo.hasPreviousPage).toBe(false)
  })

  it('GivenWhereFilter_WhenCalled_ThenPassesFilterToFindManyAndCount', async () => {
    const items = [{ id: 'item-0', tipo: 'RECEITA' }]
    const { repo, findMany, count } = createMockRepo(items)
    const where = { tipo: { _eq: 'RECEITA' } }

    await buildConnection(repo, { first: 5, where })

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }))
    expect(count).toHaveBeenCalledWith(where, undefined)
  })

  it('GivenParallelFindManyAndCount_WhenCalled_ThenBothCalledWithSameWhere', async () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ id: `item-${i}` }))
    const { repo, findMany, count } = createMockRepo(items)
    const where = { storeId: { _eq: 'store-1' } }

    await buildConnection(repo, { first: 2, where })

    expect(findMany).toHaveBeenCalled()
    expect(count).toHaveBeenCalledWith(where, undefined)
  })

  it('GivenTotalCount7_WhenFirst5_ThenTotalCountIs7NotTruncated', async () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ id: `item-${i}` }))
    const { repo } = createMockRepo(items, 7)

    const result = await buildConnection(repo, { first: 5 })

    expect(result.nodes).toHaveLength(5)
    expect(result.totalCount).toBe(7)
  })

  it('GivenFilteredWhere_WhenFirstIsLessThanTotal_ThenTotalCountReflectsFullFilteredSet', async () => {
    const items = [{ id: 'item-0', tipo: 'RECEITA' }]
    const { repo } = createMockRepo(items, 3)
    const where = { tipo: { _eq: 'RECEITA' } }

    const result = await buildConnection(repo, { first: 1, where })

    expect(result.nodes).toHaveLength(1)
    expect(result.totalCount).toBe(3)
  })

  it('GivenEmptyCollection_WhenFirst10_ThenTotalCountIs0AndEdgesEmpty', async () => {
    const { repo } = createMockRepo([], 0)

    const result = await buildConnection(repo, { first: 10 })

    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
    expect(result.totalCount).toBe(0)
    expect(result.diagnostics).toEqual([])
    expect(result.pageInfo.hasNextPage).toBe(false)
    expect(result.pageInfo.hasPreviousPage).toBe(false)
  })
})
