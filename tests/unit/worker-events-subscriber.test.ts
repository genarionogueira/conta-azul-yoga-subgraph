import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkerSyncEventBuffer } from '../../src/lib/worker-events/buffer.js'
import { WorkerSyncEventSubscriber } from '../../src/lib/worker-events/subscriber.js'

function createRedisMock(options: {
  scanSequences?: string[][]
  streamEntries?: Record<string, Array<[string, string[]]>>
}) {
  const scanSequences = [...(options.scanSequences ?? [])]
  const streamEntries = options.streamEntries ?? {}

  return {
    scan: vi.fn(async () => {
      const keys = scanSequences.shift() ?? []
      return ['0', keys] as [string, string[]]
    }),
    xrevrange: vi.fn(async (key: string) => streamEntries[key] ?? []),
    xread: vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return null
    }),
  }
}

describe('WorkerSyncEventSubscriber', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.DEFAULT_DEV_TENANT_ID
  })

  it('discovers new tenants after startup and seeds their buffer', async () => {
    process.env.DEFAULT_DEV_TENANT_ID = 'dev-tenant'
    const buffer = new WorkerSyncEventBuffer(100)
    const redis = createRedisMock({
      scanSequences: [
        ['conta_azul:worker:events:dev-tenant'],
        [],
        ['conta_azul:worker:events:dev-tenant', 'conta_azul:worker:events:tenant-new'],
        [],
      ],
      streamEntries: {
        'conta_azul:worker:events:tenant-new': [
          [
            '1-0',
            [
              'payload',
              JSON.stringify({
                type: 'worker.log',
                tenantId: 'tenant-new',
                message: 'hello',
                at: '2026-06-28T00:00:00.000Z',
                storeId: 'store-1',
              }),
            ],
          ],
        ],
      },
    })

    const subscriber = new WorkerSyncEventSubscriber(redis as never, buffer, 10)
    await subscriber.start()

    await vi.waitFor(
      () => {
        expect(buffer.list('tenant-new', { limit: 10 })).toEqual([
          expect.objectContaining({
            tenantId: 'tenant-new',
            message: 'hello',
            storeId: 'store-1',
          }),
        ])
      },
      { timeout: 5000 }
    )

    await subscriber.stop()
  })
})
