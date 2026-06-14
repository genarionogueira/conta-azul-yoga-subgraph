import type { Db } from 'mongodb'

export const META_COLLECTION = 'datasource_cache_meta'

export interface CacheMetaDocument {
  _id: string
  collection: string
  storeId: string
  syncedAt: Date
  expiresAt: Date
  dataInicio?: string
  dataFim?: string
}

export interface DateRange {
  dataInicio: string
  dataFim: string
}

export function metaKey(
  collection: string,
  storeId: string,
  range?: DateRange
): string {
  if (range) {
    return `${collection}:${storeId}:${range.dataInicio}_${range.dataFim}`
  }
  return `${collection}:${storeId}`
}

function parseMetaKey(key: string): {
  collection: string
  storeId: string
  dataInicio?: string
  dataFim?: string
} {
  const parts = key.split(':')
  if (parts.length < 2) {
    throw new Error(`Invalid cache meta key: ${key}`)
  }
  const collection = parts[0]
  const storeId = parts[1]
  if (parts.length === 2) {
    return { collection, storeId }
  }
  const rangePart = parts.slice(2).join(':')
  const rangeSep = rangePart.lastIndexOf('_')
  if (rangeSep <= 0) {
    return { collection, storeId }
  }
  return {
    collection,
    storeId,
    dataInicio: rangePart.slice(0, rangeSep),
    dataFim: rangePart.slice(rangeSep + 1),
  }
}

export async function isFresh(key: string, db: Db, now = new Date()): Promise<boolean> {
  try {
    const doc = await db
      .collection<CacheMetaDocument>(META_COLLECTION)
      .findOne({ _id: key })
    if (!doc) return false
    return doc.expiresAt.getTime() > now.getTime()
  } catch {
    return false
  }
}

export async function writeMeta(
  key: string,
  ttlMs: number,
  db: Db,
  now = new Date()
): Promise<Date> {
  const parsed = parseMetaKey(key)
  const expiresAt = new Date(now.getTime() + ttlMs)
  const doc: CacheMetaDocument = {
    _id: key,
    collection: parsed.collection,
    storeId: parsed.storeId,
    syncedAt: now,
    expiresAt,
  }
  if (parsed.dataInicio) doc.dataInicio = parsed.dataInicio
  if (parsed.dataFim) doc.dataFim = parsed.dataFim
  await db
    .collection<CacheMetaDocument>(META_COLLECTION)
    .replaceOne({ _id: key }, doc, { upsert: true })
  return expiresAt
}
