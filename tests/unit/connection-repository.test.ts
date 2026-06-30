import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Collection, Db } from 'mongodb'
import { ConnectionRepository } from '../../src/lib/connections/connection-repository.js'
import type { ConnectionDocument } from '../../src/lib/connections/types.js'

function createMockCollection() {
  const updateOne = vi.fn().mockResolvedValue({ upsertedCount: 1 })
  const insertOne = vi.fn().mockResolvedValue({ insertedId: 'id-1' })
  const deleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 })
  const updateMany = vi.fn().mockResolvedValue({ modifiedCount: 0 })
  const countDocuments = vi.fn().mockResolvedValue(0)
  const toArray = vi.fn().mockResolvedValue([])
  const sort = vi.fn().mockReturnValue({ toArray })
  const find = vi.fn().mockReturnValue({ sort })
  const findOne = vi.fn().mockResolvedValue(null)
  const collection = {
    updateOne,
    insertOne,
    deleteOne,
    updateMany,
    countDocuments,
    find,
    findOne,
  } as unknown as Collection<ConnectionDocument>

  return {
    collection,
    updateOne,
    insertOne,
    deleteOne,
    updateMany,
    countDocuments,
    find,
    sort,
    toArray,
    findOne,
  }
}

describe('ConnectionRepository', () => {
  let collection: ReturnType<typeof createMockCollection>
  let repository: ConnectionRepository
  let db: Db

  beforeEach(() => {
    collection = createMockCollection()
    db = {
      collection: vi.fn((name: string) => {
        if (name === 'conta_azul_connections') return collection.collection
        return { updateMany: collection.updateMany, countDocuments: collection.countDocuments }
      }),
    } as unknown as Db
    repository = new ConnectionRepository(() => db)
  })

  it('GivenNewConnection_WhenCreate_ThenInsertsDocument', async () => {
    const doc = await repository.create('tenant-1', 'store-1', '12345678000190', 'Butantã')

    expect(doc.storeId).toBe('store-1')
    expect(doc.contaAzulAccountId).toBe('12345678000190')
    expect(doc.status).toBe('ACTIVE')
    expect(collection.insertOne).toHaveBeenCalled()
  })

  it('GivenActiveConnection_WhenSoftDisconnect_ThenUpdatesStatus', async () => {
    await repository.softDisconnect('tenant-1', 'conn-1')

    expect(collection.updateOne).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', connectionId: 'conn-1' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'DISCONNECTED' }),
      })
    )
  })

  it('GivenDisconnectedConnection_WhenReactivate_ThenSetsActiveAndStoreId', async () => {
    await repository.reactivate('tenant-1', 'conn-1', 'store-2', 'Renamed')

    expect(collection.updateOne).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', connectionId: 'conn-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          storeId: 'store-2',
          status: 'ACTIVE',
          name: 'Renamed',
        }),
      })
    )
  })

  it('GivenTenant_WhenListByTenant_ThenQueriesSortedByConnectedAt', async () => {
    await repository.listByTenant('tenant-1')

    expect(collection.find).toHaveBeenCalledWith({ tenantId: 'tenant-1' })
    expect(collection.sort).toHaveBeenCalledWith({ connectedAt: -1 })
  })
})
