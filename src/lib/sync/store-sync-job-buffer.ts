import { EventEmitter } from 'node:events'
import type { StoreSyncJobDoc } from './store-sync-job-repository.js'
import { toGraphqlStoreSyncJob } from './store-sync-job-repository.js'

export const STORE_SYNC_JOB_APPEND = 'append'

export type StoreSyncJobRecord = ReturnType<typeof toGraphqlStoreSyncJob>

export class StoreSyncJobBuffer extends EventEmitter {
  private readonly maxSize: number
  private readonly byJobId = new Map<string, StoreSyncJobRecord[]>()

  constructor(maxSize: number) {
    super()
    this.maxSize = Math.max(1, maxSize)
  }

  append(jobId: string, job: StoreSyncJobDoc): void {
    const event = toGraphqlStoreSyncJob(job)
    const events = this.byJobId.get(jobId) ?? []
    events.unshift(event)
    if (events.length > this.maxSize) {
      events.length = this.maxSize
    }
    this.byJobId.set(jobId, events)
    this.emit(STORE_SYNC_JOB_APPEND, jobId, event)
  }

  latest(jobId: string): StoreSyncJobRecord | null {
    return this.byJobId.get(jobId)?.[0] ?? null
  }

  clear(): void {
    this.byJobId.clear()
  }
}

let buffer: StoreSyncJobBuffer | null = null

export function getStoreSyncJobBuffer(): StoreSyncJobBuffer {
  if (!buffer) {
    buffer = new StoreSyncJobBuffer(100)
  }
  return buffer
}

export function resetStoreSyncJobBufferForTests(): void {
  buffer?.clear()
  buffer = null
}
