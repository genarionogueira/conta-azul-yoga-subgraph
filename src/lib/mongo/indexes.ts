import type { Db } from 'mongodb'
import { MongoServerError } from 'mongodb'
import { META_COLLECTION } from '../cache/meta.js'

async function createIndexSafe(
  col: ReturnType<Db['collection']>,
  key: Parameters<ReturnType<Db['collection']>['createIndex']>[0],
  options?: Parameters<ReturnType<Db['collection']>['createIndex']>[1]
): Promise<void> {
  try {
    await col.createIndex(key, options)
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 85) {
      // Index exists with the same key but different options (e.g. legacy TTL).
      return
    }
    throw err
  }
}

export async function ensureCategoriesIndexes(db: Db): Promise<void> {
  const col = db.collection('conta_azul_categories')
  await createIndexSafe(col, { storeId: 1 })
  await createIndexSafe(col, { tipo: 1 })
  await createIndexSafe(col, { storeId: 1, tipo: 1 })
  await createIndexSafe(col, { _syncedAt: 1 })

  const meta = db.collection(META_COLLECTION)
  await createIndexSafe(meta, { expiresAt: 1 })
  await createIndexSafe(meta, { collection: 1, storeId: 1 })
}
