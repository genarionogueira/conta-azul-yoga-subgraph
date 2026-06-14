import type { Db } from 'mongodb'

export async function ensureCategoriesIndexes(db: Db): Promise<void> {
  const col = db.collection('conta_azul_categories')
  await col.createIndex({ storeId: 1 })
  await col.createIndex({ tipo: 1 })
  await col.createIndex({ storeId: 1, tipo: 1 })
  await col.createIndex({ _syncedAt: 1 }, { expireAfterSeconds: 86400 })
}
