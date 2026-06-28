import { EventEmitter } from 'node:events'
import type { WorkerSyncEventRecord } from './types.js'

export const WORKER_SYNC_EVENT_APPEND = 'append'

export class WorkerSyncEventBuffer extends EventEmitter {
  private readonly maxSize: number
  private readonly byTenant = new Map<string, WorkerSyncEventRecord[]>()

  constructor(maxSize: number) {
    super()
    this.maxSize = Math.max(1, maxSize)
  }

  append(tenantId: string, event: WorkerSyncEventRecord): void {
    const events = this.byTenant.get(tenantId) ?? []
    events.unshift(event)
    if (events.length > this.maxSize) {
      events.length = this.maxSize
    }
    this.byTenant.set(tenantId, events)
    this.emit(WORKER_SYNC_EVENT_APPEND, tenantId, event)
  }

  seed(tenantId: string, events: WorkerSyncEventRecord[]): void {
    const existing = this.byTenant.get(tenantId) ?? []
    const merged = [...events, ...existing]
    if (merged.length > this.maxSize) {
      merged.length = this.maxSize
    }
    this.byTenant.set(tenantId, merged)
  }

  list(
    tenantId: string,
    options: { storeId?: string; limit?: number } = {}
  ): WorkerSyncEventRecord[] {
    const events = this.byTenant.get(tenantId) ?? []
    const filtered = options.storeId
      ? events.filter((event) => event.storeId === options.storeId)
      : events
    const rawLimit = options.limit ?? 20
    const limit = rawLimit < 1 ? 1 : rawLimit
    return filtered.slice(0, limit)
  }

  clear(): void {
    this.byTenant.clear()
  }
}