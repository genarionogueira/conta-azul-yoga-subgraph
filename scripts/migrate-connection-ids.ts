/**
 * Idempotent migration: backfill connectionId on legacy connections and synced docs.
 * Run via: npx tsx scripts/migrate-connection-ids.ts
 */
import { randomUUID } from 'node:crypto'
import { MongoClient } from 'mongodb'
import { Redis } from 'ioredis'

const SYNCED_COLLECTIONS = [
  'conta_azul_categories',
  'sales',
  'sale_items',
  'vendedores',
] as const

async function main(): Promise<void> {
  const mongoUrl = process.env.MONGO_URL ?? process.env.E2E_MONGO_URL
  const redisUrl = process.env.REDIS_URL ?? process.env.E2E_REDIS_URL
  if (!mongoUrl) {
    throw new Error('MONGO_URL or E2E_MONGO_URL required')
  }

  const client = new MongoClient(mongoUrl)
  await client.connect()
  const db = client.db()
  const connectionsCol = db.collection('conta_azul_connections')

  const legacyConnections = await connectionsCol.find({ connectionId: { $exists: false } }).toArray()
  for (const doc of legacyConnections) {
    const storeId = (doc.storeId ?? doc.id) as string
    const connectionId = randomUUID()
    await connectionsCol.updateOne(
      { _id: doc._id },
      {
        $set: {
          connectionId,
          storeId,
          contaAzulAccountId: doc.contaAzulAccountId ?? '',
          status: doc.status ?? 'ACTIVE',
          disconnectedAt: doc.disconnectedAt ?? null,
          updatedAt: new Date(),
        },
        $unset: { id: '' },
      }
    )

    for (const collectionName of SYNCED_COLLECTIONS) {
      await db.collection(collectionName).updateMany(
        { tenantId: doc.tenantId, storeId, connectionId: { $exists: false } },
        { $set: { connectionId } }
      )
    }
  }

  if (redisUrl) {
    const redis = new Redis(redisUrl)
    const allConnections = await connectionsCol.find({ status: 'ACTIVE' }).toArray()
    for (const conn of allConnections) {
      const tenantId = conn.tenantId as string
      const storeId = (conn.storeId ?? conn.id) as string
      const connectionId = conn.connectionId as string
      const legacyKey = `conta_azul:token:${tenantId}:${storeId}`
      const newKey = `conta_azul:token:${tenantId}:${connectionId}`
      const legacyToken = await redis.get(legacyKey)
      if (legacyToken) {
        const ttl = await redis.ttl(legacyKey)
        if (ttl > 0) {
          await redis.setex(newKey, ttl, legacyToken)
        } else {
          await redis.set(newKey, legacyToken)
        }
        await redis.set(`conta_azul:store_link:${tenantId}:${storeId}`, connectionId)
        await redis.del(legacyKey)
      }
    }
    await redis.quit()
  }

  await client.close()
  console.info('migrate-connection-ids: complete')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
