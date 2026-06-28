import { describe, expect, it } from 'vitest'
import {
  parseWorkerSyncEvent,
  toGraphqlWorkerSyncEventType,
} from './types.js'

describe('worker.log event type', () => {
  it('GivenWorkerLogPayload_WhenParseWorkerSyncEvent_ThenReturnsMessageAndLevel', () => {
    const parsed = parseWorkerSyncEvent(
      JSON.stringify({
        type: 'worker.log',
        tenantId: 'dev-tenant',
        storeId: 'store-1',
        level: 'info',
        message: 'reconcile-once started',
        trigger: 'manual',
        at: '2026-01-01T00:00:00.000Z',
      })
    )

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('worker.log')
    expect(parsed?.message).toBe('reconcile-once started')
    expect(parsed?.level).toBe('info')
  })

  it('GivenWorkerLogType_WhenMappedToGraphql_ThenUsesWorkerLogEnum', () => {
    expect(toGraphqlWorkerSyncEventType('worker.log')).toBe('WORKER_LOG')
  })
})
