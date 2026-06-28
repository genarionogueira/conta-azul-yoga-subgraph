export const WORKER_EVENT_STREAM_PREFIX = 'conta_azul:worker:events:'

export type WorkerSyncEventType =
  | 'reconcile.started'
  | 'reconcile.completed'
  | 'reconcile.failed'
  | 'store.data_deleted'
  | 'reconcile.cycle.completed'
  | 'worker.log'

export interface WorkerSyncEventPayload {
  type: WorkerSyncEventType
  tenantId: string
  storeId?: string | null
  trigger?: string | null
  status?: string | null
  inserted?: number | null
  updated?: number | null
  deleted?: number | null
  skipped?: number | null
  durationMs?: number | null
  error?: string | null
  errorMessage?: string | null
  deletedCount?: number | null
  storesProcessed?: number | null
  successCount?: number | null
  errorCount?: number | null
  message?: string | null
  level?: string | null
  at: string
}

export interface WorkerSyncEventRecord extends WorkerSyncEventPayload {
  streamId: string
}

export function workerEventStreamKey(tenantId: string): string {
  return `${WORKER_EVENT_STREAM_PREFIX}${tenantId}`
}

export function parseWorkerSyncEvent(
  payload: string,
  streamId = ''
): WorkerSyncEventPayload | null {
  try {
    const data = JSON.parse(payload) as Record<string, unknown>
    const type = data.type
    const tenantId = data.tenantId
    if (typeof type !== 'string' || typeof tenantId !== 'string') {
      return null
    }
    return {
      type: type as WorkerSyncEventType,
      tenantId,
      storeId: optionalString(data.storeId),
      trigger: optionalString(data.trigger),
      status: optionalString(data.status),
      inserted: optionalNumber(data.inserted),
      updated: optionalNumber(data.updated),
      deleted: optionalNumber(data.deleted),
      skipped: optionalNumber(data.skipped),
      durationMs: optionalNumber(data.durationMs),
      error: optionalString(data.error ?? data.errorMessage),
      errorMessage: optionalString(data.errorMessage ?? data.error),
      deletedCount: optionalNumber(data.deletedCount),
      storesProcessed: optionalNumber(data.storesProcessed),
      successCount: optionalNumber(data.successCount),
      errorCount: optionalNumber(data.errorCount),
      message: optionalString(data.message),
      level: optionalString(data.level),
      at: typeof data.at === 'string' ? data.at : '',
    }
  } catch {
    return null
  }
}

export function toGraphqlWorkerSyncEventType(
  type: WorkerSyncEventType
): string {
  switch (type) {
    case 'reconcile.started':
      return 'RECONCILE_STARTED'
    case 'reconcile.completed':
      return 'RECONCILE_COMPLETED'
    case 'reconcile.failed':
      return 'RECONCILE_FAILED'
    case 'store.data_deleted':
      return 'STORE_DATA_DELETED'
    case 'reconcile.cycle.completed':
      return 'RECONCILE_CYCLE_COMPLETED'
    case 'worker.log':
      return 'WORKER_LOG'
    default:
      return 'RECONCILE_STARTED'
  }
}

function optionalString(value: unknown): string | null | undefined {
  if (value == null) return undefined
  return typeof value === 'string' ? value : undefined
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value == null) return undefined
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

export function workerEventsEnabled(): boolean {
  const raw = process.env.WORKER_EVENTS_ENABLED?.trim().toLowerCase()
  return raw !== 'false'
}

export function workerEventsBufferSize(): number {
  const raw = process.env.WORKER_EVENTS_BUFFER_SIZE?.trim()
  const parsed = raw ? Number.parseInt(raw, 10) : 100
  if (!Number.isFinite(parsed) || parsed < 1) return 100
  return Math.min(parsed, 500)
}
