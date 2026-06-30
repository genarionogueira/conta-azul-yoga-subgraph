import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Db } from 'mongodb'
import { CategorySyncService } from '../../src/lib/category-sync/category-sync-service.js'
import type { SyncEventPublisher } from '../../src/lib/category-sync/sync-event-publisher.js'
import type { TenantTokenStore } from '../../src/lib/credentials/tenant-token-store.js'
import { TokenNotFoundError } from '../../src/lib/credentials/tenant-token-store.js'

vi.mock('../../src/lib/conta-azul-client.js', () => ({
  createContaAzulClient: vi.fn(() => ({
    listCategorias: vi.fn().mockResolvedValue([{ id: '1', nome: 'Cat A', tipo: 'RECEITA' }]),
  })),
}))

describe('CategorySyncService', () => {
  let tokenStore: TenantTokenStore
  let redis: { scan: ReturnType<typeof vi.fn>; zrange: ReturnType<typeof vi.fn> }
  let db: Db
  let publisher: SyncEventPublisher
  let service: CategorySyncService

  beforeEach(() => {
    tokenStore = {
      ensureFreshToken: vi.fn(),
      deleteConnection: vi.fn(),
      listConnectedStoreIds: vi.fn(),
    } as unknown as TenantTokenStore

    redis = {
      scan: vi.fn().mockResolvedValue(['0', ['conta_azul:connected_stores:tenant-1']]),
      zrange: vi.fn().mockResolvedValue(['store-1']),
    }

    const collection = {
      find: vi.fn().mockReturnValue({
        limit: () => ({
          toArray: async () => [],
        }),
      }),
      insertOne: vi.fn(),
      updateOne: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    }

    db = {
      collection: vi.fn().mockReturnValue(collection),
    } as unknown as Db

    publisher = { publish: vi.fn() }

    service = new CategorySyncService(
      tokenStore,
      redis as never,
      () => db,
      publisher
    )
  })

  it('GivenMissingToken_WhenSyncStore_ThenReturnsTokenNotFound', async () => {
    vi.mocked(tokenStore.ensureFreshToken).mockRejectedValue(
      new TokenNotFoundError('missing')
    )

    const result = await service.syncStore('tenant-1', 'store-1', 'manual')

    expect(result.errors).toEqual(['token_not_found'])
    expect(publisher.publish).not.toHaveBeenCalled()
  })

  it('GivenMissingToken_WhenReconcileStore_ThenReturnsSkipped', async () => {
    vi.mocked(tokenStore.ensureFreshToken).mockRejectedValue(
      new TokenNotFoundError('missing')
    )

    const result = await service.reconcileStore('tenant-1', 'store-1', 'manual')

    expect(result.status).toBe('skipped')
    expect(result.skippedCount).toBe(1)
  })

  it('GivenConnectedStore_WhenDisconnectStoreData_ThenDeletesCategoriesOnly', async () => {
    service = new CategorySyncService(tokenStore, redis as never, () => db, publisher)

    vi.mocked(db.collection).mockReturnValue({
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 2 }),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    } as never)

    const result = await service.disconnectStoreData('tenant-1', 'store-1')

    expect(result.deleted).toBe(2)
    expect(tokenStore.deleteConnection).not.toHaveBeenCalled()
  })
})
