import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EntityDef } from '../../src/lib/entity/types.js'
import {
  makeConnectionResolver,
  makeAggregateResolver,
  makeSyncResolver,
} from '../../src/lib/entity/resolvers.js'
import { clearRestAdaptersForTest, registerRestAdapter } from '../../src/lib/entity/adapters.js'

const categoryEntity: EntityDef = {
  name: 'ContaAzulCategory',
  fields: [
    { name: 'id', type: 'ID', nullable: false },
    { name: 'storeId', type: 'ID', nullable: false },
    { name: 'nome', type: 'String', nullable: false },
    { name: 'tipo', type: 'String', nullable: false },
  ],
  mongo: { collection: 'conta_azul_categories' },
  rest: { adapter: 'contaAzul', list: 'listCategorias' },
  tenant: { field: 'storeId' },
  cache: null,
  key: { fields: 'id storeId' },
}

const diagnoseEntityQuery = vi.fn().mockResolvedValue([])

function createCollectionMock(items: Record<string, unknown>[], totalCount?: number) {
  const count = totalCount ?? items.length
  const cursorChain = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({ toArray: async () => items }),
    toArray: async () => items,
  }
  return {
    find: () => cursorChain,
    countDocuments: async () => count,
    aggregate: () => ({ toArray: async () => items }),
    deleteMany: async () => ({ deletedCount: 0 }),
    insertMany: async () => ({ insertedCount: items.length }),
  }
}

vi.mock('../../src/lib/mongo/connection.js', () => ({
  getDb: vi.fn(),
}))

vi.mock('../../src/context.js', () => ({
  getTokenResolver: () => ({
    ping: vi.fn().mockResolvedValue(undefined),
    getToken: vi.fn(),
    isStoreRegistered: vi.fn(),
    listRegisteredStoreIds: vi.fn().mockResolvedValue([]),
    listConnectedStoreIds: vi.fn().mockResolvedValue([]),
  }),
}))

vi.mock('../../src/lib/diagnostics/generic-query.js', () => ({
  diagnoseEntityQuery: (...args: unknown[]) => diagnoseEntityQuery(...args),
}))

describe('entity resolver factories', () => {
  beforeEach(async () => {
    clearRestAdaptersForTest()
    vi.clearAllMocks()
    const { getDb } = await import('../../src/lib/mongo/connection.js')
    vi.mocked(getDb).mockReturnValue({
      collection: () => createCollectionMock([{ id: '1', storeId: 's1' }]),
    } as never)
  })

  it('GivenConnectionFactory_WhenCalledWithWhere_ThenReturnsConnection', async () => {
    const resolver = makeConnectionResolver(categoryEntity)
    const result = await resolver({}, { where: { storeId: { _eq: 's1' } }, first: 10 })
    expect(result.nodes.length).toBeGreaterThan(0)
    expect(result.totalCount).toBe(1)
  })

  it('GivenConnectionFactory_WhenResultEmpty_ThenRunsDiagnostics', async () => {
    const { getDb } = await import('../../src/lib/mongo/connection.js')
    vi.mocked(getDb).mockReturnValue({
      collection: () => createCollectionMock([], 0),
    } as never)

    const resolver = makeConnectionResolver(categoryEntity)
    await resolver({}, { first: 10 })
    expect(diagnoseEntityQuery).toHaveBeenCalled()
  })

  it('GivenAggregateFactory_WhenCalled_ThenReturnsCountFromRepo', async () => {
    const resolver = makeAggregateResolver(categoryEntity)
    const result = await resolver({}, { where: {} })
    expect(result.aggregate.count).toBe(1)
    expect(result.nodes.length).toBeGreaterThan(0)
  })

  it('GivenSyncFactory_WhenCalled_ThenCallsAdapterFetcherForEachStore', async () => {
    const fetcher = vi.fn().mockResolvedValue([{ id: '1', nome: 'A', tipo: 'R' }])
    registerRestAdapter('contaAzul', {
      listConnectedStoreIds: async () => ['store-1'],
      getClientForStore: async () => ({ listCategorias: fetcher }),
    })

    const resolver = makeSyncResolver(categoryEntity)
    const result = await resolver({}, {})
    expect(fetcher).toHaveBeenCalled()
    expect(result.status).toBe('success')
  })

  it('GivenSyncFactory_WhenStoreIdProvided_ThenSyncsOnlyThatStore', async () => {
    const listConnected = vi.fn()
    registerRestAdapter('contaAzul', {
      listConnectedStoreIds: listConnected,
      getClientForStore: async () => ({
        listCategorias: async () => [{ id: '1' }],
      }),
    })

    const resolver = makeSyncResolver(categoryEntity)
    await resolver({}, { storeId: 'store-1' })
    expect(listConnected).not.toHaveBeenCalled()
  })

  it('GivenMakeSyncResolver_WhenEntityHasNoRest_ThenThrowsAtFactoryTime', () => {
    expect(() => makeSyncResolver({ ...categoryEntity, rest: null })).toThrow(/no @rest/)
  })

  it('GivenSyncFactory_WhenFetcherFails_ThenReturnsErrorStatus', async () => {
    registerRestAdapter('contaAzul', {
      listConnectedStoreIds: async () => ['store-1'],
      getClientForStore: async () => ({
        listCategorias: async () => {
          throw new Error('api down')
        },
      }),
    })

    const resolver = makeSyncResolver(categoryEntity)
    const result = await resolver({}, { storeId: 'store-1' })
    expect(result.status).toBe('error')
    expect(result.errorMessage).toContain('api down')
  })
})
