import { describe, expect, it } from 'vitest'
import { contaAzulWorkerSyncEvents } from '../../schema/worker-events/resolvers/Query/contaAzulWorkerSyncEvents.js'
import { getWorkerSyncEventBuffer } from './index.js'
import type { WorkerSyncEventRecord } from './types.js'

describe('contaAzulWorkerSyncEvents resolver', () => {
  it('GivenBufferedEvents_WhenQueryByTenantAndStore_ThenReturnsNewestFirst', async () => {
    const buffer = getWorkerSyncEventBuffer()
    buffer.clear()
    buffer.append('dev-tenant', {
      type: 'reconcile.started',
      tenantId: 'dev-tenant',
      storeId: 'store-1',
      at: '2026-01-01T00:00:01.000Z',
      streamId: '2-0',
    } satisfies WorkerSyncEventRecord)
    buffer.append('dev-tenant', {
      type: 'reconcile.completed',
      tenantId: 'dev-tenant',
      storeId: 'store-1',
      status: 'success',
      inserted: 3,
      at: '2026-01-01T00:00:02.000Z',
      streamId: '3-0',
    } satisfies WorkerSyncEventRecord)

    const result = await contaAzulWorkerSyncEvents(
      {},
      { storeId: 'store-1', limit: 10 },
      { tenantId: 'dev-tenant' } as never
    )

    expect(result.events).toHaveLength(2)
    expect(result.events[0]?.type).toBe('RECONCILE_COMPLETED')
    expect(result.events[1]?.type).toBe('RECONCILE_STARTED')
  })

  it('GivenOtherTenantEvents_WhenQuery_ThenDoesNotLeakCrossTenant', async () => {
    const buffer = getWorkerSyncEventBuffer()
    buffer.clear()
    buffer.append('other-tenant', {
      type: 'reconcile.completed',
      tenantId: 'other-tenant',
      storeId: 'store-1',
      at: '2026-01-01T00:00:00.000Z',
      streamId: '1-0',
    } satisfies WorkerSyncEventRecord)

    const result = await contaAzulWorkerSyncEvents(
      {},
      { limit: 10 },
      { tenantId: 'dev-tenant' } as never
    )

    expect(result.events).toHaveLength(0)
  })
})
