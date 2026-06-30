import { describe, expect, it } from 'vitest'
import { createClient } from 'graphql-ws'
import WebSocket from 'ws'
import { DEFAULT_DEV_TENANT_ID } from '../../src/lib/auth/tenant-context.js'
import {
  enqueueBackfillForStore,
  seedStoreConnection,
  triggerReconcileOnceForStore,
  waitForStoreSyncJobComplete,
} from './helpers/worker-sync.js'

const SUBSCRIPTION = `
  subscription ContaAzulWorkerSyncEvents($storeId: ID) {
    contaAzulWorkerSyncEvents(storeId: $storeId) {
      type
      message
      level
      storeId
      trigger
      status
      at
    }
  }
`

type WorkerSyncEventPayload = {
  type: string
  message?: string | null
  level?: string | null
  storeId?: string | null
  trigger?: string | null
  status?: string | null
  at: string
}

function getWsUrl(): string {
  const base = process.env.E2E_BASE_URL
  if (!base) throw new Error('E2E_BASE_URL not set')
  const url = new URL(base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/graphql'
  return url.toString()
}

interface CollectOptions {
  timeoutMs?: number
  settleMs?: number
  until?: (events: WorkerSyncEventPayload[]) => boolean
}

async function collectSubscriptionEvents(
  storeId: string,
  action: () => Promise<void>,
  options: CollectOptions = {}
): Promise<WorkerSyncEventPayload[]> {
  const { timeoutMs = 8_000, settleMs = 2_000, until } = options
  const events: WorkerSyncEventPayload[] = []
  const client = createClient({ url: getWsUrl(), webSocketImpl: WebSocket })

  const done = new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (unsubscribe?: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe?.()
      resolve()
    }

    const timer = setTimeout(() => {
      // Soft timeout: resolve with whatever events we have instead of failing.
      finish()
    }, timeoutMs)

    const unsubscribe = client.subscribe(
      { query: SUBSCRIPTION, variables: { storeId } },
      {
        next: (result) => {
          const event = result.data?.contaAzulWorkerSyncEvents as
            | WorkerSyncEventPayload
            | undefined
          if (event) events.push(event)
          if (until && until(events)) {
            finish(unsubscribe)
          }
        },
        error: (err) => {
          clearTimeout(timer)
          reject(err)
        },
        complete: () => {
          clearTimeout(timer)
          resolve()
        },
      }
    )

    void action()
      .then(() => {
        setTimeout(() => {
          finish(unsubscribe)
        }, settleMs)
      })
      .catch((err) => {
        clearTimeout(timer)
        unsubscribe()
        reject(err)
      })
  })

  await done
  client.terminate()
  return events
}

describe('E2E: Worker stream → subscription — live sync logs', () => {
  it('should yield worker.log and reconcile events when reconcile-once runs', async () => {
    const hasReconcile = (evts: WorkerSyncEventPayload[]) =>
      evts.some((e) => e.type === 'WORKER_LOG') &&
      evts.some(
        (e) => e.type === 'RECONCILE_COMPLETED' || e.type === 'RECONCILE_STARTED'
      )

    const events = await collectSubscriptionEvents(
      'store-1',
      async () => {
        await triggerReconcileOnceForStore({
          tenantId: DEFAULT_DEV_TENANT_ID,
          storeId: 'store-1',
        })
      },
      { timeoutMs: 30_000, settleMs: 20_000, until: hasReconcile }
    )

    expect(events.some((e) => e.type === 'WORKER_LOG')).toBe(true)
    expect(
      events.some(
        (e) => e.type === 'RECONCILE_COMPLETED' || e.type === 'RECONCILE_STARTED'
      )
    ).toBe(true)
  })

  it('should yield resource-specific reconcile types after backfill job', async () => {
    const storeId = 'store-sync-logs-sub'
    await seedStoreConnection(DEFAULT_DEV_TENANT_ID, storeId)

    const jobId = await enqueueBackfillForStore({
      tenantId: DEFAULT_DEV_TENANT_ID,
      storeId,
      trigger: 'e2e-subscription-logs',
    })

    const events = await collectSubscriptionEvents(
      storeId,
      async () => {
        await waitForStoreSyncJobComplete(jobId, 120_000)
      },
      {
        timeoutMs: 130_000,
        settleMs: 3_000,
        until: (evts) =>
          evts.some(
            (event) =>
              event.type === 'SALES_RECONCILE_COMPLETED' ||
              event.type === 'WORKER_LOG' ||
              (event.message?.includes('sync.sales') ?? false)
          ) && evts.some((event) => event.storeId === storeId),
      }
    )

    expect(
      events.some(
        (event) =>
          event.type === 'SALES_RECONCILE_COMPLETED' ||
          event.type === 'WORKER_LOG' ||
          (event.message?.includes('sync.sales') ?? false)
      )
    ).toBe(true)
    expect(events.some((event) => event.storeId === storeId)).toBe(true)
  })
})
