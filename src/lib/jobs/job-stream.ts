import type { Redis } from 'ioredis'
import { jobStreamKey } from '../conta-azul-api/config.js'

export type JobType =
  | 'reconcile.store'
  | 'disconnect.store'
  | 'sync.categories'
  | 'sync.sales'
  | 'sync.sale_items'

export type SyncMode = 'BACKFILL' | 'INCREMENTAL'

export interface SyncJobPayload {
  type: JobType
  tenantId: string
  storeId: string
  connectionId?: string
  saleId?: string
  trigger: string
  attempt: number
  enqueuedAt: string
  mode?: SyncMode
  jobId?: string
  windowStart?: string
  windowEnd?: string
  chunkIndex?: number
  chunkTotal?: number
}

export function serializeJobPayload(payload: SyncJobPayload): string {
  return JSON.stringify(payload)
}

export function parseJobPayload(raw: string): SyncJobPayload {
  const parsed = JSON.parse(raw) as SyncJobPayload
  if (!parsed.type || !parsed.tenantId || !parsed.storeId) {
    throw new Error('Invalid job payload')
  }
  if (!parsed.mode) {
    parsed.mode = 'INCREMENTAL'
  }
  return parsed
}

export async function enqueueJob(
  redis: Redis,
  payload: SyncJobPayload
): Promise<string> {
  const id = await redis.xadd(
    jobStreamKey(),
    '*',
    'payload',
    serializeJobPayload(payload)
  )
  if (!id) {
    throw new Error('Failed to enqueue job')
  }
  return id
}
