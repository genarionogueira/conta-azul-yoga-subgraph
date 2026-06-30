import { describe, expect, it } from 'vitest'
import { toGraphqlWorkerSyncEventType } from '../../src/lib/worker-events/types.js'

describe('toGraphqlWorkerSyncEventType', () => {
  it('GivenReconcileSalesCompleted_WhenMapped_ThenReturnsSalesReconcileCompleted', () => {
    expect(toGraphqlWorkerSyncEventType('reconcile.sales.completed')).toBe(
      'SALES_RECONCILE_COMPLETED'
    )
  })

  it('GivenReconcileSaleItemsStarted_WhenMapped_ThenReturnsSaleItemsReconcileStarted', () => {
    expect(toGraphqlWorkerSyncEventType('reconcile.sale_items.started')).toBe(
      'SALE_ITEMS_RECONCILE_STARTED'
    )
  })

  it('GivenReconcileVendedoresFailed_WhenMapped_ThenReturnsVendedoresReconcileFailed', () => {
    expect(toGraphqlWorkerSyncEventType('reconcile.vendedores.failed')).toBe(
      'VENDEDORES_RECONCILE_FAILED'
    )
  })

  it('GivenUnknownType_WhenMapped_ThenReturnsWorkerLog', () => {
    expect(toGraphqlWorkerSyncEventType('reconcile.unknown.completed')).toBe('WORKER_LOG')
  })
})
