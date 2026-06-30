import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GraphQLError } from 'graphql'
import { WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import { createTestContext } from '../helpers/test-context.js'

const mockFetchVendaBusca = vi.fn()
const mockFetchVendaItens = vi.fn()
const mockFetchVendaVendedores = vi.fn()

vi.mock('../../src/lib/rest-fetch/index.js', () => ({
  restFetchService: {
    fetchVendaBusca: (...args: unknown[]) => mockFetchVendaBusca(...args),
    fetchVendaItens: (...args: unknown[]) => mockFetchVendaItens(...args),
    fetchVendaVendedores: (...args: unknown[]) => mockFetchVendaVendedores(...args),
  },
}))

const {
  contaAzulRestVendaBusca,
  contaAzulRestVendaItens,
  contaAzulRestVendaVendedores,
} = await import('../../src/schema/rest/resolvers/Query/restFetchQueries.js')

describe('rest fetch resolvers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchVendaBusca.mockResolvedValue({
      storeId: 'store-1',
      fetchedAt: '2026-01-01T00:00:00.000Z',
      items: [{ id: 'sale-1' }],
    })
    mockFetchVendaItens.mockResolvedValue({
      storeId: 'store-1',
      fetchedAt: '2026-01-01T00:00:00.000Z',
      items: [{ id: 'line-1' }],
    })
    mockFetchVendaVendedores.mockResolvedValue({
      storeId: 'store-1',
      fetchedAt: '2026-01-01T00:00:00.000Z',
      items: [{ id: 'vend-1' }],
    })
  })

  it('GivenWorkerAuth_WhenFetchingVendas_ThenReturnsItems', async () => {
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    const result = await contaAzulRestVendaBusca(
      null,
      { tenantId: 'tenant-1', storeId: 'store-1' },
      context
    )
    expect(result.items).toEqual([{ id: 'sale-1' }])
    expect(mockFetchVendaBusca).toHaveBeenCalledWith('tenant-1', 'store-1', undefined, undefined)
  })

  it('GivenNonWorkerAuth_WhenFetchingVendas_ThenForbidden', async () => {
    const context = createTestContext({ authClaims: { sub: 'user-1' } })
    await expect(
      contaAzulRestVendaBusca(null, { tenantId: 'tenant-1', storeId: 'store-1' }, context)
    ).rejects.toThrow(GraphQLError)
  })

  it('GivenWorkerAuth_WhenFetchingItensAndVendedores_ThenDelegatesToService', async () => {
    const context = createTestContext({ authClaims: { sub: WORKER_JWT_SUBJECT } })
    await contaAzulRestVendaItens(
      null,
      { tenantId: 'tenant-1', storeId: 'store-1', saleId: 'sale-1' },
      context
    )
    await contaAzulRestVendaVendedores(null, { tenantId: 'tenant-1', storeId: 'store-1' }, context)
    expect(mockFetchVendaItens).toHaveBeenCalled()
    expect(mockFetchVendaVendedores).toHaveBeenCalled()
  })
})
