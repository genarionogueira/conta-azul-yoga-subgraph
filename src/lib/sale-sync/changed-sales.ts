import type { Db } from 'mongodb'
import type { SaleItem } from './types.js'

export interface SyncSalesResult {
  storeId: string
  synced: number
  deleted: number
  errors: string[]
  changedSaleIds: string[]
}

export async function findChangedSaleIds(
  db: Db,
  collectionName: string,
  tenantId: string,
  storeId: string,
  items: SaleItem[]
): Promise<string[]> {
  if (items.length === 0) return []
  const ids = items.map((item) => item.id)
  const col = db.collection(collectionName)
  const existing = await col
    .find(
      { tenantId, storeId, id: { $in: ids } },
      { projection: { id: 1, dataAlteracao: 1, _itemsSyncedDataAlteracao: 1 } }
    )
    .toArray()

  const existingById = new Map<string, Record<string, unknown>>()
  for (const doc of existing) {
    if (doc.id != null) {
      existingById.set(String(doc.id), doc)
    }
  }

  const changed: string[] = []
  for (const item of items) {
    const doc = existingById.get(item.id)
    if (!doc) {
      changed.push(item.id)
      continue
    }
    const syncedAt = doc._itemsSyncedDataAlteracao
    const current = item.dataAlteracao ?? null
    if (syncedAt !== current) {
      changed.push(item.id)
    }
  }
  return changed
}

export async function markSaleItemsSynced(
  db: Db,
  collectionName: string,
  tenantId: string,
  storeId: string,
  saleId: string,
  dataAlteracao: string | null
): Promise<void> {
  await db.collection(collectionName).updateOne(
    { tenantId, storeId, id: saleId },
    { $set: { _itemsSyncedDataAlteracao: dataAlteracao } }
  )
}
