import { describe, expect, it } from 'vitest'
import { WorkerSyncEventBuffer } from './buffer.js'
import type { WorkerSyncEventRecord } from './types.js'

function event(
  overrides: Partial<WorkerSyncEventRecord> = {}
): WorkerSyncEventRecord {
  return {
    type: 'reconcile.completed',
    tenantId: 'dev-tenant',
    storeId: 'store-1',
    at: '2026-01-01T00:00:00.000Z',
    streamId: '1-0',
    ...overrides,
  }
}

describe('WorkerSyncEventBuffer', () => {
  it('GivenEvents_WhenAppendExceedsMax_ThenEvictsOldest', () => {
    const buffer = new WorkerSyncEventBuffer(2)
    buffer.append('dev-tenant', event({ streamId: '1-0', storeId: 'a' }))
    buffer.append('dev-tenant', event({ streamId: '2-0', storeId: 'b' }))
    buffer.append('dev-tenant', event({ streamId: '3-0', storeId: 'c' }))

    const listed = buffer.list('dev-tenant')
    expect(listed).toHaveLength(2)
    expect(listed.map((item) => item.storeId)).toEqual(['c', 'b'])
  })

  it('GivenStoreFilter_WhenList_ThenReturnsMatchingStoreOnly', () => {
    const buffer = new WorkerSyncEventBuffer(10)
    buffer.append('dev-tenant', event({ storeId: 'store-a', streamId: '1-0' }))
    buffer.append('dev-tenant', event({ storeId: 'store-b', streamId: '2-0' }))

    const listed = buffer.list('dev-tenant', { storeId: 'store-a' })
    expect(listed).toHaveLength(1)
    expect(listed[0]?.storeId).toBe('store-a')
  })

  it('GivenLimitZero_WhenList_ThenClampsToMinimumOne', () => {
    const buffer = new WorkerSyncEventBuffer(10)
    buffer.append('dev-tenant', event({ streamId: '1-0' }))

    expect(buffer.list('dev-tenant', { limit: 0 })).toHaveLength(1)
  })
})
