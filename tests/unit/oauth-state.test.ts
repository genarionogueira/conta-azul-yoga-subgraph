import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OAuthStateStore } from '../../src/lib/oauth-state.js'

describe('OAuthStateStore', () => {
  const redis = {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  }

  beforeEach(() => {
    redis.set.mockReset()
    redis.get.mockReset()
    redis.del.mockReset()
  })

  it('GivenReturnUrl_WhenCreateState_ThenStoresJsonPayload', async () => {
    const store = new OAuthStateStore(redis as never)
    redis.set.mockResolvedValue('OK')

    const state = await store.createState('store-1', 'https://dev.avocado.tech/')

    expect(state).toMatch(/^[a-f0-9]{64}$/)
    expect(redis.set).toHaveBeenCalledWith(
      `conta_azul:oauth:state:${state}`,
      JSON.stringify({
        storeId: 'store-1',
        returnUrl: 'https://dev.avocado.tech/',
      }),
      'EX',
      600
    )
  })

  it('GivenLegacyPlainValue_WhenConsumeState_ThenReturnsStoreId', async () => {
    const store = new OAuthStateStore(redis as never)
    redis.get.mockResolvedValue('store-legacy')
    redis.del.mockResolvedValue(1)

    await expect(store.consumeState('state-1')).resolves.toEqual({
      storeId: 'store-legacy',
    })
  })
})
