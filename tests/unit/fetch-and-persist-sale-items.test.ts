import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GraphQLError } from 'graphql'
import { WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import { createTestContext } from '../helpers/test-context.js'
import { ContaAzulRateLimitError } from '../../src/lib/conta-azul-api/errors.js'

const mockFetchVendaItens = vi.fn()
const mockPersistToCollection = vi.fn()
const mockMarkSaleItemsSynced = vi.fn()
const mockFindOne = vi.fn()

vi.mock('../../src/lib/rest-fetch/index.js', () => ({
  restFetchService: {
    fetchVendaItens: (...args: unknown[]) => mockFetchVendaItens(...args),
  },
}))

vi.mock('../../src/lib/mongo/connection.js', () => ({
  getDb: () => ({
    collection: () => ({
      findOne: (...args: unknown[]) => mockFindOne(...args),
    }),
  }),
}))

vi.mock('../../src/lib/persist/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/persist/index.js')>()
  return {
    ...actual,
    persistToCollection: (...args: unknown[]) => mockPersistToCollection(...args),
  }
})

vi.mock('../../src/lib/sale-sync/changed-sales.js', () => ({
  markSaleItemsSynced: (...args: unknown[]) => mockMarkSaleItemsSynced(...args),
}))

const { fetchAndPersistSaleItems } = await import(
  '../../src/schema/persist/resolvers/Mutation/persistMutations.js'
)

describe('fetchAndPersistSaleItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchVendaItens.mockResolvedValue({
      storeId: 'store-1',
      fetchedAt: '2026-01-01T00:00:00.000Z',
      items: [
        {
          id: 'line-1',
          id_item: 'prod-1',
          nome: 'Item',
          tipo: 'PRODUTO',
          quantidade: 1,
          valor: 10,
        },
      ],
    })
    mockPersistToCollection.mockResolvedValue({ synced: 1, deleted: 0, errors: [] })
    mockFindOne.mockResolvedValue({ dataAlteracao: '2026-01-15T10:00:00Z' })
    mockMarkSaleItemsSynced.mockResolvedValue(undefined)
  })

  it('GivenValidSale_WhenMutation_ThenPersistedAndMarkedSynced', async () => {
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    const result = await fetchAndPersistSaleItems(
      null,
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        saleId: 'sale-1',
        mode: 'RECONCILE',
        trigger: 'worker',
      },
      context
    )

    expect(result.synced).toBe(1)
    expect(result.saleId).toBe('sale-1')
    expect(mockPersistToCollection).toHaveBeenCalled()
    expect(mockMarkSaleItemsSynced).toHaveBeenCalledWith(
      expect.anything(),
      'sales',
      'tenant-1',
      'store-1',
      'sale-1',
      '2026-01-15T10:00:00Z'
    )
  })

  it('GivenRateLimitedFetch_WhenMutation_ThenThrowsRATE_LIMITED', async () => {
    mockFetchVendaItens.mockRejectedValue(new ContaAzulRateLimitError(750))
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })

    await expect(
      fetchAndPersistSaleItems(
        null,
        {
          tenantId: 'tenant-1',
          storeId: 'store-1',
          saleId: 'sale-1',
        },
        context
      )
    ).rejects.toMatchObject({
      message: 'RATE_LIMITED',
      extensions: { code: 'RATE_LIMITED', retryAfterMs: 750 },
    } satisfies Partial<GraphQLError>)
  })

  it('GivenEmptyItems_WhenMutation_ThenSyncedZeroNoCrash', async () => {
    mockFetchVendaItens.mockResolvedValue({
      storeId: 'store-1',
      fetchedAt: '2026-01-01T00:00:00.000Z',
      items: [],
    })
    mockPersistToCollection.mockResolvedValue({ synced: 0, deleted: 0, errors: [] })
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })

    const result = await fetchAndPersistSaleItems(
      null,
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        saleId: 'sale-1',
      },
      context
    )

    expect(result.synced).toBe(0)
    expect(mockMarkSaleItemsSynced).toHaveBeenCalled()
  })
})
