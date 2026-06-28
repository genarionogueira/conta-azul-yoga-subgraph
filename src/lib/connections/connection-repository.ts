import type { Db } from 'mongodb'
import type { ConnectionDocument } from './types.js'

function connectionsCollectionName(): string {
  return process.env.CONNECTIONS_COLLECTION?.trim() || 'conta_azul_connections'
}

export class ConnectionRepository {
  constructor(private readonly getDb: () => Db) {}

  private collection() {
    return this.getDb().collection<ConnectionDocument>(connectionsCollectionName())
  }

  async upsert(tenantId: string, id: string, name: string): Promise<void> {
    const now = new Date()
    const displayName = name.trim() || id
    await this.collection().updateOne(
      { tenantId, id },
      {
        $set: { name: displayName, updatedAt: now },
        $setOnInsert: { tenantId, id, connectedAt: now },
      },
      { upsert: true }
    )
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.collection().deleteOne({ tenantId, id })
  }

  async listByTenant(tenantId: string): Promise<ConnectionDocument[]> {
    return this.collection().find({ tenantId }).sort({ connectedAt: -1 }).toArray()
  }

  async findOne(tenantId: string, id: string): Promise<ConnectionDocument | null> {
    return this.collection().findOne({ tenantId, id })
  }
}
