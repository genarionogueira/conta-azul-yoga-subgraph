import { randomUUID } from 'node:crypto'
import type { Db } from 'mongodb'
import type { ConnectionDocument, ConnectionStatus } from './types.js'
import { normalizeConnectionDocument, resolveStoreId } from './types.js'

function connectionsCollectionName(): string {
  return process.env.CONNECTIONS_COLLECTION?.trim() || 'conta_azul_connections'
}

const SYNCED_COLLECTIONS = [
  'conta_azul_categories',
  'sales',
  'sale_items',
  'vendedores',
] as const

export class ConnectionRepository {
  constructor(private readonly getDb: () => Db) {}

  private collection() {
    return this.getDb().collection<ConnectionDocument>(connectionsCollectionName())
  }

  async create(
    tenantId: string,
    storeId: string,
    contaAzulAccountId: string,
    name: string
  ): Promise<ConnectionDocument> {
    const now = new Date()
    const connectionId = randomUUID()
    const displayName = name.trim() || storeId
    const doc: ConnectionDocument = {
      tenantId,
      connectionId,
      storeId,
      contaAzulAccountId,
      name: displayName,
      status: 'ACTIVE',
      connectedAt: now,
      disconnectedAt: null,
      updatedAt: now,
    }
    await this.collection().insertOne(doc)
    return doc
  }

  async upsertActiveName(tenantId: string, storeId: string, name: string): Promise<void> {
    const now = new Date()
    const displayName = name.trim() || storeId
    const existing = await this.findActiveByStoreId(tenantId, storeId)
    if (existing) {
      await this.collection().updateOne(
        { tenantId, connectionId: existing.connectionId },
        { $set: { name: displayName, updatedAt: now } }
      )
      return
    }

    await this.collection().updateOne(
      { tenantId, $or: [{ storeId }, { id: storeId }] },
      {
        $set: { name: displayName, updatedAt: now, storeId, status: 'ACTIVE' as ConnectionStatus },
        $setOnInsert: {
          tenantId,
          connectionId: randomUUID(),
          contaAzulAccountId: '',
          connectedAt: now,
          disconnectedAt: null,
        },
      },
      { upsert: true }
    )
  }

  /** @deprecated use upsertActiveName — kept for gradual migration */
  async upsert(tenantId: string, id: string, name: string): Promise<void> {
    await this.upsertActiveName(tenantId, id, name)
  }

  async softDisconnect(tenantId: string, connectionId: string): Promise<void> {
    const now = new Date()
    await this.collection().updateOne(
      { tenantId, connectionId },
      {
        $set: {
          status: 'DISCONNECTED' as ConnectionStatus,
          disconnectedAt: now,
          updatedAt: now,
        },
      }
    )
  }

  async reactivate(
    tenantId: string,
    connectionId: string,
    storeId: string,
    name: string
  ): Promise<void> {
    const now = new Date()
    const displayName = name.trim() || storeId
    await this.collection().updateOne(
      { tenantId, connectionId },
      {
        $set: {
          storeId,
          name: displayName,
          status: 'ACTIVE' as ConnectionStatus,
          disconnectedAt: null,
          updatedAt: now,
          connectedAt: now,
        },
        $unset: { id: '' },
      }
    )
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.collection().deleteOne({
      tenantId,
      $or: [{ storeId: id }, { id }, { connectionId: id }],
    })
  }

  async findByConnectionId(
    tenantId: string,
    connectionId: string
  ): Promise<ConnectionDocument | null> {
    const doc = await this.collection().findOne({ tenantId, connectionId })
    return doc ? normalizeConnectionDocument(doc) : null
  }

  async findActiveByStoreId(
    tenantId: string,
    storeId: string
  ): Promise<ConnectionDocument | null> {
    const doc = await this.collection().findOne({
      tenantId,
      status: 'ACTIVE',
      $or: [{ storeId }, { id: storeId }],
    })
    return doc ? normalizeConnectionDocument(doc) : null
  }

  async findByContaAzulAccountId(
    tenantId: string,
    contaAzulAccountId: string
  ): Promise<ConnectionDocument | null> {
    const doc = await this.collection().findOne({
      tenantId,
      contaAzulAccountId,
    })
    return doc ? normalizeConnectionDocument(doc) : null
  }

  async findOne(tenantId: string, id: string): Promise<ConnectionDocument | null> {
    const doc = await this.collection().findOne({
      tenantId,
      $or: [{ storeId: id }, { id }, { connectionId: id }],
    })
    return doc ? normalizeConnectionDocument(doc) : null
  }

  async listByTenant(tenantId: string): Promise<ConnectionDocument[]> {
    const docs = await this.collection().find({ tenantId }).sort({ connectedAt: -1 }).toArray()
    return docs.map((doc) => normalizeConnectionDocument(doc))
  }

  async hasSyncedData(tenantId: string, connectionId: string): Promise<boolean> {
    const db = this.getDb()
    for (const collectionName of SYNCED_COLLECTIONS) {
      const count = await db.collection(collectionName).countDocuments(
        { tenantId, connectionId },
        { limit: 1 }
      )
      if (count > 0) return true
    }
    const conn = await this.findByConnectionId(tenantId, connectionId)
    if (!conn) return false
    const storeId = resolveStoreId(conn)
    for (const collectionName of SYNCED_COLLECTIONS) {
      const count = await db.collection(collectionName).countDocuments(
        { tenantId, storeId },
        { limit: 1 }
      )
      if (count > 0) return true
    }
    return false
  }

  async migrateStoreId(
    tenantId: string,
    connectionId: string,
    newStoreId: string
  ): Promise<void> {
    const now = new Date()
    await this.collection().updateOne(
      { tenantId, connectionId },
      { $set: { storeId: newStoreId, updatedAt: now }, $unset: { id: '' } }
    )

    const db = this.getDb()
    for (const collectionName of SYNCED_COLLECTIONS) {
      await db.collection(collectionName).updateMany(
        { tenantId, connectionId },
        { $set: { storeId: newStoreId } }
      )
      await db.collection(collectionName).updateMany(
        { tenantId, connectionId: { $exists: false } },
        { $set: { storeId: newStoreId, connectionId } }
      )
    }
  }

  async backfillConnectionIdOnSyncedData(
    tenantId: string,
    connectionId: string,
    storeId: string
  ): Promise<void> {
    const db = this.getDb()
    for (const collectionName of SYNCED_COLLECTIONS) {
      await db.collection(collectionName).updateMany(
        { tenantId, storeId, connectionId: { $exists: false } },
        { $set: { connectionId } }
      )
    }
  }
}
