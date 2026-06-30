import {
  STORE_SYNC_JOB_APPEND,
  type StoreSyncJobBuffer,
  type StoreSyncJobRecord,
} from './store-sync-job-buffer.js'
import { getStoreSyncJobBuffer } from './store-sync-job-buffer.js'

export async function* subscribeStoreSyncProgress(
  jobId: string
): AsyncGenerator<StoreSyncJobRecord> {
  const buffer: StoreSyncJobBuffer = getStoreSyncJobBuffer()
  const queue: StoreSyncJobRecord[] = []
  const wake = { fn: null as (() => void) | null }

  const initial = buffer.latest(jobId)
  if (initial) {
    queue.push(initial)
  }

  const onAppend = (eventJobId: string, event: StoreSyncJobRecord) => {
    if (eventJobId !== jobId) return
    queue.push(event)
    if (wake.fn) {
      wake.fn()
      wake.fn = null
    }
  }

  buffer.on(STORE_SYNC_JOB_APPEND, onAppend)

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
    buffer.off(STORE_SYNC_JOB_APPEND, onAppend)
    if (wake.fn) {
      wake.fn()
    }
  }
}
