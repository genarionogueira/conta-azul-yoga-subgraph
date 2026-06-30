import { GraphQLError } from 'graphql'
import type { AppContext } from '../../../../context.js'
import { requireTenant, WORKER_CONTEXT_TENANT_ID } from '../../../../lib/auth/tenant-context.js'
import { isWorkerAuth } from '../../../../lib/auth/worker-auth.js'
import { subscribeStoreSyncProgress } from '../../../../lib/sync/store-sync-job-bridge.js'

export function storeSyncProgressSubscription(
  _parent: unknown,
  args: { jobId: string },
  context: AppContext
) {
  if (isWorkerAuth(context.authClaims) || context.tenantId === WORKER_CONTEXT_TENANT_ID) {
    throw new GraphQLError('Forbidden: user authentication required for subscriptions')
  }
  requireTenant(context)
  return subscribeStoreSyncProgress(args.jobId)
}

export const storeSyncProgressSubscriptionResolve = (event: unknown) => event
