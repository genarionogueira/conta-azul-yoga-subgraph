import type { Redis } from 'ioredis'
import { WorkerSyncEventBuffer } from './buffer.js'
import {
  parseWorkerSyncEvent,
  WORKER_EVENT_STREAM_PREFIX,
  workerEventStreamKey,
  workerEventsEnabled,
  type WorkerSyncEventRecord,
} from './types.js'

const CREDENTIALS_CONNECTED_PREFIX = 'conta_azul:connected_stores:'

function isValidTenantId(tenantId: string): boolean {
  const trimmed = tenantId.trim()
  return trimmed.length > 0 && trimmed !== '*'
}

export class NoopWorkerSyncEventSubscriber {
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}

export class WorkerSyncEventSubscriber {
  private readonly lastIds = new Map<string, string>()
  private running = false
  private loopPromise: Promise<void> | null = null

  constructor(
    private readonly redis: Redis,
    private readonly buffer: WorkerSyncEventBuffer,
    private readonly seedCount = 100
  ) {}

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    const tenantIds = await this.discoverTenantIds()
    for (const tenantId of tenantIds) {
      await this.seedTenant(tenantId)
    }
    this.loopPromise = this.runLoop(tenantIds)
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.loopPromise) {
      await this.loopPromise
      this.loopPromise = null
    }
  }

  private async discoverTenantIds(): Promise<string[]> {
    const tenantIds = new Set<string>()
    const defaultTenant = process.env.DEFAULT_DEV_TENANT_ID?.trim()
    if (defaultTenant && isValidTenantId(defaultTenant)) tenantIds.add(defaultTenant)

    let cursor = '0'
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${WORKER_EVENT_STREAM_PREFIX}*`,
        'COUNT',
        100
      )
      cursor = nextCursor
      for (const key of keys) {
        if (key.startsWith(WORKER_EVENT_STREAM_PREFIX)) {
          const tenantId = key.slice(WORKER_EVENT_STREAM_PREFIX.length)
          if (isValidTenantId(tenantId)) tenantIds.add(tenantId)
        }
      }
    } while (cursor !== '0')

    cursor = '0'
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${CREDENTIALS_CONNECTED_PREFIX}*`,
        'COUNT',
        100
      )
      cursor = nextCursor
      for (const key of keys) {
        if (key.startsWith(CREDENTIALS_CONNECTED_PREFIX)) {
          const tenantId = key.slice(CREDENTIALS_CONNECTED_PREFIX.length)
          if (isValidTenantId(tenantId)) tenantIds.add(tenantId)
        }
      }
    } while (cursor !== '0')

    return [...tenantIds].sort()
  }

  private async seedTenant(tenantId: string): Promise<void> {
    const streamKey = workerEventStreamKey(tenantId)
    const entries = await this.redis.xrevrange(streamKey, '+', '-', 'COUNT', this.seedCount)
    const events: WorkerSyncEventRecord[] = []
    for (const entry of entries) {
      const parsed = this.parseEntry(entry)
      if (parsed) events.push(parsed)
    }
    if (events.length > 0) {
      this.buffer.seed(tenantId, events)
      const newestId = entries[0]?.[0]
      if (typeof newestId === 'string') {
        this.lastIds.set(tenantId, newestId)
      }
    } else {
      this.lastIds.set(tenantId, '$')
    }
  }

  private async syncStreamCursor(tenantId: string): Promise<void> {
    const lastId = this.lastIds.get(tenantId) ?? '$'
    const streamKey = workerEventStreamKey(tenantId)
    const entries = await this.redis.xrevrange(streamKey, '+', '-', 'COUNT', 1)
    if (entries.length === 0) {
      this.lastIds.set(tenantId, '$')
      return
    }

    const newestId = entries[0]?.[0]
    if (typeof newestId !== 'string') return
    // Reseed when the stream was recreated or events landed after an empty seed ($).
    if (lastId === '$' || compareStreamIds(newestId, lastId) < 0) {
      await this.seedTenant(tenantId)
    }
  }

  private parseEntry(entry: [string, string[]]): WorkerSyncEventRecord | null {
    const [streamId, fields] = entry
    const payloadIndex = fields.indexOf('payload')
    if (payloadIndex < 0 || payloadIndex + 1 >= fields.length) {
      return null
    }
    const payload = fields[payloadIndex + 1]
    const parsed = parseWorkerSyncEvent(payload, streamId)
    if (!parsed) return null
    return { ...parsed, streamId }
  }

  private async runLoop(initialTenantIds: string[]): Promise<void> {
    const tenantIds = new Set(initialTenantIds)
    while (this.running) {
      const discovered = await this.discoverTenantIds()
      for (const tenantId of discovered) {
        if (!tenantIds.has(tenantId)) {
          tenantIds.add(tenantId)
          await this.seedTenant(tenantId)
        }
      }

      const streams = [...tenantIds]
      if (streams.length === 0) {
        await sleep(1000)
        continue
      }

      for (const tenantId of streams) {
        await this.syncStreamCursor(tenantId)
      }

      const streamKeys = streams.map((tenantId) => workerEventStreamKey(tenantId))
      const ids = streams.map((tenantId) => this.lastIds.get(tenantId) ?? '$')

      try {
        const result = await this.redis.xread(
          'BLOCK',
          2000,
          'STREAMS',
          ...streamKeys,
          ...ids
        )
        if (!result) continue

        for (const [streamKey, entries] of result) {
          const tenantId = streamKey.slice(WORKER_EVENT_STREAM_PREFIX.length)
          for (const entry of entries) {
            const parsed = this.parseEntry(entry)
            if (parsed) {
              this.buffer.append(tenantId, parsed)
            }
            this.lastIds.set(tenantId, entry[0])
          }
        }
      } catch (err) {
        console.error('[worker-events] stream read failed:', err)
        await sleep(1000)
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function compareStreamIds(a: string, b: string): number {
  const [aMs, aSeq] = a.split('-')
  const [bMs, bSeq] = b.split('-')
  const msDiff = Number(bMs) - Number(aMs)
  if (msDiff !== 0) return msDiff
  return Number(bSeq ?? 0) - Number(aSeq ?? 0)
}

export function createWorkerSyncEventSubscriber(
  redis: Redis,
  buffer: WorkerSyncEventBuffer
): WorkerSyncEventSubscriber | NoopWorkerSyncEventSubscriber {
  if (!workerEventsEnabled()) {
    return new NoopWorkerSyncEventSubscriber()
  }
  return new WorkerSyncEventSubscriber(redis, buffer)
}
