import type { Db } from 'mongodb'

export async function upsertDocuments(
  db: Db,
  collectionName: string,
  tenantId: string,
  storeId: string,
  documents: Record<string, unknown>[],
  scope?: { saleId?: string }
): Promise<{ synced: number; deleted: number; errors: string[] }> {
  const col = db.collection(collectionName)
  let synced = 0

  for (const doc of documents) {
    const filter: Record<string, unknown> = {
      tenantId,
      storeId,
      id: doc.id,
    }
    if (scope?.saleId) {
      filter.saleId = scope.saleId
    }

    const result = await col.updateOne(filter, { $set: doc }, { upsert: true })
    if (result.upsertedCount > 0 || result.modifiedCount > 0) {
      synced += 1
    }
  }

  return { synced, deleted: 0, errors: [] }
}
