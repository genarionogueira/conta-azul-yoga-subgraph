import type { Db } from 'mongodb'
import { META_COLLECTION } from '../cache/meta.js'

export async function ensureCategoriesIndexes(db: Db): Promise<void> {
  const col = db.collection('conta_azul_categories')
  await col.createIndex({ storeId: 1 })
  await col.createIndex({ tipo: 1 })
  await col.createIndex({ storeId: 1, tipo: 1 })
  await col.createIndex({ _syncedAt: 1 })

  const meta = db.collection(META_COLLECTION)
  await meta.createIndex({ expiresAt: 1 })
  await meta.createIndex({ collection: 1, storeId: 1 })
}
