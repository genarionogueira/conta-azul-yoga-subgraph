import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ensureFreshCache } from '../../../src/lib/cache/ensure-fresh.js'
import { globalSingleflight } from '../../../src/lib/cache/singleflight.js'
import type { EntityDef } from '../../../src/lib/entity/types.js'
import type { Db } from 'mongodb'

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
  cache: { ttl: '24h' },
  key: { fields: 'id storeId' },
}

/** Non-worker-owned entity for cache refresh behavior tests. */
const cachedSalesEntity: EntityDef = {
  ...categoryEntity,
  name: 'ContaAzulSale',
  mongo: { collection: 'conta_azul_sales' },
  rest: { adapter: 'contaAzul', list: 'listVendas' },
  cache: { ttl: '24h' },
}

const isFresh = vi.fn()
const writeMeta = vi.fn()
const syncToMongo = vi.fn()
const getRestAdapter = vi.fn()
const listVendas = vi.fn()

vi.mock('../../../src/lib/cache/meta.js', () => ({
  metaKey: (collection: string, storeId: string) => `${collection}:${storeId}`,
  isFresh: (...args: unknown[]) => isFresh(...args),
  writeMeta: (...args: unknown[]) => writeMeta(...args),
}))

vi.mock('../../../src/lib/sync/service.js', () => ({
  syncToMongo: (...args: unknown[]) => syncToMongo(...args),
}))

vi.mock('../../../src/lib/entity/adapters.js', () => ({
  getRestAdapter: (...args: unknown[]) => getRestAdapter(...args),
}))

vi.mock('../../../src/lib/cache/logger.js', () => ({
  logCache: vi.fn(),
}))

function createDb(): Db {
  return { collection: vi.fn() } as unknown as Db
}

const tenantId = 'dev-tenant'

