import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockEnsureFreshToken = vi.fn()

vi.mock('ioredis', () => ({
  Redis: vi.fn(),
}))

vi.mock('../../src/lib/token-resolver.js', () => ({
  TokenResolver: vi.fn(() => ({
    ensureFreshToken: mockEnsureFreshToken,
  })),
  TokenNotFoundError: class TokenNotFoundError extends Error {},
  TokenRefreshError: class TokenRefreshError extends Error {},
}))

const { buildContext } = await import('../../src/context.js')

function createRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/graphql', {
    method: 'POST',
    headers,
  })
}

describe('buildContext', () => {
  beforeEach(() => {
    mockEnsureFreshToken.mockReset()
  })

  it('GivenRequestWithStoreIdHeader_WhenBuildingContext_ThenStoreIdIsExtracted', async () => {
    mockEnsureFreshToken.mockResolvedValue({
      access_token: 'token',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3_600_000,
    })

    const context = await buildContext({
      request: createRequest({ 'x-store-id': 'store-1' }),
    } as import('graphql-yoga').YogaInitialContext)

    expect(context.storeId).toBe('store-1')
  })

  it('GivenRequestWithNoStoreIdHeader_WhenBuildingContext_ThenStoreIdIsUndefined', async () => {
    const context = await buildContext({
      request: createRequest(),
    } as import('graphql-yoga').YogaInitialContext)

    expect(context.storeId).toBeUndefined()
    expect(context.contaAzulClient).toBeUndefined()
    expect(mockEnsureFreshToken).not.toHaveBeenCalled()
  })

  it('GivenValidStoreId_WhenBuildingContext_ThenContaAzulClientIsDefined', async () => {
    mockEnsureFreshToken.mockResolvedValue({
      access_token: 'token',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3_600_000,
    })

    const context = await buildContext({
      request: createRequest({ 'x-store-id': 'store-1' }),
    } as import('graphql-yoga').YogaInitialContext)

    expect(context.contaAzulClient).toBeDefined()
    expect(context.contaAzulClient?.listCategorias).toBeTypeOf('function')
  })

  it('GivenMissingToken_WhenBuildingContext_ThenContaAzulClientIsUndefined', async () => {
    mockEnsureFreshToken.mockRejectedValue(new Error('No token for store store-unknown'))

    const context = await buildContext({
      request: createRequest({ 'x-store-id': 'store-unknown' }),
    } as import('graphql-yoga').YogaInitialContext)

    expect(context.storeId).toBe('store-unknown')
    expect(context.contaAzulClient).toBeUndefined()
  })
})
