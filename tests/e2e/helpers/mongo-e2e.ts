import { MongoClient } from 'mongodb'
import { META_COLLECTION } from '../../../src/lib/cache/meta.js'
import { DEFAULT_DEV_TENANT_ID } from '../../../src/lib/auth/tenant-context.js'

function getMongoUrl(): string {
  const url = process.env.E2E_MONGO_URL
  if (!url) {
    throw new Error('E2E_MONGO_URL not set — globalSetup may not have run')
  }
  return url
}

export async function withE2eMongo<T>(fn: (db: ReturnType<MongoClient['db']>) => Promise<T>): Promise<T> {
  const client = new MongoClient(getMongoUrl())
  await client.connect()
  try {
    return await fn(client.db('conta_azul'))
  } finally {
    await client.close()
  }
}

export async function clearStoreCategories(
  storeId: string,
  tenantId?: string
): Promise<void> {
  await withE2eMongo(async (db) => {
    const filter = tenantId ? { storeId, tenantId } : { storeId }
    await db.collection('conta_azul_categories').deleteMany(filter)
    await db.collection('conta_azul_categories').deleteMany({
      storeId,
      tenantId: { $exists: false },
    })
    await db.collection(META_COLLECTION).deleteMany({
      _id: `conta_azul_categories:${storeId}`,
    })
  })
}

export async function expireCacheMeta(storeId: string): Promise<void> {
  await withE2eMongo(async (db) => {
    await db.collection(META_COLLECTION).updateOne(
      { _id: `conta_azul_categories:${storeId}` },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } }
    )
  })
}

export async function seedStaleCategories(storeId: string): Promise<void> {
  await withE2eMongo(async (db) => {
    const col = db.collection('conta_azul_categories')
    await col.deleteMany({ storeId })
    await col.insertMany([
      {
        id: 'cat-stale-1',
        tenantId: DEFAULT_DEV_TENANT_ID,
        storeId,
        nome: 'Stale Receitas',
        tipo: 'RECEITA',
        _syncedAt: new Date(),
      },
    ])
    await db.collection(META_COLLECTION).replaceOne(
      { _id: `conta_azul_categories:${storeId}` },
      {
        _id: `conta_azul_categories:${storeId}`,
        collection: 'conta_azul_categories',
        storeId,
        syncedAt: new Date(Date.now() - 86_400_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
      { upsert: true }
    )
  })
}
