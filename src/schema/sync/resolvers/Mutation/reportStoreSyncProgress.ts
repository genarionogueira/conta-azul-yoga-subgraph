import type { AppContext } from '../../../../context.js'
import { requireWorkerAuth } from '../../../../lib/auth/worker-auth.js'
import { getDb } from '../../../../lib/mongo/connection.js'
import { getStoreSyncJobBuffer } from '../../../../lib/sync/store-sync-job-buffer.js'
import {
  StoreSyncJobRepository,
  toGraphqlStoreSyncJob,
  type ResourceProgressDoc,
  type SyncPhase,
  type SyncStatus,
} from '../../../../lib/sync/store-sync-job-repository.js'

export async function reportStoreSyncProgress(
  _parent: unknown,
  args: {
    input: {
      jobId: string
      tenantId: string
      storeId: string
      phase: SyncPhase
      status: SyncStatus
      percentage: number
      resources: ResourceProgressDoc[]
      errorMessage?: string | null
    }
  },
  context: AppContext
) {
  requireWorkerAuth(context)
  const repo = new StoreSyncJobRepository(getDb)
  const doc = await repo.upsertProgress({
    jobId: args.input.jobId,
    tenantId: args.input.tenantId,
    storeId: args.input.storeId,
    phase: args.input.phase,
    status: args.input.status,
    resources: args.input.resources,
    errorMessage: args.input.errorMessage,
  })
  getStoreSyncJobBuffer().append(args.input.jobId, doc)
  return toGraphqlStoreSyncJob(doc)
}
