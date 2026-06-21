import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OAuthStateStore } from '../../src/lib/oauth-state.js'
import { TEST_TENANT_ID } from '../helpers/test-context.js'

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

    const state = await store.createState(
      TEST_TENANT_ID,
      'store-1',
      'https://dev.avocado.tech/'
    )

    expect(state).toMatch(/^[a-f0-9]{64}$/)
    expect(redis.set).toHaveBeenCalledWith(
      `conta_azul:oauth:state:${state}`,
      JSON.stringify({
        tenantId: TEST_TENANT_ID,
        storeId: 'store-1',
        returnUrl: 'https://dev.avocado.tech/',
      }),
      'EX',
      600
    )
  })

  it('GivenLegacyPlainValue_WhenConsumeState_ThenReturnsNull', async () => {
    const store = new OAuthStateStore(redis as never)
    redis.get.mockResolvedValue('store-legacy')
    redis.del.mockResolvedValue(1)

    await expect(store.consumeState('state-1')).resolves.toBeNull()
  })

  it('GivenValidJsonPayload_WhenConsumeState_ThenReturnsPayload', async () => {
    const store = new OAuthStateStore(redis as never)
    redis.get.mockResolvedValue(
      JSON.stringify({
        tenantId: TEST_TENANT_ID,
        storeId: 'store-1',
      })
    )
    redis.del.mockResolvedValue(1)

    await expect(store.consumeState('state-1')).resolves.toEqual({
      tenantId: TEST_TENANT_ID,
      storeId: 'store-1',
    })
  })
})
