import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Db } from 'mongodb'
import { SaleSyncService } from '../../src/lib/sale-sync/sale-sync-service.js'
import type { SyncEventPublisher } from '../../src/lib/category-sync/sync-event-publisher.js'
import type { TenantTokenStore } from '../../src/lib/credentials/tenant-token-store.js'
import { TokenNotFoundError } from '../../src/lib/credentials/tenant-token-store.js'

vi.mock('../../src/lib/conta-azul-client.js', () => ({
  createContaAzulClient: vi.fn(() => ({
    listVendas: vi.fn().mockResolvedValue([
      { id: 'sale-1', numero: 1001, tipo: 'VENDA' },
    ]),
  })),
}))

describe('SaleSyncService', () => {
  let tokenStore: TenantTokenStore
  let redis: { scan: ReturnType<typeof vi.fn>; zrange: ReturnType<typeof vi.fn> }
  let db: Db
  let publisher: SyncEventPublisher
  let service: SaleSyncService

  beforeEach(() => {
    tokenStore = {
      ensureFreshToken: vi.fn().mockResolvedValue({
        access_token: 'token',
        refresh_token: 'refresh',
        expires_at: Date.now() + 3600_000,
        connected_at: Date.now(),
      }),
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

    service = new SaleSyncService(tokenStore, redis as never, () => db, publisher)
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

  it('GivenConnectedStore_WhenDeleteStoreSales_ThenDeletesSalesDocs', async () => {
    vi.mocked(db.collection).mockReturnValue({
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 3 }),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    } as never)

    const deleted = await service.deleteStoreSales('tenant-1', 'store-1')

    expect(deleted).toBe(3)
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'store.sales_deleted', tenantId: 'tenant-1' })
    )
  })
})
