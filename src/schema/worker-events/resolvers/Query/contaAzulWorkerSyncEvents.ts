import type { AppContext } from '../../../../context.js'
import { requireTenant } from '../../../../lib/auth/tenant-context.js'
import { getWorkerSyncEventBuffer } from '../../../../lib/worker-events/index.js'
import { toGraphqlWorkerSyncEventType } from '../../../../lib/worker-events/types.js'

function clampLimit(limit: number | null | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return 20
  return Math.min(Math.max(1, Math.trunc(limit)), 100)
}

export async function contaAzulWorkerSyncEvents(
  _parent: unknown,
  args: { storeId?: string | null; limit?: number | null },
  context: AppContext
) {
  const tenantId = requireTenant(context)
  const buffer = getWorkerSyncEventBuffer()
  const events = buffer.list(tenantId, {
    storeId: args.storeId ?? undefined,
    limit: clampLimit(args.limit),
  })

  return {
    events: events.map((event) => ({
      type: toGraphqlWorkerSyncEventType(event.type),
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
    })),
  }
}
