import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OAuthStateStore } from '../../src/lib/oauth-state.js'

function createMockRedis() {
  return {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  }
}

describe('OAuthStateStore', () => {
  let redis: ReturnType<typeof createMockRedis>
  let store: OAuthStateStore

  beforeEach(() => {
    redis = createMockRedis()
    store = new OAuthStateStore(redis as unknown as import('ioredis').Redis)
  })

  it('GivenStoreId_WhenCreateState_ThenStoresWithTtlAndReturnsHexState', async () => {
    const state = await store.createState('store-1')

    expect(state).toMatch(/^[a-f0-9]{64}$/)
    expect(redis.set).toHaveBeenCalledWith(
      `conta_azul:oauth:state:${state}`,
      'store-1',
      'EX',
      600
    )
  })

  it('GivenExistingState_WhenConsumeState_ThenReturnsStoreIdAndDeletesKey', async () => {
    redis.get.mockResolvedValue('store-42')

    const storeId = await store.consumeState('abc123')

    expect(storeId).toBe('store-42')
    expect(redis.get).toHaveBeenCalledWith('conta_azul:oauth:state:abc123')
    expect(redis.del).toHaveBeenCalledWith('conta_azul:oauth:state:abc123')
  })

  it('GivenMissingState_WhenConsumeState_ThenReturnsNullWithoutDelete', async () => {
    redis.get.mockResolvedValue(null)

    const storeId = await store.consumeState('missing')

    expect(storeId).toBeNull()
    expect(redis.del).not.toHaveBeenCalled()
  })
})
