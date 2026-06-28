import { describe, expect, it, vi, beforeEach } from 'vitest'
import { GraphQLError } from 'graphql'
import { reconcileAll } from '../../src/schema/sync/resolvers/Mutation/syncMutations.js'
import { WORKER_CONTEXT_TENANT_ID } from '../../src/lib/auth/tenant-context.js'
import { WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import { createTestContext } from '../helpers/test-context.js'

const mockReconcileAll = vi.fn()

vi.mock('../../src/lib/category-sync/index.js', () => ({
  categorySyncService: {
    reconcileAll: (...args: unknown[]) => mockReconcileAll(...args),
  },
}))

describe('sync mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReconcileAll.mockResolvedValue({
      status: 'success',
      syncedCount: 2,
      storesProcessed: 1,
      successCount: 1,
      errorCount: 0,
      storeResults: [
        {
          tenantId: 'tenant-1',
          storeId: 'store-1',
          status: 'success',
          syncedCount: 2,
          skippedCount: 0,
        },
      ],
    })
  })

  it('GivenWorkerContext_WhenReconcileAll_ThenCallsCategorySyncService', async () => {
    const context = createTestContext({
      tenantId: WORKER_CONTEXT_TENANT_ID,
      authClaims: { sub: WORKER_JWT_SUBJECT },
    })

    const result = await reconcileAll(null, { trigger: 'scheduled' }, context)

    expect(mockReconcileAll).toHaveBeenCalledWith('scheduled')
    expect(result.status).toBe('success')
    expect(result.syncedCount).toBe(2)
    expect(result.storeResults).toHaveLength(1)
  })

  it('GivenNonWorkerContext_WhenReconcileAll_ThenThrowsForbidden', async () => {
    const context = createTestContext({
      tenantId: 'tenant-1',
      authClaims: { sub: 'other-client' },
    })

    await expect(reconcileAll(null, { trigger: 'scheduled' }, context)).rejects.toThrow(
      GraphQLError
    )
    await expect(reconcileAll(null, { trigger: 'scheduled' }, context)).rejects.toThrow(
      /worker authentication required/
    )
    expect(mockReconcileAll).not.toHaveBeenCalled()
  })
})
