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

const { getRequestAuthClaims } = await import('../../src/lib/auth/request-auth-store.js')
const { buildContext } = await import('../../src/context.js')
const { TEST_TENANT_ID } = await import('../helpers/test-context.js')
const { WORKER_CONTEXT_TENANT_ID } = await import('../../src/lib/auth/tenant-context.js')
const { WORKER_JWT_SUBJECT } = await import('../../src/lib/auth/worker-auth.js')

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
    vi.mocked(getRequestAuthClaims).mockReturnValue(undefined)
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

  it('GivenWorkerJwtWithJwtRequired_WhenBuildingContext_ThenDoesNotThrow', async () => {
    process.env.JWT_REQUIRED = 'true'
    vi.mocked(getRequestAuthClaims).mockReturnValue({ sub: WORKER_JWT_SUBJECT })

    const context = await buildContext({
      request: createRequest(),
    } as import('graphql-yoga').YogaInitialContext)

    expect(context.tenantId).toBe(WORKER_CONTEXT_TENANT_ID)
  })

  it('GivenWorkerJwt_WhenBuildingContext_ThenTenantIdIsWorkerPlaceholder', async () => {
    process.env.JWT_REQUIRED = 'true'
    vi.mocked(getRequestAuthClaims).mockReturnValue({ sub: WORKER_JWT_SUBJECT })

    const context = await buildContext({
      request: createRequest(),
    } as import('graphql-yoga').YogaInitialContext)

    expect(context.tenantId).toBe(WORKER_CONTEXT_TENANT_ID)
    expect(context.contaAzulClient).toBeUndefined()
    expect(mockGetClientForStore).not.toHaveBeenCalled()
  })

  it('GivenNoClaimsWithJwtRequired_WhenBuildingContext_ThenThrowsTenantRequiredError', async () => {
    process.env.JWT_REQUIRED = 'true'
    vi.mocked(getRequestAuthClaims).mockReturnValue(undefined)

    await expect(
      buildContext({
        request: createRequest(),
      } as import('graphql-yoga').YogaInitialContext)
    ).rejects.toThrow('Unable to resolve tenant from JWT claims')
  })
})
