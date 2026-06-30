import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreSyncJobRepository } from '../../src/lib/sync/store-sync-job-repository.js'

function createMockCollection() {
  const docs = new Map<string, Record<string, unknown>>()
  return {
    insertOne: vi.fn(async (doc: Record<string, unknown>) => {
      docs.set(String(doc.jobId), { ...doc })
    }),
    findOne: vi.fn(async (query: Record<string, unknown>) => {
      if (query.jobId) {
        return docs.get(String(query.jobId)) ?? null
      }
      for (const doc of docs.values()) {
        if (
          doc.tenantId === query.tenantId &&
          doc.storeId === query.storeId &&
          doc.phase === 'BACKFILL' &&
          ['PENDING', 'RUNNING'].includes(String(doc.status))
        ) {
          return doc
        }
      }
      return null
    }),
    findOneAndUpdate: vi.fn(
      async (
        query: Record<string, unknown>,
        update: { $set: Record<string, unknown>; $setOnInsert?: Record<string, unknown> },
        options: { upsert?: boolean; returnDocument?: string }
      ) => {
        const jobId = String(query.jobId)
        const existing = docs.get(jobId) ?? {}
        const merged = {
          ...existing,
          ...update.$set,
          ...(options.upsert ? update.$setOnInsert ?? {} : {}),
          jobId,
        }
        docs.set(jobId, merged)
        return options.returnDocument === 'after' ? merged : existing
      }
    ),
    _docs: docs,
  }
}

describe('StoreSyncJobRepository', () => {
  let collection: ReturnType<typeof createMockCollection>
  let repo: StoreSyncJobRepository

  beforeEach(() => {
    collection = createMockCollection()
    repo = new StoreSyncJobRepository(() => ({ collection: () => collection }) as never)
  })

  it('creates pending backfill job with sales chunk total', async () => {
    const doc = await repo.createPending({
      jobId: 'job-1',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      phase: 'BACKFILL',
      salesChunkTotal: 3,
    })
    expect(doc.status).toBe('PENDING')
    expect(doc.resources.find((r) => r.resource === 'sales')?.total).toBe(3)
  })

  it('finds active backfill by tenant and store', async () => {
    await repo.createPending({
      jobId: 'job-1',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      phase: 'BACKFILL',
      salesChunkTotal: 1,
    })
    const active = await repo.findActiveBackfill('tenant-1', 'store-1')
    expect(active?.jobId).toBe('job-1')
  })

  it('upsertProgress computes percentage', async () => {
    await repo.createPending({
      jobId: 'job-1',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      phase: 'BACKFILL',
      salesChunkTotal: 1,
    })
    const updated = await repo.upsertProgress({
      jobId: 'job-1',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      phase: 'BACKFILL',
      status: 'RUNNING',
      resources: [
        { resource: 'categories', total: 1, completed: 1, status: 'COMPLETE' },
        { resource: 'sales', total: 1, completed: 1, status: 'COMPLETE' },
        { resource: 'sale_items', total: 2, completed: 2, status: 'COMPLETE' },
        { resource: 'vendedores', total: 1, completed: 1, status: 'COMPLETE' },
      ],
    })
    expect(updated.percentage).toBe(100)
    expect(updated.status).toBe('RUNNING')
  })
})
