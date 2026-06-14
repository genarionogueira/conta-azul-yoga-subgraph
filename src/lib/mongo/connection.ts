import { MongoClient, type Db } from 'mongodb'

let client: MongoClient | undefined
let _db: Db | undefined

export function getDb(): Db {
  if (!_db) throw new Error('MongoDB not initialized. Call initMongo() first.')
  return _db
}

export async function initMongo(url?: string): Promise<void> {
  const u = url ?? process.env.MONGODB_URL ?? 'mongodb://localhost:27017/conta_azul'
  client = new MongoClient(u)
  await client.connect()
  _db = client.db()
}

export async function closeMongo(): Promise<void> {
  await client?.close()
  client = undefined
  _db = undefined
}
