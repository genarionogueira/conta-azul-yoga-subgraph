import { randomUUID } from 'node:crypto'
import type { Redis } from 'ioredis'
import { enqueueJob, type SyncMode } from '../jobs/job-stream.js'
import { getDb } from '../mongo/connection.js'
import { planSalesWindows } from './backfill-windows.js'
import { StoreSyncJobRepository } from './store-sync-job-repository.js'

export async function enqueueStoreReconcileJob(
  redis: Redis,
  input: {
    tenantId: string
    storeId: string
    trigger: string
    mode?: SyncMode
    connectionId?: string
  }
): Promise<{ jobId: string; streamId: string }> {
  const mode = input.mode ?? 'INCREMENTAL'
  const jobId = randomUUID()
  const repo = new StoreSyncJobRepository(getDb)

  if (mode === 'BACKFILL') {
    const windows = planSalesWindows()
    await repo.createPending({
      jobId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      phase: 'BACKFILL',
      salesChunkTotal: windows.length,
      mode,
    })
  } else {
    await repo.createPending({
      jobId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      phase: 'INCREMENTAL',
      mode: 'INCREMENTAL',
    })
  }

  const streamId = await enqueueJob(redis, {
    type: 'reconcile.store',
    tenantId: input.tenantId,
    storeId: input.storeId,
    connectionId: input.connectionId,
    trigger: input.trigger,
    mode,
    jobId,
    attempt: 0,
    enqueuedAt: new Date().toISOString(),
  })

  return { jobId, streamId }
}

export async function enqueueStoreDisconnectJob(
  redis: Redis,
  input: {
    tenantId: string
    storeId: string
    connectionId?: string
  }
): Promise<{ jobId: string; streamId: string }> {
  const jobId = randomUUID()
  const repo = new StoreSyncJobRepository(getDb)

  await repo.cancelActiveJobsForStore(
    input.tenantId,
    input.storeId,
    'Store disconnect requested'
  )
  await repo.createDisconnectPending({
    jobId,
    tenantId: input.tenantId,
    storeId: input.storeId,
  })

  const streamId = await enqueueJob(redis, {
    type: 'disconnect.store',
    tenantId: input.tenantId,
    storeId: input.storeId,
    connectionId: input.connectionId,
    trigger: 'disconnect',
    mode: 'INCREMENTAL',
    jobId,
    attempt: 0,
    enqueuedAt: new Date().toISOString(),
  })

  return { jobId, streamId }
}

export async function isStoreDisconnectInProgress(
  tenantId: string,
  storeId: string
): Promise<boolean> {
  const repo = new StoreSyncJobRepository(getDb)
  const active = await repo.findActiveDisconnect(tenantId, storeId)
  return active !== null
}
