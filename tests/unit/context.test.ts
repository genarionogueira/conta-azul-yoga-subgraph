import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetClientForStore = vi.fn()

vi.mock('ioredis', () => ({
  Redis: vi.fn(),
}))

vi.mock('../../src/lib/credentials/index.js', () => ({
  connectionService: {
    getClientForStore: (...args: unknown[]) => mockGetClientForStore(...args),
    listConnectedStoreIds: vi.fn(),
  },
  tenantTokenStore: {},
}))

vi.mock('../../src/lib/auth/request-auth-store.js', () => ({
  getRequestAuthClaims: vi.fn(() => undefined),
}))

const { buildContext } = await import('../../src/context.js')
const { TEST_TENANT_ID } = await import('../helpers/test-context.js')

function createRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/graphql', {
    method: 'POST',
    headers,
  })
}

describe('buildContext', () => {
  beforeEach(() => {
    mockGetClientForStore.mockReset()
    process.env.JWT_REQUIRED = 'false'
  })

  it('GivenRequestWithStoreIdHeader_WhenBuildingContext_ThenStoreIdIsExtracted', async () => {
    mockGetClientForStore.mockResolvedValue({
      listCategorias: vi.fn(),
    })

    const context = await buildContext({
      request: createRequest({ 'x-store-id': 'store-1' }),
    } as import('graphql-yoga').YogaInitialContext)

    expect(context.storeId).toBe('store-1')
    expect(context.tenantId).toBe(TEST_TENANT_ID)
  })

  it('GivenRequestWithNoStoreIdHeader_WhenBuildingContext_ThenStoreIdIsUndefined', async () => {
    const context = await buildContext({
      request: createRequest(),
    } as import('graphql-yoga').YogaInitialContext)

    expect(context.storeId).toBeUndefined()
    expect(context.contaAzulClient).toBeUndefined()
    expect(mockGetClientForStore).not.toHaveBeenCalled()
  })

  it('GivenValidStoreId_WhenBuildingContext_ThenContaAzulClientIsDefined', async () => {
    mockGetClientForStore.mockResolvedValue({
      listCategorias: vi.fn(),
    })

    const context = await buildContext({
      request: createRequest({ 'x-store-id': 'store-1' }),
    } as import('graphql-yoga').YogaInitialContext)

    expect(context.contaAzulClient).toBeDefined()
    expect(context.contaAzulClient?.listCategorias).toBeTypeOf('function')
    expect(mockGetClientForStore).toHaveBeenCalledWith(TEST_TENANT_ID, 'store-1')
  })

  it('GivenMissingToken_WhenBuildingContext_ThenContaAzulClientIsUndefined', async () => {
    mockGetClientForStore.mockResolvedValue(undefined)

    const context = await buildContext({
      request: createRequest({ 'x-store-id': 'store-unknown' }),
    } as import('graphql-yoga').YogaInitialContext)

    expect(context.storeId).toBe('store-unknown')
    expect(context.contaAzulClient).toBeUndefined()
  })
})
