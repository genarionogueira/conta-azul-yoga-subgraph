import { describe, expect, it } from 'vitest'
import { createClient } from 'graphql-ws'
import WebSocket from 'ws'
import { DEFAULT_DEV_TENANT_ID } from '../../src/lib/auth/tenant-context.js'
import { triggerReconcileOnceForStore } from './helpers/worker-sync.js'

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

async function collectSubscriptionEvents(
  storeId: string,
  action: () => Promise<void>,
  timeoutMs = 8_000
): Promise<WorkerSyncEventPayload[]> {
  const events: WorkerSyncEventPayload[] = []
  const client = createClient({ url: getWsUrl(), webSocketImpl: WebSocket })

  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`subscription timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    const unsubscribe = client.subscribe(
      { query: SUBSCRIPTION, variables: { storeId } },
      {
        next: (result) => {
          const event = result.data?.contaAzulWorkerSyncEvents as
            | WorkerSyncEventPayload
            | undefined
          if (event) events.push(event)
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
          unsubscribe()
          clearTimeout(timer)
          resolve()
        }, 2_000)
      })
      .catch((err) => {
        unsubscribe()
        clearTimeout(timer)
        reject(err)
      })
  })

  await done
  client.terminate()
  return events
}

describe('E2E: Worker stream → subscription — live sync logs', () => {
  it('should yield worker.log and reconcile events when reconcile-once runs', async () => {
    const events = await collectSubscriptionEvents('store-1', async () => {
      await triggerReconcileOnceForStore({
        tenantId: DEFAULT_DEV_TENANT_ID,
        storeId: 'store-1',
      })
    })

    expect(events.some((e) => e.type === 'WORKER_LOG')).toBe(true)
    expect(
      events.some(
        (e) => e.type === 'RECONCILE_COMPLETED' || e.type === 'RECONCILE_STARTED'
      )
    ).toBe(true)
  })
})
