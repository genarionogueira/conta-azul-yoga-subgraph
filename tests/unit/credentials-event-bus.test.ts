import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCredentialsEventBus,
  NoopCredentialsEventBus,
  RedisCredentialsEventBus,
} from '../../src/lib/credentials/event-bus.js'

describe('CredentialsEventBus', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
  })

  afterEach(() => {
    process.env = env
  })

  it('GivenEventsDisabled_WhenCreatingBus_ThenReturnsNoop', () => {
    process.env.CREDENTIALS_EVENTS_ENABLED = 'false'
    const redis = { publish: vi.fn() }
    const bus = createCredentialsEventBus(redis as never)
    expect(bus).toBeInstanceOf(NoopCredentialsEventBus)
  })

  it('GivenEventsEnabled_WhenCreatingBus_ThenReturnsRedisBus', () => {
    delete process.env.CREDENTIALS_EVENTS_ENABLED
    const redis = { publish: vi.fn() }
    const bus = createCredentialsEventBus(redis as never)
    expect(bus).toBeInstanceOf(RedisCredentialsEventBus)
  })

  it('GivenConnectedEvent_WhenPublishing_ThenUsesTenantChannel', async () => {
    const publish = vi.fn().mockResolvedValue(1)
    const bus = new RedisCredentialsEventBus({ publish } as never)

    await bus.publish({
      type: 'store.connected',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      at: '2026-06-21T00:00:00.000Z',
    })

    expect(publish).toHaveBeenCalledWith(
      'conta_azul:credentials:events:tenant-1',
      expect.stringContaining('store.connected')
    )
  })

  it('GivenNoopBus_WhenPublishing_ThenDoesNotThrow', async () => {
    const bus = new NoopCredentialsEventBus()
    await expect(
      bus.publish({
        type: 'store.disconnected',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        at: '2026-06-21T00:00:00.000Z',
      })
    ).resolves.toBeUndefined()
  })
})
