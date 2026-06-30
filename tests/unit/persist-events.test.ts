import { describe, expect, it, vi } from 'vitest'
import {
  publishPersistReconcileCompleted,
  publishPersistReconcileStarted,
} from '../../src/lib/persist/persist-events.js'

describe('persist reconcile events', () => {
  it('GivenTriggerAndSuccess_WhenPublishCompleted_ThenPublishesSalesReconcileCompleted', async () => {
    const publish = vi.fn().mockResolvedValue(undefined)
    const eventPublisher = { publish }

    await publishPersistReconcileStarted({
      resource: 'sales',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      trigger: 'worker',
      eventPublisher,
    })
    await publishPersistReconcileCompleted({
      resource: 'sales',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      trigger: 'worker',
      result: { synced: 2, deleted: 0, errors: [] },
      startedAt: performance.now() - 10,
      eventPublisher,
    })

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reconcile.sales.started' })
    )
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reconcile.sales.completed',
        inserted: 2,
        deleted: 0,
      })
    )
  })

  it('GivenEmptyDocuments_WhenPublishCompleted_ThenPublishesCompletedWithZeroCounts', async () => {
    const publish = vi.fn().mockResolvedValue(undefined)
    const eventPublisher = { publish }

    await publishPersistReconcileCompleted({
      resource: 'sale_items',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      trigger: 'worker',
      result: { synced: 0, deleted: 0, errors: [] },
      startedAt: performance.now() - 5,
      eventPublisher,
    })

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reconcile.sale_items.completed',
        inserted: 0,
        deleted: 0,
      })
    )
  })
})
