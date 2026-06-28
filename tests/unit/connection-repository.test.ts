import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Collection, Db } from 'mongodb'
import { ConnectionRepository } from '../../src/lib/connections/connection-repository.js'
import type { ConnectionDocument } from '../../src/lib/connections/types.js'

function createMockCollection() {
  const updateOne = vi.fn().mockResolvedValue({ upsertedCount: 1 })
  const deleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 })
  const toArray = vi.fn().mockResolvedValue([])
  const sort = vi.fn().mockReturnValue({ toArray })
  const find = vi.fn().mockReturnValue({ sort })
  const findOne = vi.fn().mockResolvedValue(null)
  const collection = {
    updateOne,
    deleteOne,
    find,
    findOne,
  } as unknown as Collection<ConnectionDocument>

  return { collection, updateOne, deleteOne, find, sort, toArray, findOne }
}

describe('ConnectionRepository', () => {
  let collection: ReturnType<typeof createMockCollection>
  let repository: ConnectionRepository

  beforeEach(() => {
    collection = createMockCollection()
    const db = {
      collection: vi.fn().mockReturnValue(collection.collection),
    } as unknown as Db
    repository = new ConnectionRepository(() => db)
  })

  it('GivenNewConnection_WhenUpsert_ThenInsertsWithName', async () => {
    await repository.upsert('tenant-1', 'store-1', 'Butantã')

    expect(collection.updateOne).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', id: 'store-1' },
      expect.objectContaining({
        $set: expect.objectContaining({ name: 'Butantã' }),
        $setOnInsert: expect.objectContaining({ tenantId: 'tenant-1', id: 'store-1' }),
      }),
      { upsert: true }
    )
  })

  it('GivenEmptyName_WhenUpsert_ThenStoresIdAsName', async () => {
    await repository.upsert('tenant-1', 'store-1', '   ')

    expect(collection.updateOne).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', id: 'store-1' },
      expect.objectContaining({
        $set: expect.objectContaining({ name: 'store-1' }),
      }),
      { upsert: true }
    )
  })

  it('GivenDuplicateTenantIdAndId_WhenUpsert_ThenUpdatesName', async () => {
    await repository.upsert('tenant-1', 'store-1', 'First')
    await repository.upsert('tenant-1', 'store-1', 'Second')

    expect(collection.updateOne).toHaveBeenCalledTimes(2)
    expect(collection.updateOne).toHaveBeenLastCalledWith(
      { tenantId: 'tenant-1', id: 'store-1' },
      expect.objectContaining({
        $set: expect.objectContaining({ name: 'Second' }),
      }),
      { upsert: true }
    )
  })

  it('GivenConnection_WhenDelete_ThenRemovesByTenantAndId', async () => {
    await repository.delete('tenant-1', 'store-1')

    expect(collection.deleteOne).toHaveBeenCalledWith({ tenantId: 'tenant-1', id: 'store-1' })
  })

  it('GivenTenant_WhenListByTenant_ThenQueriesSortedByConnectedAt', async () => {
    await repository.listByTenant('tenant-1')

    expect(collection.find).toHaveBeenCalledWith({ tenantId: 'tenant-1' })
    expect(collection.sort).toHaveBeenCalledWith({ connectedAt: -1 })
  })
})
