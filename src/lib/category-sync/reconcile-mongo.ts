import type { Db } from 'mongodb'
import type { CategoryItem } from './types.js'

function categoryFieldsMatch(
  existing: Record<string, unknown>,
  item: CategoryItem
): boolean {
  return existing.nome === item.nome && existing.tipo === item.tipo
}

export async function reconcileCategoriesToMongo(
  db: Db,
  collectionName: string,
  tenantId: string,
  storeId: string,
  items: CategoryItem[],
  connectionId?: string
): Promise<{ synced: number; deleted: number }> {
  const col = db.collection(collectionName)

  const existingDocs = await col
    .find({ tenantId, storeId })
    .limit(10_000)
    .toArray()

  const existingById = new Map<string, Record<string, unknown>>()
  for (const doc of existingDocs) {
    if (doc.id != null) {
      existingById.set(String(doc.id), doc)
    }
  }

  const apiIds = new Set(items.map((item) => item.id))
  let inserted = 0
  let updated = 0
  const now = new Date()

  for (const item of items) {
    const existing = existingById.get(item.id)
    if (existing === undefined) {
      await col.insertOne({
        ...item,
        tenantId,
        storeId,
        ...(connectionId ? { connectionId } : {}),
        _syncedAt: now,
      })
      inserted += 1
      continue
    }

    if (categoryFieldsMatch(existing, item)) {
      continue
    }

    await col.updateOne(
      { tenantId, storeId, id: item.id },
      {
        $set: {
          nome: item.nome,
          tipo: item.tipo,
          _syncedAt: now,
        },
      }
    )
    updated += 1
  }

  const staleIds = [...existingById.keys()].filter((id) => !apiIds.has(id))
  let deleted = 0
  if (staleIds.length > 0) {
    const result = await col.deleteMany({
      tenantId,
      storeId,
      id: { $in: staleIds },
    })
    deleted = result.deletedCount
  }

  return { synced: inserted + updated, deleted }
}
