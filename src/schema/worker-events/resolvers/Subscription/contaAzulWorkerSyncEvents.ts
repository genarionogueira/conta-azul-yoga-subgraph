import type { AppContext } from '../../../../context.js'
import { requireTenant, WORKER_CONTEXT_TENANT_ID } from '../../../../lib/auth/tenant-context.js'
import { isWorkerAuth } from '../../../../lib/auth/worker-auth.js'
import { subscribeWorkerSyncEvents } from '../../../../lib/worker-events/subscription-bridge.js'
import { toGraphqlWorkerSyncEventType } from '../../../../lib/worker-events/types.js'
import { GraphQLError } from 'graphql'

function mapWorkerSyncEvent(event: {
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
  errorMessage?: string | null
  message?: string | null
  level?: string | null
  at: string
}) {
  return {
    type: toGraphqlWorkerSyncEventType(event.type as never),
    tenantId: event.tenantId,
    storeId: event.storeId ?? null,
    trigger: event.trigger ?? null,
    status: event.status ?? null,
    inserted: event.inserted ?? null,
    updated: event.updated ?? null,
    deleted: event.deleted ?? null,
    skipped: event.skipped ?? null,
    durationMs: event.durationMs ?? null,
    errorMessage: event.error ?? event.errorMessage ?? null,
    message: event.message ?? null,
    level: event.level ?? null,
    at: event.at,
  }
}

export function contaAzulWorkerSyncEventsSubscription(
  _parent: unknown,
  args: { storeId?: string | null },
  context: AppContext
) {
  if (isWorkerAuth(context.authClaims) || context.tenantId === WORKER_CONTEXT_TENANT_ID) {
    throw new GraphQLError('Forbidden: user authentication required for subscriptions')
  }
  const tenantId = requireTenant(context)
  return subscribeWorkerSyncEvents(tenantId, {
    storeId: args.storeId ?? undefined,
  })
}

export const contaAzulWorkerSyncEventsSubscriptionResolve = mapWorkerSyncEvent
