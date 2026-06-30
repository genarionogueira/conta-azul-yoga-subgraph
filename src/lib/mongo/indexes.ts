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

export async function ensureSalesIndexes(db: Db): Promise<void> {
  const col = db.collection('sales')
  await createIndexSafe(col, { storeId: 1 })
  await createIndexSafe(col, { data: 1 })
  await createIndexSafe(col, { tipo: 1 })
  await createIndexSafe(col, { situacaoNome: 1 })
  await createIndexSafe(col, { storeId: 1, tipo: 1 })
  await createIndexSafe(col, { _syncedAt: 1 })
  await createIndexSafe(col, { tenantId: 1, storeId: 1 })
  await createIndexSafe(col, { tenantId: 1, storeId: 1, id: 1 })
}

export async function ensureSaleItemIndexes(db: Db): Promise<void> {
  const col = db.collection('sale_items')
  await createIndexSafe(col, { storeId: 1 })
  await createIndexSafe(col, { saleId: 1 })
  await createIndexSafe(col, { storeId: 1, saleId: 1 })
  await createIndexSafe(col, { nome: 1 })
  await createIndexSafe(col, { tipo: 1 })
  await createIndexSafe(col, { _syncedAt: 1 })
  await createIndexSafe(col, { tenantId: 1, storeId: 1 })
  await createIndexSafe(col, { tenantId: 1, storeId: 1, id: 1 })
}

export async function ensureCategoriesIndexes(db: Db): Promise<void> {
  const col = db.collection('conta_azul_categories')
  await createIndexSafe(col, { storeId: 1 })
  await createIndexSafe(col, { tipo: 1 })
  await createIndexSafe(col, { storeId: 1, tipo: 1 })
  await createIndexSafe(col, { _syncedAt: 1 })
  await createIndexSafe(col, { tenantId: 1, storeId: 1 })
  await createIndexSafe(col, { tenantId: 1, storeId: 1, id: 1 })

  const meta = db.collection(META_COLLECTION)
  await createIndexSafe(meta, { expiresAt: 1 })
  await createIndexSafe(meta, { collection: 1, storeId: 1 })
}

export async function ensureVendedoresIndexes(db: Db): Promise<void> {
  const col = db.collection('vendedores')
  await createIndexSafe(col, { storeId: 1 })
  await createIndexSafe(col, { nome: 1 })
  await createIndexSafe(col, { ativo: 1 })
  await createIndexSafe(col, { _syncedAt: 1 })
  await createIndexSafe(col, { tenantId: 1, storeId: 1 })
  await createIndexSafe(col, { tenantId: 1, storeId: 1, id: 1 })
}

function connectionsCollectionName(): string {
  return process.env.CONNECTIONS_COLLECTION?.trim() || 'conta_azul_connections'
}

export async function ensureConnectionsIndexes(db: Db): Promise<void> {
  const col = db.collection(connectionsCollectionName())
  await createIndexSafe(col, { tenantId: 1, connectionId: 1 }, { unique: true })
  await createIndexSafe(
    col,
    { tenantId: 1, storeId: 1 },
    { unique: true, partialFilterExpression: { status: 'ACTIVE' } }
  )
  await createIndexSafe(
    col,
    { tenantId: 1, contaAzulAccountId: 1 },
    { unique: true, partialFilterExpression: { status: 'ACTIVE' } }
  )
  await createIndexSafe(col, { tenantId: 1, id: 1 }, { unique: true, sparse: true })
  await createIndexSafe(col, { tenantId: 1, connectedAt: -1 })
}

function storeSyncJobsCollectionName(): string {
  return process.env.STORE_SYNC_JOBS_COLLECTION?.trim() || 'store_sync_jobs'
}

export async function ensureStoreSyncJobIndexes(db: Db): Promise<void> {
  const col = db.collection(storeSyncJobsCollectionName())
  await createIndexSafe(col, { tenantId: 1, jobId: 1 }, { unique: true })
  await createIndexSafe(col, { tenantId: 1, storeId: 1, status: 1 })
}
