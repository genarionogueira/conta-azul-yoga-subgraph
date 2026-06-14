import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractStoreIdsFromWhere } from '../../src/lib/diagnostics/extract-store-ids.js'
import { diagnoseCategoryQuery } from '../../src/lib/diagnostics/category-query.js'
import { CategoryQueryDiagnosticCode } from '../../src/lib/diagnostics/types.js'
import type { TokenResolver } from '../../src/lib/token-resolver.js'

describe('extractStoreIdsFromWhere', () => {
  it('GivenStoreIdEq_WhenExtracting_ThenReturnsSingleId', () => {
    expect(extractStoreIdsFromWhere({ storeId: { _eq: 'butanta' } })).toEqual(['butanta'])
  })

  it('GivenStoreIdIn_WhenExtracting_ThenReturnsAllIds', () => {
    expect(
      extractStoreIdsFromWhere({ storeId: { _in: ['butanta', 'sto-amaro'] } })
    ).toEqual(['butanta', 'sto-amaro'])
  })

  it('GivenEmptyStoreIdComparison_WhenExtracting_ThenReturnsEmpty', () => {
    expect(extractStoreIdsFromWhere({ storeId: {} })).toEqual([])
  })

  it('GivenAndWithStoreId_WhenExtracting_ThenReturnsNestedId', () => {
    expect(
      extractStoreIdsFromWhere({
        _and: [{ storeId: { _eq: 'butanta' } }, { tipo: { _eq: 'RECEITA' } }],
      })
    ).toEqual(['butanta'])
  })
})

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

describe('diagnoseCategoryQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GivenRegisteredStoreWithoutToken_WhenDiagnosing_ThenReturnsTokenMissing', async () => {
    const tokenResolver = createTokenResolverMock({
      isStoreRegistered: vi.fn().mockResolvedValue(true),
      getToken: vi.fn().mockResolvedValue(null),
    })

    const diagnostics = await diagnoseCategoryQuery({
      where: { storeId: { _eq: 'butanta' } },
      tokenResolver,
      db: createDbMock({}) as never,
    })

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.code).toBe(CategoryQueryDiagnosticCode.TOKEN_MISSING)
    expect(diagnostics[0]?.storeId).toBe('butanta')
    expect(diagnostics[0]?.hint).toContain('syncContaAzulCategories')
  })

  it('GivenTokenWithoutMongoData_WhenDiagnosing_ThenReturnsDataNotSynced', async () => {
    const tokenResolver = createTokenResolverMock({
      isStoreRegistered: vi.fn().mockResolvedValue(true),
      getToken: vi.fn().mockResolvedValue({
        access_token: 'x',
        refresh_token: 'y',
        expires_at: Date.now() + 3600_000,
      }),
    })

    const diagnostics = await diagnoseCategoryQuery({
      where: { storeId: { _eq: 'butanta' } },
      tokenResolver,
      db: createDbMock({ butanta: 0 }) as never,
    })

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.code).toBe(CategoryQueryDiagnosticCode.DATA_NOT_SYNCED)
  })

  it('GivenUnregisteredStore_WhenDiagnosing_ThenReturnsStoreNotConnected', async () => {
    const tokenResolver = createTokenResolverMock({
      isStoreRegistered: vi.fn().mockResolvedValue(false),
      getToken: vi.fn().mockResolvedValue(null),
    })

    const diagnostics = await diagnoseCategoryQuery({
      where: { storeId: { _eq: 'unknown' } },
      tokenResolver,
      db: createDbMock({}) as never,
    })

    expect(diagnostics[0]?.code).toBe(CategoryQueryDiagnosticCode.STORE_NOT_CONNECTED)
  })

  it('GivenNoStoresInRedis_WhenUnscopedQuery_ThenReturnsNoConnectedStores', async () => {
    const tokenResolver = createTokenResolverMock()

    const diagnostics = await diagnoseCategoryQuery({
      where: null,
      tokenResolver,
      db: createDbMock({}) as never,
    })

    expect(diagnostics[0]?.code).toBe(CategoryQueryDiagnosticCode.NO_CONNECTED_STORES)
  })

  it('GivenRedisPingFails_WhenDiagnosing_ThenReturnsRedisUnavailable', async () => {
    const tokenResolver = createTokenResolverMock({
      ping: vi.fn().mockRejectedValue(new Error('connection refused')),
    })

    const diagnostics = await diagnoseCategoryQuery({
      where: { storeId: { _eq: 'butanta' } },
      tokenResolver,
      db: createDbMock({}) as never,
    })

    expect(diagnostics[0]?.code).toBe(CategoryQueryDiagnosticCode.REDIS_UNAVAILABLE)
  })

  it('GivenMongoHasDataForStore_WhenDiagnosing_ThenReturnsEmptyDiagnostics', async () => {
    const tokenResolver = createTokenResolverMock({
      isStoreRegistered: vi.fn().mockResolvedValue(true),
      getToken: vi.fn().mockResolvedValue({
        access_token: 'x',
        refresh_token: 'y',
        expires_at: Date.now() + 3600_000,
      }),
    })

    const diagnostics = await diagnoseCategoryQuery({
      where: { storeId: { _eq: 'butanta' } },
      tokenResolver,
      db: createDbMock({ butanta: 5 }) as never,
    })

    expect(diagnostics).toHaveLength(0)
  })
})
