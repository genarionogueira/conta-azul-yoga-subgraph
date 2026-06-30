import { GraphQLError } from 'graphql'
import type { AppContext } from '../../../../context.js'
import { requireTenant, WORKER_CONTEXT_TENANT_ID } from '../../../../lib/auth/tenant-context.js'
import { isWorkerAuth } from '../../../../lib/auth/worker-auth.js'
import { getDb } from '../../../../lib/mongo/connection.js'
import { subscribeStoreSyncProgress } from '../../../../lib/sync/store-sync-job-bridge.js'
import {
  StoreSyncJobRepository,
  toGraphqlStoreSyncJob,
} from '../../../../lib/sync/store-sync-job-repository.js'

export async function storeSyncProgressByStoreSubscription(
  _parent: unknown,
  args: { storeId: string },
  context: AppContext
) {
  if (isWorkerAuth(context.authClaims) || context.tenantId === WORKER_CONTEXT_TENANT_ID) {
    throw new GraphQLError('Forbidden: user authentication required for subscriptions')
  }
  const tenantId = requireTenant(context)
  const repo = new StoreSyncJobRepository(getDb)
  const active = await repo.findActiveJob(tenantId, args.storeId)
  if (!active) {
    return emptyStoreSyncProgressStream()
  }

  return filterStoreSyncProgressStream(
    subscribeStoreSyncProgress(active.jobId),
    tenantId,
    args.storeId
  )
}

export const storeSyncProgressByStoreSubscriptionResolve = (event: unknown) => event

async function* emptyStoreSyncProgressStream(): AsyncGenerator<never> {
  return
}

async function* filterStoreSyncProgressStream(
  stream: AsyncIterable<ReturnType<typeof toGraphqlStoreSyncJob>>,
  tenantId: string,
  storeId: string
): AsyncGenerator<ReturnType<typeof toGraphqlStoreSyncJob>> {
  for await (const event of stream) {
    if (event.tenantId === tenantId && event.storeId === storeId) {
      yield event
    }
  }
}
