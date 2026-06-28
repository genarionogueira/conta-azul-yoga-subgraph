import { describe, expect, it } from 'vitest'
import { serializeSyncEvent } from '../../src/lib/category-sync/sync-event-publisher.js'
import { workerEventStreamKey } from '../../src/lib/worker-events/types.js'

describe('serializeSyncEvent', () => {
  it('GivenReconcileCompleted_WhenSerialized_ThenMatchesWorkerEventsContract', () => {
    const payload = serializeSyncEvent({
      type: 'reconcile.completed',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      trigger: 'manual',
      status: 'success',
      inserted: 3,
      updated: 0,
      deleted: 1,
      skipped: 0,
      durationMs: 42,
    })

    const parsed = JSON.parse(payload) as Record<string, unknown>
    expect(parsed.type).toBe('reconcile.completed')
    expect(parsed.tenantId).toBe('tenant-1')
    expect(parsed.storeId).toBe('store-1')
    expect(parsed.inserted).toBe(3)
    expect(parsed.deleted).toBe(1)
    expect(typeof parsed.at).toBe('string')
  })

  it('GivenTenantId_WhenStreamKey_ThenUsesWorkerPrefix', () => {
    expect(workerEventStreamKey('tenant-1')).toBe('conta_azul:worker:events:tenant-1')
  })
})
