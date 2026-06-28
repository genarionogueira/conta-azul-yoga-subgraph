import { describe, expect, it } from 'vitest'
import {
  parseWorkerSyncEvent,
  toGraphqlWorkerSyncEventType,
  workerEventStreamKey,
} from './types.js'

describe('worker event types', () => {
  it('GivenValidPayload_WhenParseWorkerSyncEvent_ThenReturnsEvent', () => {
    const parsed = parseWorkerSyncEvent(
      JSON.stringify({
        type: 'reconcile.completed',
        tenantId: 'dev-tenant',
        storeId: 'store-1',
        status: 'success',
        inserted: 2,
        at: '2026-01-01T00:00:00.000Z',
      })
    )

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('reconcile.completed')
    expect(parsed?.tenantId).toBe('dev-tenant')
    expect(parsed?.inserted).toBe(2)
  })

  it('GivenInvalidJson_WhenParseWorkerSyncEvent_ThenReturnsNull', () => {
    expect(parseWorkerSyncEvent('{bad-json')).toBeNull()
  })

  it('GivenMissingTenantId_WhenParseWorkerSyncEvent_ThenReturnsNull', () => {
    expect(
      parseWorkerSyncEvent(JSON.stringify({ type: 'reconcile.started' }))
    ).toBeNull()
  })

  it('GivenStreamKey_WhenBuilt_ThenUsesTenantSuffix', () => {
    expect(workerEventStreamKey('dev-tenant')).toBe(
      'conta_azul:worker:events:dev-tenant'
    )
  })

  it('GivenEventType_WhenMappedToGraphql_ThenUsesEnumName', () => {
    expect(toGraphqlWorkerSyncEventType('reconcile.started')).toBe(
      'RECONCILE_STARTED'
    )
    expect(toGraphqlWorkerSyncEventType('reconcile.failed')).toBe(
      'RECONCILE_FAILED'
    )
  })
})
