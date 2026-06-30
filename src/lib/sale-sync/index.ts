import { createRedisClient } from '../redis/create-redis-client.js'
import { getDb } from '../mongo/connection.js'
import { tenantTokenStore, connectionRepository } from '../credentials/index.js'
import { SaleSyncService } from './sale-sync-service.js'

export { SaleSyncService } from './sale-sync-service.js'
export type {
  SyncResult,
  StorePollResult,
  ReconcileAllResult,
  SaleItem,
} from './types.js'
export { reconcileSalesToMongo } from './reconcile-mongo.js'

const sharedRedis = createRedisClient(process.env.REDIS_URL, 'command')

export const saleSyncService = new SaleSyncService(
  tenantTokenStore,
  sharedRedis,
  getDb,
  undefined,
  connectionRepository
)
