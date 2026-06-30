import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OAuthStateStore } from '../../src/lib/oauth-state.js'
import { TEST_TENANT_ID } from '../helpers/test-context.js'

describe('OAuthStateStore', () => {
  const redis = {
    set: vi.fn(),
    get: vi.fn(),
    getdel: vi.fn(),
  }

  beforeEach(() => {
    redis.set.mockReset()
    redis.get.mockReset()
    redis.getdel.mockReset()
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
      1800
    )
  })

  it('GivenLegacyPlainValue_WhenConsumeState_ThenReturnsNull', async () => {
    const store = new OAuthStateStore(redis as never)
    redis.getdel.mockResolvedValue('store-legacy')

    await expect(store.consumeState('state-1')).resolves.toBeNull()
  })

  it('GivenValidJsonPayload_WhenConsumeState_ThenReturnsPayloadAtomically', async () => {
    const store = new OAuthStateStore(redis as never)
    redis.getdel.mockResolvedValue(
      JSON.stringify({
        tenantId: TEST_TENANT_ID,
        storeId: 'store-1',
      })
    )

    await expect(store.consumeState('state-1')).resolves.toEqual({
      tenantId: TEST_TENANT_ID,
      storeId: 'store-1',
    })
    expect(redis.getdel).toHaveBeenCalledWith('conta_azul:oauth:state:state-1')
  })

  it('GivenMissingState_WhenConsumeState_ThenReturnsNull', async () => {
    const store = new OAuthStateStore(redis as never)
    redis.getdel.mockResolvedValue(null)

    await expect(store.consumeState('gone')).resolves.toBeNull()
  })

  it('GivenCompletedConnect_WhenMarkCompleted_ThenStoresShortLivedMarker', async () => {
    const store = new OAuthStateStore(redis as never)
    redis.set.mockResolvedValue('OK')

    await store.markCompleted('state-9', {
      storeId: 'store-1',
      jobId: 'job-1',
      returnUrl: 'https://dev.avocado.tech/',
    })

    expect(redis.set).toHaveBeenCalledWith(
      'conta_azul:oauth:completed:state-9',
      JSON.stringify({
        storeId: 'store-1',
        jobId: 'job-1',
        returnUrl: 'https://dev.avocado.tech/',
      }),
      'EX',
      600
    )
  })

  it('GivenCompletedMarker_WhenPeekCompleted_ThenReturnsParsedResult', async () => {
    const store = new OAuthStateStore(redis as never)
    redis.get.mockResolvedValue(
      JSON.stringify({ storeId: 'store-1', jobId: 'job-1' })
    )

    await expect(store.peekCompleted('state-9')).resolves.toEqual({
      storeId: 'store-1',
      jobId: 'job-1',
    })
    expect(redis.get).toHaveBeenCalledWith('conta_azul:oauth:completed:state-9')
  })

  it('GivenNoMarker_WhenPeekCompleted_ThenReturnsNull', async () => {
    const store = new OAuthStateStore(redis as never)
    redis.get.mockResolvedValue(null)

    await expect(store.peekCompleted('state-9')).resolves.toBeNull()
  })
})
