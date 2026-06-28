import type { Redis } from 'ioredis'
import { workerEventStreamKey } from '../worker-events/types.js'

export interface SyncEvent {
  type: string
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
  deletedCount?: number | null
  storesProcessed?: number | null
  successCount?: number | null
  errorCount?: number | null
  at?: string
}

export interface SyncEventPublisher {
  publish(event: SyncEvent): Promise<void>
}

export class NoopSyncEventPublisher implements SyncEventPublisher {
  async publish(_event: SyncEvent): Promise<void> {
    return undefined
  }
}

function utcNowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function serializeSyncEvent(event: SyncEvent): string {
  const payload: Record<string, unknown> = {
    type: event.type,
    tenantId: event.tenantId,
  }

  const optional: Array<[string, unknown]> = [
    ['storeId', event.storeId],
    ['trigger', event.trigger],
    ['status', event.status],
    ['inserted', event.inserted],
    ['updated', event.updated],
    ['deleted', event.deleted],
    ['skipped', event.skipped],
    ['durationMs', event.durationMs],
    ['error', event.error],
    ['deletedCount', event.deletedCount],
    ['storesProcessed', event.storesProcessed],
    ['successCount', event.successCount],
    ['errorCount', event.errorCount],
    ['at', event.at],
  ]

  for (const [key, value] of optional) {
    if (value == null) continue
    if (key === 'at' && value === '') continue
    payload[key] = value
  }

  if (!payload.at) {
    payload.at = utcNowIso()
  }

  return JSON.stringify(payload)
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseBoolEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value?.trim()) return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  return fallback
}

export class RedisSyncEventPublisher implements SyncEventPublisher {
  constructor(
    private readonly redis: Redis,
    private readonly streamMaxlen: number | null,
    private readonly streamMinidDays: number | null
  ) {}

  async publish(event: SyncEvent): Promise<void> {
    try {
      const key = workerEventStreamKey(event.tenantId)
      const payload = serializeSyncEvent(event)
      const retentionArgs = this.retentionArgs()

      if (retentionArgs.length > 0) {
        await this.redis.call('XADD', key, ...retentionArgs, '*', 'payload', payload)
      } else {
        await this.redis.xadd(key, '*', 'payload', payload)
      }
    } catch (err) {
      console.error(
        `[category-sync] failed to publish event type=${event.type} tenant=${event.tenantId} store=${event.storeId ?? ''}:`,
        err
      )
    }
  }

  private retentionArgs(): Array<string | number> {
    if (this.streamMinidDays != null && this.streamMinidDays > 0) {
      const cutoffMs = Date.now() - this.streamMinidDays * 86_400_000
      return ['MINID', '~', `${cutoffMs}-0`]
    }
    if (this.streamMaxlen != null && this.streamMaxlen > 0) {
      return ['MAXLEN', '~', this.streamMaxlen]
    }
    return []
  }
}

export function createSyncEventPublisher(redis: Redis): SyncEventPublisher {
  const enabled = parseBoolEnv(process.env.WORKER_EVENTS_ENABLED, true)
  if (!enabled) {
    return new NoopSyncEventPublisher()
  }

  const minidDays = parseIntEnv(process.env.WORKER_EVENTS_STREAM_MINID_DAYS, 30)
  const maxlen = parseIntEnv(process.env.WORKER_EVENTS_STREAM_MAXLEN, 1000)

  return new RedisSyncEventPublisher(
    redis,
    minidDays > 0 ? null : maxlen,
    minidDays > 0 ? minidDays : null
  )
}
