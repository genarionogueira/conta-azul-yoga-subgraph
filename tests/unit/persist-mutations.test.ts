import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GraphQLError } from 'graphql'
import { WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import { createTestContext } from '../helpers/test-context.js'

const mockPersistToCollection = vi.fn()

vi.mock('../../src/lib/mongo/connection.js', () => ({
  getDb: () => ({}),
}))

vi.mock('../../src/lib/persist/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/persist/index.js')>()
  return {
    ...actual,
    persistToCollection: (...args: unknown[]) => mockPersistToCollection(...args),
  }
})

const { persistSales, persistSaleItems, persistVendedores } = await import(
  '../../src/schema/persist/resolvers/Mutation/persistMutations.js'
)

describe('persist mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPersistToCollection.mockResolvedValue({ synced: 1, deleted: 0, errors: [] })
  })

  it('GivenWorkerAuth_WhenPersistSalesUpsert_ThenWritesSalesCollection', async () => {
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    const result = await persistSales(
      null,
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        documents: [{ id: 'sale-1', data: { tipo: 'VENDA' } }],
        mode: 'UPSERT',
      },
      context
    )

    expect(result.synced).toBe(1)
    expect(mockPersistToCollection).toHaveBeenCalledWith(
      expect.anything(),
      'sales',
      'tenant-1',
      'store-1',
      expect.any(Array),
      'UPSERT',
      { connectionId: undefined }
    )
  })

  it('GivenWorkerAuth_WhenPersistSaleItemsReconcile_ThenScopesBySaleId', async () => {
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    await persistSaleItems(
      null,
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        saleId: 'sale-1',
        documents: [{ id: 'line-1', data: { nome: 'Item' } }],
        mode: 'RECONCILE',
      },
      context
    )

    expect(mockPersistToCollection).toHaveBeenCalledWith(
      expect.anything(),
      'sale_items',
      'tenant-1',
      'store-1',
      expect.any(Array),
      'RECONCILE',
      { saleId: 'sale-1', connectionId: undefined }
    )
  })

  it('GivenInvalidDocumentData_WhenPersisting_ThenValidationError', async () => {
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    await expect(
      persistVendedores(
        null,
        {
          tenantId: 'tenant-1',
          storeId: 'store-1',
          documents: [{ id: 'vend-1', data: 'not-an-object' }],
        },
        context
      )
    ).rejects.toThrow(GraphQLError)
  })

  it('GivenNonWorkerAuth_WhenPersisting_ThenForbidden', async () => {
    const context = createTestContext({ authClaims: { sub: 'user-1' } })
    await expect(
      persistSales(
        null,
        {
          tenantId: 'tenant-1',
          storeId: 'store-1',
          documents: [{ id: 'sale-1', data: {} }],
        },
        context
      )
    ).rejects.toThrow(/worker authentication required/)
  })
})
