import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildConnection } from '../../src/lib/pagination/service.js'
import type { MongoRepository } from '../../src/lib/mongo/repository.js'
import type { Document } from 'mongodb'

function createMockRepo(items: Document[], totalCount?: number) {
  const findMany = vi.fn(async () => items)
  const count = vi.fn(async () => totalCount ?? items.length)
  const repo = { findMany, count } as unknown as MongoRepository<Document>
  return { repo, findMany, count }
}

describe('buildConnection with distinct_on', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GivenDistinctOn_WhenBuildingConnection_ThenPassesDistinctToRepoFindMany', async () => {
    const items = [{ id: 'item-0', tipo: 'RECEITA' }]
    const { repo, findMany } = createMockRepo(items)

    await buildConnection(repo, { first: 5, distinct_on: ['tipo'] })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ distinctOn: ['tipo'] })
    )
  })

  it('GivenDistinctOn_WhenBuildingConnection_ThenPassesDistinctToRepoCount', async () => {
    const items = [{ id: 'item-0', tipo: 'RECEITA' }]
    const { repo, count } = createMockRepo(items)

    await buildConnection(repo, { first: 5, distinct_on: ['tipo'] })

    expect(count).toHaveBeenCalledWith(undefined, ['tipo'])
  })

  it('GivenNoDistinctOn_WhenBuildingConnection_ThenBehaviorUnchangedFromExisting', async () => {
    const items = [{ id: 'item-0' }]
    const { repo, findMany, count } = createMockRepo(items)

    await buildConnection(repo, { first: 5 })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ distinctOn: undefined })
    )
    expect(count).toHaveBeenCalledWith(undefined, undefined)
  })
})
