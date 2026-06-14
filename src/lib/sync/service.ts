import type { Db } from 'mongodb'
import type { SyncConfig, SyncResult } from './types.js'

export async function syncToMongo(db: Db, config: SyncConfig): Promise<SyncResult> {
  const { collectionName, storeId, fetcher } = config
  const syncedAt = new Date().toISOString()
  try {
    const items = await fetcher()
    const col = db.collection(collectionName)
    const docs = items.map((item) => ({
      ...item,
      storeId,
      _syncedAt: new Date(),
    }))
    await col.deleteMany({ storeId })
    if (docs.length > 0) await col.insertMany(docs)
    return { syncedCount: docs.length, syncedAt, status: 'success' }
  } catch (err) {
    return {
      syncedCount: 0,
      syncedAt,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    }
  }
}
