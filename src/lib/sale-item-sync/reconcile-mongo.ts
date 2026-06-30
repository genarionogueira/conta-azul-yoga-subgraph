import type { Db } from 'mongodb'
import type { SaleLineItem } from './types.js'

function lineFieldsMatch(existing: Record<string, unknown>, item: SaleLineItem): boolean {
  return (
    existing.saleId === item.saleId &&
    existing.produtoId === item.produtoId &&
    existing.nome === item.nome &&
    existing.descricao === item.descricao &&
    existing.tipo === item.tipo &&
    existing.quantidade === item.quantidade &&
    existing.valor === item.valor &&
    existing.custo === item.custo
  )
}

export async function reconcileSaleItemsForSale(
  db: Db,
  collectionName: string,
  tenantId: string,
  storeId: string,
  saleId: string,
  items: SaleLineItem[],
  connectionId?: string
): Promise<{ synced: number; deleted: number }> {
  const col = db.collection(collectionName)

  const existingDocs = await col.find({ tenantId, storeId, saleId }).toArray()
  const existingById = new Map<string, Record<string, unknown>>()
  for (const doc of existingDocs) {
    if (doc.id != null) {
      existingById.set(String(doc.id), doc)
    }
  }

  const apiIds = new Set(items.map((item) => item.id))
  let synced = 0
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
      synced += 1
      continue
    }

    if (lineFieldsMatch(existing, item)) {
      continue
    }

    await col.updateOne(
      { tenantId, storeId, id: item.id },
      {
        $set: {
          saleId: item.saleId,
          produtoId: item.produtoId ?? null,
          nome: item.nome ?? null,
          descricao: item.descricao ?? null,
          tipo: item.tipo ?? null,
          quantidade: item.quantidade ?? null,
          valor: item.valor ?? null,
          custo: item.custo ?? null,
          _syncedAt: now,
        },
      }
    )
    synced += 1
  }

  const staleIds = [...existingById.keys()].filter((id) => !apiIds.has(id))
  let deleted = 0
  if (staleIds.length > 0) {
    const result = await col.deleteMany({
      tenantId,
      storeId,
      saleId,
      id: { $in: staleIds },
    })
    deleted = result.deletedCount
  }

  return { synced, deleted }
}

export async function pruneOrphanSaleItems(
  db: Db,
  collectionName: string,
  tenantId: string,
  storeId: string,
  currentSaleIds: string[]
): Promise<number> {
  const col = db.collection(collectionName)
  const filter =
    currentSaleIds.length === 0
      ? { tenantId, storeId }
      : { tenantId, storeId, saleId: { $nin: currentSaleIds } }

  const result = await col.deleteMany(filter)
  return result.deletedCount
}
