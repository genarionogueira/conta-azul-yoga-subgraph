import type { SyncEventPublisher } from '../category-sync/sync-event-publisher.js'

export type PersistResource = 'sales' | 'sale_items' | 'vendedores'

export type PersistResultCounts = {
  synced: number
  deleted: number
  errors: string[]
}

function eventType(
  resource: PersistResource,
  phase: 'started' | 'completed' | 'failed'
): string {
  return `reconcile.${resource}.${phase}`
}

export async function publishPersistReconcileStarted(args: {
  resource: PersistResource
  tenantId: string
  storeId: string
  trigger: string
  eventPublisher: SyncEventPublisher
}): Promise<void> {
  await args.eventPublisher.publish({
    type: eventType(args.resource, 'started'),
    tenantId: args.tenantId,
    storeId: args.storeId,
    trigger: args.trigger,
  })
}

export async function publishPersistReconcileCompleted(args: {
  resource: PersistResource
  tenantId: string
  storeId: string
  trigger: string
  result: PersistResultCounts
  startedAt: number
  eventPublisher: SyncEventPublisher
}): Promise<void> {
  if (args.result.errors.includes('token_not_found')) {
    return
  }

  const durationMs = Math.round(performance.now() - args.startedAt)

  if (args.result.errors.length > 0) {
    await args.eventPublisher.publish({
      type: eventType(args.resource, 'failed'),
      tenantId: args.tenantId,
      storeId: args.storeId,
      trigger: args.trigger,
      error: args.result.errors.join('; '),
      durationMs,
    })
    return
  }

  await args.eventPublisher.publish({
    type: eventType(args.resource, 'completed'),
    tenantId: args.tenantId,
    storeId: args.storeId,
    trigger: args.trigger,
    status: 'success',
    inserted: args.result.synced,
    updated: 0,
    deleted: args.result.deleted,
    skipped: 0,
    durationMs,
  })
}

export async function publishPersistReconcileFailed(args: {
  resource: PersistResource
  tenantId: string
  storeId: string
  trigger: string
  error: string
  startedAt: number
  eventPublisher: SyncEventPublisher
}): Promise<void> {
  await args.eventPublisher.publish({
    type: eventType(args.resource, 'failed'),
    tenantId: args.tenantId,
    storeId: args.storeId,
    trigger: args.trigger,
    error: args.error,
    durationMs: Math.round(performance.now() - args.startedAt),
  })
}
