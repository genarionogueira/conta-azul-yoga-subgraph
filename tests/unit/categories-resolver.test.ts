import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeConnectionResolver } from '../../src/lib/entity/resolvers.js'
import type { EntityDef } from '../../src/lib/entity/types.js'
import { createTestContext } from '../helpers/test-context.js'

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

const categoryEntityWithCache: EntityDef = {
  ...categoryEntity,
  cache: { ttl: '24h' },
}

const buildConnection = vi.fn()
const diagnoseEntityQuery = vi.fn()
const ensureFreshCache = vi.fn()

vi.mock('../../src/lib/mongo/connection.js', () => ({
  getDb: vi.fn(() => ({
    collection: vi.fn(() => ({})),
  })),
}))

vi.mock('../../src/lib/mongo/repository.js', () => ({
  MongoRepository: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('../../src/lib/pagination/index.js', () => ({
  buildConnection: (...args: unknown[]) => buildConnection(...args),
}))

vi.mock('../../src/lib/diagnostics/generic-query.js', () => ({
  diagnoseEntityQuery: (...args: unknown[]) => diagnoseEntityQuery(...args),
}))

vi.mock('../../src/lib/cache/index.js', () => ({
  ensureFreshCache: (...args: unknown[]) => ensureFreshCache(...args),
  logCache: vi.fn(),
  metaKey: vi.fn(),
  parseTtl: vi.fn(),
  writeMeta: vi.fn(),
}))

vi.mock('../../src/context.js', () => ({
  getTokenStore: vi.fn(() => ({})),
  getTokenResolver: vi.fn(() => ({})),
  listConnectedStoreIds: vi.fn().mockResolvedValue(['store-1']),
}))

describe('contaAzulCategories resolver (entity factory)', () => {
  const contaAzulCategories = makeConnectionResolver(categoryEntity)
  const contaAzulCategoriesCached = makeConnectionResolver(categoryEntityWithCache)

  beforeEach(() => {
    vi.clearAllMocks()
    ensureFreshCache.mockResolvedValue(undefined)
  })

  it('GivenMongoReturnsData_WhenQueryingCategories_ThenReturnsConnectionWithStoreId', async () => {
    const connection = {
      edges: [
        {
          cursor: 'MA==',
          node: { id: 'cat-1', storeId: 'store-1', nome: 'Receitas', tipo: 'RECEITA' },
        },
      ],
      nodes: [{ id: 'cat-1', storeId: 'store-1', nome: 'Receitas', tipo: 'RECEITA' }],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: 'MA==',
        endCursor: 'MA==',
      },
      totalCount: 1,
      diagnostics: [],
    }
    buildConnection.mockResolvedValue(connection)
    diagnoseEntityQuery.mockResolvedValue([])

    const result = await contaAzulCategories(
      {},
      { where: { tipo: { _eq: 'RECEITA' } }, first: 10 }
    )

    expect(buildConnection).toHaveBeenCalledWith(
      expect.anything(),
      { where: { tipo: { _eq: 'RECEITA' } }, first: 10 },
      { id: 1 }
    )
    expect(result).toEqual(connection)
    expect(diagnoseEntityQuery).not.toHaveBeenCalled()
  })

  it('GivenEmptyConnection_WhenQueryingCategories_ThenAttachesDiagnostics', async () => {
    const connection = {
      edges: [],
      nodes: [],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
      totalCount: 0,
      diagnostics: [],
    }
    const diagnostics = [
      {
        code: 'TOKEN_MISSING',
        message: 'No token',
        hint: 'Re-auth',
        storeId: 'butanta',
      },
    ]
    buildConnection.mockResolvedValue(connection)
    diagnoseEntityQuery.mockResolvedValue(diagnostics)

    const result = await contaAzulCategories(
      {},
      { where: { storeId: { _eq: 'butanta' } } },
      createTestContext()
    )

    expect(diagnoseEntityQuery).toHaveBeenCalled()
    expect(result.diagnostics).toEqual(diagnostics)
  })

  it('GivenMongoThrows_WhenQueryingCategories_ThenPropagatesError', async () => {
    buildConnection.mockRejectedValue(new Error('MongoDB query failed'))

    await expect(contaAzulCategories({}, {})).rejects.toThrow('MongoDB query failed')
  })

  it('GivenCacheDirective_WhenQueryingCategories_ThenCallsEnsureFreshCacheFirst', async () => {
    buildConnection.mockResolvedValue({
      edges: [],
      nodes: [],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
      totalCount: 0,
      diagnostics: [],
    })
    diagnoseEntityQuery.mockResolvedValue([])

    await contaAzulCategoriesCached(
      {},
      { where: { storeId: { _eq: 'store-1' } } },
      createTestContext({ storeId: 'store-1' })
    )

    expect(ensureFreshCache).toHaveBeenCalled()
    expect(buildConnection).toHaveBeenCalled()
    expect(ensureFreshCache.mock.invocationCallOrder[0]).toBeLessThan(
      buildConnection.mock.invocationCallOrder[0]!
    )
  })

  it('GivenNoCacheDirective_WhenQueryingCategories_ThenSkipsEnsureFreshCache', async () => {
    buildConnection.mockResolvedValue({
      edges: [],
      nodes: [],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
      totalCount: 1,
      diagnostics: [],
    })

    await contaAzulCategories({}, { where: { storeId: { _eq: 'store-1' } } })

    expect(ensureFreshCache).not.toHaveBeenCalled()
  })
})
