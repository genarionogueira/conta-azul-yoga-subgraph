import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TenantRequiredError } from '../../src/lib/auth/tenant-context.js'
import { activeStoreSyncJob } from '../../src/schema/sync/resolvers/Query/storeSyncProgressQueries.js'
import { createTestContext } from '../helpers/test-context.js'

const mockFindActiveJob = vi.fn()
const mockFindLatestFailedJob = vi.fn()

vi.mock('../../src/lib/mongo/connection.js', () => ({
  getDb: () => ({}),
}))

vi.mock('../../src/lib/sync/store-sync-job-repository.js', () => ({
  StoreSyncJobRepository: class {
    findActiveJob = mockFindActiveJob
    findLatestFailedJob = mockFindLatestFailedJob
  },
  toGraphqlStoreSyncJob: (doc: Record<string, unknown>) => ({
    jobId: doc.jobId,
    tenantId: doc.tenantId,
    storeId: doc.storeId,
    phase: doc.phase,
    status: doc.status,
    percentage: doc.percentage,
    resources: [],
    startedAt: new Date(String(doc.startedAt ?? Date.now())).toISOString(),
    updatedAt: new Date(String(doc.updatedAt ?? Date.now())).toISOString(),
    errorMessage: doc.errorMessage ?? null,
  }),
}))

function runningJob(overrides: Record<string, unknown> = {}) {
  const now = new Date()
  return {
    jobId: 'job-1',
    tenantId: 'tenant-1',
    storeId: 'store-1',
    phase: 'BACKFILL',
    status: 'RUNNING',
    percentage: 42,
    resources: [],
    startedAt: now,
    updatedAt: now,
    errorMessage: null,
    ...overrides,
  }
}

describe('activeStoreSyncJob query resolver', () => {
  beforeEach(() => {
    mockFindActiveJob.mockReset()
    mockFindLatestFailedJob.mockReset()
  })

  it('GivenActiveBackfill_WhenQuery_ThenReturnsRunningJob', async () => {
    mockFindActiveJob.mockResolvedValue(runningJob())
    mockFindLatestFailedJob.mockResolvedValue(null)

    const result = await activeStoreSyncJob(
      null,
      { storeId: 'store-1' },
      createTestContext({ tenantId: 'tenant-1' })
    )

    expect(result?.percentage).toBe(42)
    expect(result?.status).toBe('RUNNING')
  })

  it('GivenDisconnectJobRunning_WhenQuery_ThenReturnsDisconnectJob', async () => {
    mockFindActiveJob.mockResolvedValue(
      runningJob({ phase: 'DISCONNECT', percentage: 67, status: 'RUNNING' })
    )
    mockFindLatestFailedJob.mockResolvedValue(null)

    const result = await activeStoreSyncJob(
      null,
      { storeId: 'store-1' },
      createTestContext({ tenantId: 'tenant-1' })
    )

    expect(result?.phase).toBe('DISCONNECT')
    expect(result?.percentage).toBe(67)
  })

  it('GivenCompleteLatestJob_WhenQuery_ThenReturnsNull', async () => {
    mockFindActiveJob.mockResolvedValue(null)
    mockFindLatestFailedJob.mockResolvedValue(null)

    const result = await activeStoreSyncJob(
      null,
      { storeId: 'store-1' },
      createTestContext({ tenantId: 'tenant-1' })
    )

    expect(result).toBeNull()
  })

  it('GivenFailedLatestJob_WhenQuery_ThenReturnsFailedJob', async () => {
    mockFindActiveJob.mockResolvedValue(null)
    mockFindLatestFailedJob.mockResolvedValue(
      runningJob({ status: 'FAILED', percentage: 10, errorMessage: 'sync failed' })
    )

    const result = await activeStoreSyncJob(
      null,
      { storeId: 'store-1' },
      createTestContext({ tenantId: 'tenant-1' })
    )

    expect(result?.status).toBe('FAILED')
    expect(result?.errorMessage).toBe('sync failed')
  })

  it('GivenMissingTenant_WhenQuery_ThenThrows', async () => {
    await expect(
      activeStoreSyncJob(null, { storeId: 'store-1' }, createTestContext({ tenantId: undefined }))
    ).rejects.toThrow(TenantRequiredError)
  })
})
