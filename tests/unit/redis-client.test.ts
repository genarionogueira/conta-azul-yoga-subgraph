import { beforeEach, describe, expect, it, vi } from 'vitest'

const RedisMock = vi.fn(function RedisMock(this: { on: ReturnType<typeof vi.fn> }) {
  this.on = vi.fn()
})

vi.mock('ioredis', () => ({
  Redis: RedisMock,
}))

const { createRedisClient } = await import('../../src/lib/redis/create-redis-client.js')

describe('E2E: Redis resilience - Goal: fail fast on stalled Valkey', () => {
  beforeEach(() => {
    RedisMock.mockClear()
  })

  it('GivenCommandRole_WhenCreatingClient_ThenAppliesCommandTimeoutAndRetries', () => {
    createRedisClient('rediss://default:secret@valkey.example.com:25061/2', 'command')

    expect(RedisMock).toHaveBeenCalledWith(
      'rediss://default:secret@valkey.example.com:25061/2',
      expect.objectContaining({
        commandTimeout: 5000,
        connectTimeout: 10000,
        keepAlive: 30000,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      })
    )
  })

  it('GivenBlockingRole_WhenCreatingClient_ThenMaxRetriesPerRequestIsNull', () => {
    createRedisClient('redis://localhost:6379', 'blocking')

    expect(RedisMock).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.objectContaining({
        connectTimeout: 10000,
        keepAlive: 30000,
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        lazyConnect: false,
      })
    )

    const options = RedisMock.mock.calls[0]?.[1] as Record<string, unknown>
    expect(options).not.toHaveProperty('commandTimeout')
  })

  it('GivenMissingRedisUrl_WhenCreatingClient_ThenUsesLocalhostFallback', () => {
    createRedisClient('redis://localhost:6379', 'command')

    expect(RedisMock).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.any(Object)
    )
  })

  it('GivenCommandRole_WhenRedisEmitsError_ThenLogsWithRolePrefix', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    createRedisClient('redis://localhost:6379', 'command')

    const client = RedisMock.mock.instances[0] as { on: ReturnType<typeof vi.fn> }
    const errorHandler = client.on.mock.calls.find(([event]) => event === 'error')?.[1] as
      | ((err: Error) => void)
      | undefined

    expect(errorHandler).toBeDefined()
    errorHandler?.(new Error('read ETIMEDOUT'))

    expect(errorSpy).toHaveBeenCalledWith('[redis] command read ETIMEDOUT')
    errorSpy.mockRestore()
  })
})
