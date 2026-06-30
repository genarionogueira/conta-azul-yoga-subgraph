import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Db } from 'mongodb'
import { SaleItemSyncService } from '../../src/lib/sale-item-sync/sale-item-sync-service.js'
import type { SyncEventPublisher } from '../../src/lib/category-sync/sync-event-publisher.js'
import type { TenantTokenStore } from '../../src/lib/credentials/tenant-token-store.js'
import { TokenNotFoundError } from '../../src/lib/credentials/tenant-token-store.js'

const mockListVendaItens = vi.fn()

vi.mock('../../src/lib/conta-azul-client.js', () => ({
  createContaAzulClient: vi.fn(() => ({
    listVendaItens: (...args: unknown[]) => mockListVendaItens(...args),
  })),
}))

describe('SaleItemSyncService', () => {
  let tokenStore: TenantTokenStore
  let redis: { scan: ReturnType<typeof vi.fn>; zrange: ReturnType<typeof vi.fn> }
  let db: Db
  let publisher: SyncEventPublisher
  let service: SaleItemSyncService

  beforeEach(() => {
    vi.clearAllMocks()
    mockListVendaItens.mockResolvedValue([
      {
        id: 'line-1',
        saleId: 'sale-1',
        nome: 'Widget',
        tipo: 'PRODUTO',
        quantidade: 1,
        valor: 10,
      },
    ])

    tokenStore = {
      ensureFreshToken: vi.fn().mockResolvedValue({
        access_token: 'token',
        refresh_token: 'refresh',
        expires_at: Date.now() + 3600_000,
        connected_at: Date.now(),
      }),
    } as unknown as TenantTokenStore

    redis = {
      scan: vi.fn().mockResolvedValue(['0', ['conta_azul:connected_stores:tenant-1']]),
      zrange: vi.fn().mockResolvedValue(['store-1']),
    }

    const collection = {
      find: vi.fn().mockReturnValue({
        limit: () => ({
          toArray: async () => [{ id: 'sale-1' }],
        }),
        toArray: async () => [],
      }),
      insertOne: vi.fn(),
      updateOne: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    }

    db = {
      collection: vi.fn().mockReturnValue(collection),
    } as unknown as Db

    publisher = { publish: vi.fn() }

    service = new SaleItemSyncService(tokenStore, redis as never, () => db, publisher)
  })

  it('GivenMissingToken_WhenSyncStore_ThenReturnsTokenNotFound', async () => {
    vi.mocked(tokenStore.ensureFreshToken).mockRejectedValue(
      new TokenNotFoundError('missing')
    )

    const result = await service.syncStore('tenant-1', 'store-1', 'manual')

    expect(result.errors).toEqual(['token_not_found'])
    expect(publisher.publish).not.toHaveBeenCalled()
  })

  it('GivenConnectedStore_WhenSyncStore_ThenFetchesItemsPerSale', async () => {
    const result = await service.syncStore('tenant-1', 'store-1', 'manual')

    expect(mockListVendaItens).toHaveBeenCalledWith('sale-1')
    expect(result.errors).toEqual([])
    expect(result.synced).toBeGreaterThanOrEqual(0)
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reconcile.sale_items.completed' })
    )
  })

  it('GivenConnectedStore_WhenDeleteStoreSaleItems_ThenDeletesDocs', async () => {
    vi.mocked(db.collection).mockReturnValue({
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 4 }),
    } as never)

    const deleted = await service.deleteStoreSaleItems('tenant-1', 'store-1')

    expect(deleted).toBe(4)
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'store.sale_items_deleted', tenantId: 'tenant-1' })
    )
  })
})
