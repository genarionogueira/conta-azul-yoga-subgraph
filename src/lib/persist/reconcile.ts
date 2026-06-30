import type { Db } from 'mongodb'

export async function reconcileDocuments(
  db: Db,
  collectionName: string,
  tenantId: string,
  storeId: string,
  documents: Record<string, unknown>[],
  scope?: { saleId?: string }
): Promise<{ synced: number; deleted: number; errors: string[] }> {
  const col = db.collection(collectionName)

  const listFilter: Record<string, unknown> = { tenantId, storeId }
  if (scope?.saleId) {
    listFilter.saleId = scope.saleId
  }

  const existingDocs = await col.find(listFilter).limit(10_000).toArray()
  const existingById = new Map<string, Record<string, unknown>>()
  for (const doc of existingDocs) {
    if (doc.id != null) {
      existingById.set(String(doc.id), doc)
    }
  }

  const apiIds = new Set(documents.map((doc) => String(doc.id)))
  let synced = 0

  for (const doc of documents) {
    const id = String(doc.id)
    const filter: Record<string, unknown> = { tenantId, storeId, id }
    if (scope?.saleId) {
      filter.saleId = scope.saleId
    }

    const existing = existingById.get(id)
    if (existing === undefined) {
      await col.insertOne(doc)
      synced += 1
      continue
    }

    const result = await col.updateOne(filter, { $set: doc })
    if (result.modifiedCount > 0) {
      synced += 1
    }
  }

  const staleIds = [...existingById.keys()].filter((id) => !apiIds.has(id))
  let deleted = 0
  if (staleIds.length > 0) {
    const deleteFilter: Record<string, unknown> = {
      tenantId,
      storeId,
      id: { $in: staleIds },
    }
    if (scope?.saleId) {
      deleteFilter.saleId = scope.saleId
    }
    const result = await col.deleteMany(deleteFilter)
    deleted = result.deletedCount
  }

  return { synced, deleted, errors: [] }
}
