import { describe, expect, it } from 'vitest'
import { GraphQLError } from 'graphql'
import { WORKER_JWT_SUBJECT } from '../../lib/auth/worker-auth.js'
import { WORKER_CONTEXT_TENANT_ID } from '../../lib/auth/tenant-context.js'
import {
  contaAzulWorkerSyncEventsSubscription,
  contaAzulWorkerSyncEventsSubscriptionResolve,
} from '../../schema/worker-events/resolvers/Subscription/contaAzulWorkerSyncEvents.js'
import { resetWorkerSyncEventsForTests, getWorkerSyncEventBuffer } from './index.js'
import type { WorkerSyncEventRecord } from './types.js'

describe('contaAzulWorkerSyncEvents subscription resolver', () => {
  it('GivenAuthenticatedTenant_WhenSubscribe_ThenReturnsAsyncIterable', () => {
    resetWorkerSyncEventsForTests()
    const iterable = contaAzulWorkerSyncEventsSubscription(
      {},
      { storeId: 'store-1' },
      { tenantId: 'dev-tenant' } as never
    )

    expect(iterable[Symbol.asyncIterator]).toBeTypeOf('function')
  })

  it('GivenNoTenantInContext_WhenSubscribe_ThenThrowsForbidden', () => {
    expect(() =>
      contaAzulWorkerSyncEventsSubscription({}, {}, {} as never)
    ).toThrow()
  })

  it('GivenWorkerJwt_WhenSubscribe_ThenThrowsForbidden', () => {
    expect(() =>
      contaAzulWorkerSyncEventsSubscription(
        {},
        {},
        {
          tenantId: WORKER_CONTEXT_TENANT_ID,
          authClaims: { sub: WORKER_JWT_SUBJECT },
        } as never
      )
    ).toThrow(GraphQLError)
  })

  it('GivenWorkerLogEvent_WhenResolve_ThenMapsMessageAndLevel', () => {
    const event = {
      type: 'worker.log',
      tenantId: 'dev-tenant',
      message: 'reconcile-once started',
      level: 'info',
      at: '2026-01-01T00:00:00.000Z',
    }

    const mapped = contaAzulWorkerSyncEventsSubscriptionResolve(event)
    expect(mapped.type).toBe('WORKER_LOG')
    expect(mapped.message).toBe('reconcile-once started')
    expect(mapped.level).toBe('info')
  })
})

describe('contaAzulWorkerSyncEvents query message fields', () => {
  it('GivenWorkerLogInBuffer_WhenQuery_ThenReturnsMessageAndLevel', async () => {
    resetWorkerSyncEventsForTests()
    const buffer = getWorkerSyncEventBuffer()
    buffer.clear()
    buffer.append('dev-tenant', {
      type: 'worker.log',
      tenantId: 'dev-tenant',
      message: 'scheduled reconcile started',
      level: 'info',
      at: '2026-01-01T00:00:00.000Z',
      streamId: '1-0',
    } satisfies WorkerSyncEventRecord)

    const { contaAzulWorkerSyncEvents } = await import(
      '../../schema/worker-events/resolvers/Query/contaAzulWorkerSyncEvents.js'
    )
    const result = await contaAzulWorkerSyncEvents(
      {},
      { limit: 5 },
      { tenantId: 'dev-tenant' } as never
    )

    expect(result.events[0]?.type).toBe('WORKER_LOG')
    expect(result.events[0]?.message).toBe('scheduled reconcile started')
    expect(result.events[0]?.level).toBe('info')
  })
})
