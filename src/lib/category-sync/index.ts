import { Redis } from 'ioredis'
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

function createSharedRedis(): Redis {
  return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')
}

const sharedRedis = createSharedRedis()

export const categorySyncService = new CategorySyncService(
  tenantTokenStore,
  sharedRedis,
  getDb,
  undefined,
  connectionRepository
)
