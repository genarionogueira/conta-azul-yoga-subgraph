import { describe, expect, it } from 'vitest'
import { resetWorkerSyncEventsForTests, getWorkerSyncEventBuffer } from './index.js'
import { subscribeWorkerSyncEvents } from './subscription-bridge.js'
import type { WorkerSyncEventRecord } from './types.js'

function sampleEvent(
  overrides: Partial<WorkerSyncEventRecord> = {}
): WorkerSyncEventRecord {
  return {
    type: 'worker.log',
    tenantId: 'dev-tenant',
    storeId: 'store-1',
    message: 'test message',
    level: 'info',
    at: '2026-01-01T00:00:00.000Z',
    streamId: '1-0',
    ...overrides,
  }
}

describe('subscribeWorkerSyncEvents', () => {
  it('GivenSubscriberAppends_WhenSubscriptionActive_ThenYieldsEvent', async () => {
    resetWorkerSyncEventsForTests()
    const buffer = getWorkerSyncEventBuffer()
    const iterator = subscribeWorkerSyncEvents('dev-tenant')

    const nextPromise = iterator.next()
    buffer.append('dev-tenant', sampleEvent())

    const result = await nextPromise
    expect(result.value?.message).toBe('test message')

    await iterator.return?.(undefined)
  })

  it('GivenStoreIdFilter_WhenOtherStoreAppends_ThenDoesNotYield', async () => {
    resetWorkerSyncEventsForTests()
    const buffer = getWorkerSyncEventBuffer()
    const iterator = subscribeWorkerSyncEvents('dev-tenant', { storeId: 'store-1' })

    const pending = iterator.next()
    buffer.append(
      'dev-tenant',
      sampleEvent({ storeId: 'store-2', message: 'other store' })
    )

    let settled = false
    pending.then(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(settled).toBe(false)

    buffer.append('dev-tenant', sampleEvent({ message: 'matching store' }))
    const result = await pending
    expect(result.value?.message).toBe('matching store')

    await iterator.return?.(undefined)
  })

  it('GivenWrongTenant_WhenSubscribe_ThenYieldsNothing', async () => {
    resetWorkerSyncEventsForTests()
    const buffer = getWorkerSyncEventBuffer()
    const iterator = subscribeWorkerSyncEvents('dev-tenant')

    const pending = iterator.next()
    buffer.append('other-tenant', sampleEvent())

    const result = await Promise.race([
      pending,
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 50)),
    ])
    expect(result).toBe('timeout')

    void iterator.return(undefined)
  })

  it('GivenSeedOnly_WhenSubscribe_ThenReplaysBufferedEvents', async () => {
    resetWorkerSyncEventsForTests()
    const buffer = getWorkerSyncEventBuffer()
    buffer.seed('dev-tenant', [sampleEvent({ message: 'historical' })])

    const iterator = subscribeWorkerSyncEvents('dev-tenant')
    const result = await iterator.next()

    expect(result.value?.message).toBe('historical')

    void iterator.return(undefined)
  })
})
