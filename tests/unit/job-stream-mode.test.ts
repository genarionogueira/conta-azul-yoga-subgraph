import { describe, expect, it } from 'vitest'
import {
  parseJobPayload,
  serializeJobPayload,
  type SyncJobPayload,
} from '../../src/lib/jobs/job-stream.js'

describe('job-stream mode', () => {
  it('round-trips mode BACKFILL and chunk fields', () => {
    const payload: SyncJobPayload = {
      type: 'reconcile.store',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      trigger: 'connect',
      attempt: 0,
      enqueuedAt: '2026-01-01T00:00:00Z',
      mode: 'BACKFILL',
      jobId: 'job-123',
      windowStart: '2026-01-01',
      windowEnd: '2026-01-31',
      chunkIndex: 0,
      chunkTotal: 2,
    }
    const parsed = parseJobPayload(serializeJobPayload(payload))
    expect(parsed.mode).toBe('BACKFILL')
    expect(parsed.jobId).toBe('job-123')
    expect(parsed.windowStart).toBe('2026-01-01')
    expect(parsed.chunkIndex).toBe(0)
  })

  it('defaults mode to INCREMENTAL when absent', () => {
    const raw = JSON.stringify({
      type: 'reconcile.store',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      trigger: 'scheduled',
      attempt: 0,
      enqueuedAt: '2026-01-01T00:00:00Z',
    })
    expect(parseJobPayload(raw).mode).toBe('INCREMENTAL')
  })
})
