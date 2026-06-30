import type { Db } from 'mongodb'
import {
  computePercentage,
  initialBackfillResources,
  initialDisconnectResources,
  type ResourceProgressLike,
} from './progress.js'

export type SyncPhase = 'BACKFILL' | 'INCREMENTAL' | 'DISCONNECT'
export type SyncStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED'

export interface ResourceProgressDoc {
  resource: string
  total?: number | null
  completed: number
  status: SyncStatus
  errorMessage?: string | null
}

export interface StoreSyncJobDoc {
  jobId: string
  tenantId: string
  storeId: string
  phase: SyncPhase
  status: SyncStatus
  percentage: number
  resources: ResourceProgressDoc[]
  startedAt: Date
  updatedAt: Date
  errorMessage?: string | null
  mode?: 'BACKFILL' | 'INCREMENTAL'
}

function collectionName(): string {
  return process.env.STORE_SYNC_JOBS_COLLECTION?.trim() || 'store_sync_jobs'
}

export class StoreSyncJobRepository {
  constructor(private readonly getDb: () => Db) {}

  private collection() {
    return this.getDb().collection<StoreSyncJobDoc>(collectionName())
  }

  async createPending(input: {
    jobId: string
    tenantId: string
    storeId: string
    phase: SyncPhase
    salesChunkTotal?: number
    mode?: 'BACKFILL' | 'INCREMENTAL'
  }): Promise<StoreSyncJobDoc> {
    const now = new Date()
    const resources =
      input.phase === 'BACKFILL'
        ? initialBackfillResources(input.salesChunkTotal ?? 1).map((resource) => ({
            resource: resource.resource,
            total: resource.total ?? 1,
            completed: 0,
            status: 'PENDING' as SyncStatus,
          }))
        : []
    const doc: StoreSyncJobDoc = {
      jobId: input.jobId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      phase: input.phase,
      status: 'PENDING',
      percentage: 0,
      resources,
      startedAt: now,
      updatedAt: now,
      mode: input.mode,
    }
    await this.collection().insertOne(doc)
    return doc
  }

  async findByJobId(jobId: string): Promise<StoreSyncJobDoc | null> {
    return this.collection().findOne({ jobId })
  }

  async findActiveBackfill(
    tenantId: string,
    storeId: string
  ): Promise<StoreSyncJobDoc | null> {
    return this.collection().findOne({
      tenantId,
      storeId,
      phase: 'BACKFILL',
      status: { $in: ['PENDING', 'RUNNING'] },
    })
  }

  async findActiveDisconnect(
    tenantId: string,
    storeId: string
  ): Promise<StoreSyncJobDoc | null> {
    return this.collection().findOne({
      tenantId,
      storeId,
      phase: 'DISCONNECT',
      status: { $in: ['PENDING', 'RUNNING'] },
    })
  }

  async findActiveJob(
    tenantId: string,
    storeId: string
  ): Promise<StoreSyncJobDoc | null> {
    const disconnect = await this.findActiveDisconnect(tenantId, storeId)
    if (disconnect) {
      return disconnect
    }
    return this.findActiveBackfill(tenantId, storeId)
  }

  async createDisconnectPending(input: {
    jobId: string
    tenantId: string
    storeId: string
  }): Promise<StoreSyncJobDoc> {
    const now = new Date()
    const resources = initialDisconnectResources().map((resource) => ({
      resource: resource.resource,
      total: resource.total ?? 1,
      completed: 0,
      status: 'PENDING' as SyncStatus,
    }))
    const doc: StoreSyncJobDoc = {
      jobId: input.jobId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      phase: 'DISCONNECT',
      status: 'PENDING',
      percentage: 0,
      resources,
      startedAt: now,
      updatedAt: now,
    }
    await this.collection().insertOne(doc)
    return doc
  }

  async cancelActiveJobsForStore(
    tenantId: string,
    storeId: string,
    reason: string
  ): Promise<void> {
    await this.collection().updateMany(
      {
        tenantId,
        storeId,
        phase: 'BACKFILL',
        status: { $in: ['PENDING', 'RUNNING'] },
      },
      {
        $set: {
          status: 'FAILED',
          errorMessage: reason,
          updatedAt: new Date(),
        },
      }
    )
  }

  async findLatestFailedJob(
    tenantId: string,
    storeId: string
  ): Promise<StoreSyncJobDoc | null> {
    return this.collection().findOne(
      {
        tenantId,
        storeId,
        phase: { $in: ['BACKFILL', 'DISCONNECT'] },
        status: 'FAILED',
      },
      { sort: { updatedAt: -1 } }
    )
  }

  async findLatestBackfillJob(
    tenantId: string,
    storeId: string
  ): Promise<StoreSyncJobDoc | null> {
    return this.collection().findOne(
      {
        tenantId,
        storeId,
        phase: 'BACKFILL',
      },
      { sort: { updatedAt: -1 } }
    )
  }

  async upsertProgress(input: {
    jobId: string
    tenantId: string
    storeId: string
    phase: SyncPhase
    status: SyncStatus
    resources: ResourceProgressDoc[]
    errorMessage?: string | null
  }): Promise<StoreSyncJobDoc> {
    const percentage = computePercentage(input.resources, input.phase)
    const now = new Date()
    const result = await this.collection().findOneAndUpdate(
      { jobId: input.jobId },
      {
        $set: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          phase: input.phase,
          status: input.status,
          percentage,
          resources: input.resources,
          updatedAt: now,
          errorMessage: input.errorMessage ?? null,
        },
        $setOnInsert: {
          jobId: input.jobId,
          startedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' }
    )
    if (!result) {
      throw new Error(`Failed to upsert StoreSyncJob ${input.jobId}`)
    }
    return result
  }
}

export function toGraphqlStoreSyncJob(doc: StoreSyncJobDoc) {
  return {
    jobId: doc.jobId,
    tenantId: doc.tenantId,
    storeId: doc.storeId,
    phase: doc.phase,
    status: doc.status,
    percentage: doc.percentage,
    resources: doc.resources.map((resource) => ({
      resource: resource.resource,
      total: resource.total ?? null,
      completed: resource.completed,
      status: resource.status,
      errorMessage: resource.errorMessage ?? null,
    })),
    startedAt: doc.startedAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    errorMessage: doc.errorMessage ?? null,
  }
}

export function mergeResourceProgress(
  existing: ResourceProgressDoc[],
  updates: ResourceProgressLike[]
): ResourceProgressDoc[] {
  const byName = new Map(existing.map((resource) => [resource.resource, { ...resource }]))
  for (const update of updates) {
    const current = byName.get(update.resource) ?? {
      resource: update.resource,
      total: update.total ?? 1,
      completed: 0,
      status: 'PENDING' as SyncStatus,
    }
    if (update.total !== undefined && update.total !== null) {
      current.total = update.total
    }
    if (update.completed !== undefined) {
      current.completed = update.completed
    }
    byName.set(update.resource, current)
  }
  return Array.from(byName.values())
}
