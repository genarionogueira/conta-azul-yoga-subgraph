import type { Db } from 'mongodb'
import { reconcileDocuments } from './reconcile.js'
import { normalizePersistDocuments } from './normalize.js'
import type { PersistDocumentInput, PersistMode, PersistResult } from './types.js'
import { upsertDocuments } from './upsert.js'

export type { PersistDocumentInput, PersistMode, PersistResult } from './types.js'
export { normalizePersistDocument, normalizePersistDocuments } from './normalize.js'
export { upsertDocuments } from './upsert.js'
export { reconcileDocuments } from './reconcile.js'

export function salesCollectionName(): string {
  return process.env.SALES_COLLECTION?.trim() || 'sales'
}

export function saleItemsCollectionName(): string {
  return process.env.SALE_ITEMS_COLLECTION?.trim() || 'sale_items'
}

export function vendedoresCollectionName(): string {
  return process.env.VENDEDORES_COLLECTION?.trim() || 'vendedores'
}

export async function persistToCollection(
  db: Db,
  collectionName: string,
  tenantId: string,
  storeId: string,
  documents: PersistDocumentInput[],
  mode: PersistMode,
  scope?: { saleId?: string; connectionId?: string }
): Promise<Omit<PersistResult, 'storeId'>> {
  const normalized = normalizePersistDocuments(
    documents,
    tenantId,
    storeId,
    scope?.saleId,
    scope?.connectionId
  )
  if (mode === 'RECONCILE') {
    return reconcileDocuments(db, collectionName, tenantId, storeId, normalized, scope)
  }
  return upsertDocuments(db, collectionName, tenantId, storeId, normalized, scope)
}
