import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isFresh, metaKey, writeMeta } from '../../../src/lib/cache/meta.js'
import type { Db } from 'mongodb'

function createMockDb(doc: Record<string, unknown> | null = null) {
  const findOne = vi.fn().mockResolvedValue(doc)
  const replaceOne = vi.fn().mockResolvedValue({ upsertedCount: 1 })
  const collection = vi.fn().mockReturnValue({ findOne, replaceOne })
  const db = { collection } as unknown as Db
  return { db, findOne, replaceOne, collection }
}

describe('metaKey', () => {
  it('GivenCollectionAndStore_WhenBuildingKey_ThenUsesColonSeparator', () => {
    expect(metaKey('conta_azul_categories', 'store-1')).toBe(
      'conta_azul_categories:store-1'
    )
  })
})

describe('isFresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GivenMissingDoc_WhenCheckingFreshness_ThenReturnsFalse', async () => {
    const { db } = createMockDb(null)
    expect(await isFresh('conta_azul_categories:store-1', db)).toBe(false)
  })

  it('GivenFutureExpiresAt_WhenCheckingFreshness_ThenReturnsTrue', async () => {
    const { db } = createMockDb({
      expiresAt: new Date(Date.now() + 60_000),
    })
    expect(await isFresh('conta_azul_categories:store-1', db)).toBe(true)
  })

  it('GivenExpiresAtExactlyNow_WhenCheckingFreshness_ThenReturnsFalse', async () => {
    const now = new Date('2026-06-14T12:00:00.000Z')
    const { db } = createMockDb({ expiresAt: now })
    expect(await isFresh('conta_azul_categories:store-1', db, now)).toBe(false)
  })

  it('GivenExpiresAtOneMsAgo_WhenCheckingFreshness_ThenReturnsFalse', async () => {
    const now = new Date('2026-06-14T12:00:00.000Z')
    const { db } = createMockDb({
      expiresAt: new Date(now.getTime() - 1),
    })
    expect(await isFresh('conta_azul_categories:store-1', db, now)).toBe(false)
  })

  it('GivenDbReadError_WhenCheckingFreshness_ThenReturnsFalse', async () => {
    const findOne = vi.fn().mockRejectedValue(new Error('db down'))
    const db = {
      collection: vi.fn().mockReturnValue({ findOne }),
    } as unknown as Db
    expect(await isFresh('conta_azul_categories:store-1', db)).toBe(false)
  })
})

describe('writeMeta', () => {
  it('GivenTtlMs_WhenWritingMeta_ThenUpsertsWithExpiresAt', async () => {
    const { db, replaceOne } = createMockDb()
    const now = new Date('2026-06-14T12:00:00.000Z')
    const expiresAt = await writeMeta(
      'conta_azul_categories:store-1',
      3_600_000,
      db,
      now
    )
    expect(expiresAt.toISOString()).toBe('2026-06-14T13:00:00.000Z')
    expect(replaceOne).toHaveBeenCalledWith(
      { _id: 'conta_azul_categories:store-1' },
      expect.objectContaining({
        collection: 'conta_azul_categories',
        storeId: 'store-1',
        syncedAt: now,
        expiresAt,
      }),
      { upsert: true }
    )
  })

  it('GivenSecondWrite_WhenWritingMeta_ThenReplacesSyncedAt', async () => {
    const { db, replaceOne } = createMockDb()
    const first = new Date('2026-06-14T12:00:00.000Z')
    const second = new Date('2026-06-14T13:00:00.000Z')
    await writeMeta('conta_azul_categories:store-1', 1000, db, first)
    await writeMeta('conta_azul_categories:store-1', 2000, db, second)
    expect(replaceOne).toHaveBeenLastCalledWith(
      { _id: 'conta_azul_categories:store-1' },
      expect.objectContaining({ syncedAt: second }),
      { upsert: true }
    )
  })
})
