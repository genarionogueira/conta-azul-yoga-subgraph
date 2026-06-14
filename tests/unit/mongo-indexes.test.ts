import { describe, expect, it, vi } from 'vitest'
import { ensureCategoriesIndexes } from '../../src/lib/mongo/indexes.js'
import type { Db } from 'mongodb'

describe('ensureCategoriesIndexes', () => {
  it('GivenDb_WhenEnsuringIndexes_ThenSyncedAtIndexHasNoTtl', async () => {
    const createIndex = vi.fn().mockResolvedValue('ok')
    const db = {
      collection: vi.fn().mockReturnValue({ createIndex }),
    } as unknown as Db

    await ensureCategoriesIndexes(db)

    const syncedAtCall = createIndex.mock.calls.find(
      (call) => JSON.stringify(call[0]) === JSON.stringify({ _syncedAt: 1 })
    )
    expect(syncedAtCall).toBeDefined()
    expect(syncedAtCall?.[1]).toBeUndefined()

    const expiresAtCall = createIndex.mock.calls.find(
      (call) => JSON.stringify(call[0]) === JSON.stringify({ expiresAt: 1 })
    )
    expect(expiresAtCall).toBeDefined()
  })
})
