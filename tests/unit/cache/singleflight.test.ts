import { describe, expect, it, vi } from 'vitest'
import { SingleflightLock } from '../../../src/lib/cache/singleflight.js'

describe('SingleflightLock', () => {
  it('Given10ParallelSameKey_WhenRunning_ThenFetcherInvokedOnce', async () => {
    const lock = new SingleflightLock()
    const fetcher = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, 50))
    )

    await Promise.all(
      Array.from({ length: 10 }, () => lock.run('key-1', fetcher))
    )

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('GivenTwoDifferentKeys_WhenRunning_ThenFetcherInvokedTwice', async () => {
    const lock = new SingleflightLock()
    const fetcher = vi.fn().mockResolvedValue(undefined)

    await Promise.all([
      lock.run('key-1', fetcher),
      lock.run('key-2', fetcher),
    ])

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('GivenFetcherThrows_WhenRunning_ThenLockReleasedForNextCall', async () => {
    const lock = new SingleflightLock()
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined)

    await expect(lock.run('key-1', fetcher)).rejects.toThrow('fail')
    await expect(lock.run('key-1', fetcher)).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('GivenSlowFetcher_WhenSecondCallerJoins_ThenAwaitsSamePromise', async () => {
    const lock = new SingleflightLock()
    let resolveFirst: (() => void) | undefined
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve
        })
    )

    const first = lock.run('key-1', fetcher)
    const second = lock.run('key-1', fetcher)
    resolveFirst?.()
    await Promise.all([first, second])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
