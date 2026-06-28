import type { WorkerSyncEventRecord } from './types.js'
import {
  WORKER_SYNC_EVENT_APPEND,
  type WorkerSyncEventBuffer,
} from './buffer.js'
import { getWorkerSyncEventBuffer } from './index.js'

export interface SubscribeWorkerSyncEventsOptions {
  storeId?: string | null
}

function matchesStoreFilter(
  event: WorkerSyncEventRecord,
  storeId: string | null | undefined
): boolean {
  if (!storeId) return true
  return event.storeId === storeId
}

export async function* subscribeWorkerSyncEvents(
  tenantId: string,
  options: SubscribeWorkerSyncEventsOptions = {}
): AsyncGenerator<WorkerSyncEventRecord> {
  const buffer: WorkerSyncEventBuffer = getWorkerSyncEventBuffer()
  const queue: WorkerSyncEventRecord[] = []
  const wake = { fn: null as (() => void) | null }

  const onAppend = (eventTenantId: string, event: WorkerSyncEventRecord) => {
    if (eventTenantId !== tenantId) return
    if (!matchesStoreFilter(event, options.storeId)) return
    queue.push(event)
    if (wake.fn) {
      wake.fn()
      wake.fn = null
    }
  }

  buffer.on(WORKER_SYNC_EVENT_APPEND, onAppend)

  try {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!
        continue
      }
      await new Promise<void>((resolve) => {
        wake.fn = resolve
      })
    }
  } finally {
    buffer.off(WORKER_SYNC_EVENT_APPEND, onAppend)
    if (wake.fn) {
      wake.fn()
    }
  }
}
