import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeSyncResolver } from '../../src/lib/entity/resolvers.js'
import type { EntityDef } from '../../src/lib/entity/types.js'

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

const syncToMongo = vi.fn()
const writeMeta = vi.fn()
const getRestAdapter = vi.fn()

vi.mock('../../src/lib/mongo/connection.js', () => ({
  getDb: vi.fn(() => ({ collection: vi.fn() })),
}))

vi.mock('../../src/lib/sync/service.js', () => ({
  syncToMongo: (...args: unknown[]) => syncToMongo(...args),
}))

vi.mock('../../src/lib/cache/index.js', () => ({
  metaKey: (collection: string, storeId: string) => `${collection}:${storeId}`,
  parseTtl: () => 86_400_000,
  writeMeta: (...args: unknown[]) => writeMeta(...args),
  ensureFreshCache: vi.fn(),
  logCache: vi.fn(),
}))

vi.mock('../../src/lib/entity/adapters.js', () => ({
  getRestAdapter: (...args: unknown[]) => getRestAdapter(...args),
}))

describe('makeSyncResolver cache meta', () => {
  const syncResolver = makeSyncResolver(categoryEntity)

  beforeEach(() => {
    vi.clearAllMocks()
    writeMeta.mockResolvedValue(new Date())
    syncToMongo.mockResolvedValue({ status: 'success', syncedCount: 2, syncedAt: '' })
    getRestAdapter.mockReturnValue({
      listConnectedStoreIds: vi.fn().mockResolvedValue(['store-1']),
      getClientForStore: vi.fn().mockResolvedValue({
        listCategorias: vi.fn().mockResolvedValue([]),
      }),
    })
  })

  it('GivenSyncSuccessWithCache_WhenSyncing_ThenWritesMeta', async () => {
    await syncResolver({}, { storeId: 'store-1' })
    expect(writeMeta).toHaveBeenCalledWith(
      'conta_azul_categories:store-1',
      86_400_000,
      expect.anything()
    )
  })

  it('GivenSyncError_WhenSyncing_ThenDoesNotWriteMeta', async () => {
    syncToMongo.mockResolvedValue({
      status: 'error',
      syncedCount: 0,
      syncedAt: '',
      errorMessage: 'fail',
    })
    await syncResolver({}, { storeId: 'store-1' })
    expect(writeMeta).not.toHaveBeenCalled()
  })

  it('GivenNoCacheDirective_WhenSyncing_ThenDoesNotWriteMeta', async () => {
    const noCache = makeSyncResolver({ ...categoryEntity, cache: null })
    await noCache({}, { storeId: 'store-1' })
    expect(writeMeta).not.toHaveBeenCalled()
  })
})