describe('ensureFreshCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalSingleflight.clearForTests()
    isFresh.mockResolvedValue(false)
    writeMeta.mockResolvedValue(new Date('2026-06-15T00:00:00.000Z'))
    syncToMongo.mockResolvedValue({ status: 'success', syncedCount: 2, syncedAt: '' })
    listVendas.mockResolvedValue([
      { id: 'sale-1', nome: 'A', tipo: 'RECEITA' },
      { id: 'sale-2', nome: 'B', tipo: 'DESPESA' },
    ])
    getRestAdapter.mockReturnValue({
      listConnectedStoreIds: vi.fn().mockResolvedValue(['store-1']),
      getClientForStore: vi.fn().mockResolvedValue({ listVendas }),
    })
  })

  it('GivenWorkerOwnedCollection_WhenEnsuringFresh_ThenSkipsApiAndSync', async () => {
    await ensureFreshCache(categoryEntity, { tenantId, storeIds: ['store-1'], db: createDb() })
    expect(getRestAdapter).not.toHaveBeenCalled()
    expect(syncToMongo).not.toHaveBeenCalled()
  })

  it('GivenNoCacheDirective_WhenEnsuringFresh_ThenNoAdapterCalls', async () => {
    const entity = { ...categoryEntity, cache: null }
    await ensureFreshCache(entity, { tenantId, storeIds: ['store-1'], db: createDb() })
    expect(getRestAdapter).not.toHaveBeenCalled()
    expect(syncToMongo).not.toHaveBeenCalled()
  })

  it('GivenNoRestAdapter_WhenEnsuringFresh_ThenNoSync', async () => {
    const entity = { ...categoryEntity, rest: null }
    await ensureFreshCache(entity, { tenantId, storeIds: ['store-1'], db: createDb() })
    expect(syncToMongo).not.toHaveBeenCalled()
  })

  it('GivenFreshMeta_WhenEnsuringFresh_ThenSkipsApiAndSync', async () => {
    isFresh.mockResolvedValue(true)
    await ensureFreshCache(cachedSalesEntity, { tenantId, storeIds: ['store-1'], db: createDb() })
    expect(listVendas).not.toHaveBeenCalled()
    expect(syncToMongo).not.toHaveBeenCalled()
    expect(writeMeta).not.toHaveBeenCalled()
  })

  it('GivenStaleMeta_WhenEnsuringFresh_ThenFetchesSyncsAndWritesMeta', async () => {
    await ensureFreshCache(cachedSalesEntity, { tenantId, storeIds: ['store-1'], db: createDb() })
    expect(listVendas).toHaveBeenCalled()
    expect(syncToMongo).toHaveBeenCalled()
    expect(writeMeta).toHaveBeenCalledWith(
      'conta_azul_sales:store-1',
      86_400_000,
      expect.anything()
    )
  })

  it('GivenNoToken_WhenEnsuringFresh_ThenDoesNotWriteMeta', async () => {
    getRestAdapter.mockReturnValue({
      listConnectedStoreIds: vi.fn().mockResolvedValue(['store-1']),
      getClientForStore: vi.fn().mockResolvedValue(undefined),
    })
    await ensureFreshCache(cachedSalesEntity, { tenantId, storeIds: ['store-1'], db: createDb() })
    expect(syncToMongo).not.toHaveBeenCalled()
    expect(writeMeta).not.toHaveBeenCalled()
  })

  it('GivenMissingFetcher_WhenEnsuringFresh_ThenDoesNotWriteMeta', async () => {
    getRestAdapter.mockReturnValue({
      listConnectedStoreIds: vi.fn().mockResolvedValue(['store-1']),
      getClientForStore: vi.fn().mockResolvedValue({}),
    })
    await ensureFreshCache(cachedSalesEntity, { tenantId, storeIds: ['store-1'], db: createDb() })
    expect(syncToMongo).not.toHaveBeenCalled()
    expect(writeMeta).not.toHaveBeenCalled()
  })

  it('GivenSyncError_WhenEnsuringFresh_ThenDoesNotWriteMeta', async () => {
    syncToMongo.mockResolvedValue({
      status: 'error',
      syncedCount: 0,
      syncedAt: '',
      errorMessage: 'sync failed',
    })
    await ensureFreshCache(cachedSalesEntity, { tenantId, storeIds: ['store-1'], db: createDb() })
    expect(writeMeta).not.toHaveBeenCalled()
  })

  it('GivenApiThrows_WhenEnsuringFresh_ThenDoesNotThrowOrWriteMeta', async () => {
    listVendas.mockRejectedValue(new Error('API down'))
    await expect(
      ensureFreshCache(cachedSalesEntity, { storeIds: ['store-1'], db: createDb() })
    ).resolves.toBeUndefined()
    expect(writeMeta).not.toHaveBeenCalled()
  })

  it('GivenEmptyItems_WhenEnsuringFresh_ThenWritesMetaWithZeroCount', async () => {
    listVendas.mockResolvedValue([])
    syncToMongo.mockResolvedValue({ status: 'success', syncedCount: 0, syncedAt: '' })
    await ensureFreshCache(cachedSalesEntity, { tenantId, storeIds: ['store-1'], db: createDb() })
    expect(writeMeta).toHaveBeenCalled()
  })

  it('GivenTwoStaleStores_WhenEnsuringFresh_ThenRefreshesBoth', async () => {
    await ensureFreshCache(cachedSalesEntity, {
      tenantId,
      storeIds: ['store-1', 'store-2'],
      db: createDb(),
    })
    expect(syncToMongo).toHaveBeenCalledTimes(2)
    expect(writeMeta).toHaveBeenCalledTimes(2)
  })

  it('GivenNoStoreIds_WhenEnsuringFresh_ThenUsesAdapterListConnected', async () => {
    await ensureFreshCache(cachedSalesEntity, { tenantId, storeIds: [], db: createDb() })
    expect(getRestAdapter).toHaveBeenCalledWith('contaAzul')
    expect(syncToMongo).toHaveBeenCalled()
  })

  it('GivenConcurrentStaleSameStore_WhenEnsuringFresh_ThenSingleApiCall', async () => {
    let resolveFetch: ((value: unknown[]) => void) | undefined
    listVendas.mockImplementation(
      () =>
        new Promise<unknown[]>((resolve) => {
          resolveFetch = resolve
        })
    )
    const db = createDb()
    const p1 = ensureFreshCache(cachedSalesEntity, { tenantId, storeIds: ['store-1'], db })
    const p2 = ensureFreshCache(cachedSalesEntity, { tenantId, storeIds: ['store-1'], db })

    for (let i = 0; i < 50 && resolveFetch === undefined; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    resolveFetch?.([{ id: 'a', nome: 'A', tipo: 'RECEITA' }])
    await Promise.all([p1, p2])
    expect(listVendas).toHaveBeenCalledTimes(1)
  }, 10_000)
})
