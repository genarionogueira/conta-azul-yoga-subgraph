import { describe, it, expect, vi, beforeEach } from 'vitest'
import { diagnoseEntityQuery } from '../../src/lib/diagnostics/generic-query.js'
import { CategoryQueryDiagnosticCode } from '../../src/lib/diagnostics/types.js'
import type { EntityDef } from '../../src/lib/entity/types.js'
import type { TokenResolver } from '../../src/lib/token-resolver.js'

const categoryEntity: EntityDef = {
  name: 'ContaAzulCategory',
  fields: [
    { name: 'id', type: 'ID', nullable: false },
    { name: 'storeId', type: 'ID', nullable: false },
  ],
  mongo: { collection: 'conta_azul_categories' },
  rest: { adapter: 'contaAzul', list: 'listCategorias' },
  tenant: { field: 'storeId' },
  cache: null,
  key: null,
}

function createTokenResolverMock(
  overrides: Partial<TokenResolver> = {}
): TokenResolver {
  return {
    ping: vi.fn().mockResolvedValue(undefined),
    getToken: vi.fn().mockResolvedValue(null),
    isStoreRegistered: vi.fn().mockResolvedValue(false),
    listRegisteredStoreIds: vi.fn().mockResolvedValue([]),
    listConnectedStoreIds: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as TokenResolver
}

function createDbMock(countForStore: Record<string, number>) {
  return {
    collection: () => ({
      find: () => ({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              toArray: async () => [],
            }),
          }),
        }),
      }),
      countDocuments: async (filter: Record<string, unknown>) => {
        const storeFilter = filter.storeId as { $eq?: string } | undefined
        if (storeFilter?.$eq) {
          return countForStore[storeFilter.$eq] ?? 0
        }
        return 0
      },
      aggregate: () => ({ toArray: async () => [] }),
    }),
  }
}

describe('diagnoseEntityQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GivenNoConnectedStores_WhenDiagnosing_ThenReturnsNoConnectedStoresDiagnostic', async () => {
    const diagnostics = await diagnoseEntityQuery({
      entity: categoryEntity,
      tokenResolver: createTokenResolverMock(),
      db: createDbMock({}) as never,
      syncMutationName: 'syncContaAzulCategories',
    })
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].code).toBe(CategoryQueryDiagnosticCode.NO_CONNECTED_STORES)
  })

  it('GivenStoreWithToken_AndDataSynced_WhenDiagnosing_ThenReturnsEmptyDiagnostics', async () => {
    const diagnostics = await diagnoseEntityQuery({
      entity: categoryEntity,
      where: { storeId: { _eq: 'store-1' } },
      tokenResolver: createTokenResolverMock({
        getToken: vi.fn().mockResolvedValue({ access_token: 'tok' }),
      }),
      db: createDbMock({ 'store-1': 3 }) as never,
      syncMutationName: 'syncContaAzulCategories',
    })
    expect(diagnostics).toHaveLength(0)
  })

  it('GivenStoreWithToken_AndDataNotSynced_WhenDiagnosing_ThenReturnsDataNotSyncedDiagnostic', async () => {
    const diagnostics = await diagnoseEntityQuery({
      entity: categoryEntity,
      where: { storeId: { _eq: 'store-1' } },
      tokenResolver: createTokenResolverMock({
        getToken: vi.fn().mockResolvedValue({ access_token: 'tok' }),
      }),
      db: createDbMock({}) as never,
      syncMutationName: 'syncContaAzulCategories',
    })
    expect(diagnostics[0].code).toBe(CategoryQueryDiagnosticCode.DATA_NOT_SYNCED)
  })

  it('GivenRedisUnavailable_WhenDiagnosing_ThenReturnsRedisUnavailableDiagnostic', async () => {
    const diagnostics = await diagnoseEntityQuery({
      entity: categoryEntity,
      tokenResolver: createTokenResolverMock({
        ping: vi.fn().mockRejectedValue(new Error('redis down')),
      }),
      db: createDbMock({}) as never,
      syncMutationName: 'syncContaAzulCategories',
    })
    expect(diagnostics[0].code).toBe(CategoryQueryDiagnosticCode.REDIS_UNAVAILABLE)
  })

  it('GivenUnregisteredStore_WhenDiagnosing_ThenReturnsStoreNotConnectedDiagnostic', async () => {
    const diagnostics = await diagnoseEntityQuery({
      entity: categoryEntity,
      where: { storeId: { _eq: 'unknown' } },
      tokenResolver: createTokenResolverMock({
        getToken: vi.fn().mockResolvedValue(null),
        isStoreRegistered: vi.fn().mockResolvedValue(false),
      }),
      db: createDbMock({}) as never,
      syncMutationName: 'syncContaAzulCategories',
    })
    expect(diagnostics[0].code).toBe(CategoryQueryDiagnosticCode.STORE_NOT_CONNECTED)
  })
})
