import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupStoreData } from '../../src/lib/worker-client/cleanup-store-data.js'

describe('cleanupStoreData', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('GivenWorker200_WhenCleanupStoreData_ThenResolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'deleted', deletedCount: 2 }), { status: 200 })
      )
    )

    await expect(cleanupStoreData('tenant-1', 'store-1')).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/internal/disconnect-store'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ tenantId: 'tenant-1', storeId: 'store-1' }),
      })
    )
  })

  it('GivenWorker500_WhenCleanupStoreData_ThenThrows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))

    await expect(cleanupStoreData('tenant-1', 'store-1')).rejects.toThrow(
      'Worker disconnect-store failed: 500'
    )
  })
})
