import { createRedisClient } from '../redis/create-redis-client.js'
import { getDb } from '../mongo/connection.js'
import { tenantTokenStore, connectionRepository } from '../credentials/index.js'
import { CategorySyncService } from './category-sync-service.js'

export { CategorySyncService } from './category-sync-service.js'
export type {
  SyncResult,
  StorePollResult,
  ReconcileAllResult,
  DisconnectStoreDataResult,
} from './types.js'
export { serializeSyncEvent } from './sync-event-publisher.js'

const sharedRedis = createRedisClient(process.env.REDIS_URL, 'command')

export const categorySyncService = new CategorySyncService(
  tenantTokenStore,
  sharedRedis,
  getDb,
  undefined,
  connectionRepository
)
