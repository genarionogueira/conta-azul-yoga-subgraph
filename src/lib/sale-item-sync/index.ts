import { createRedisClient } from '../redis/create-redis-client.js'
import { getDb } from '../mongo/connection.js'
import { tenantTokenStore, connectionRepository } from '../credentials/index.js'
import { SaleItemSyncService } from './sale-item-sync-service.js'

export { SaleItemSyncService } from './sale-item-sync-service.js'
export type {
  SyncResult,
  StorePollResult,
  ReconcileAllResult,
  SaleLineItem,
} from './types.js'
export {
  reconcileSaleItemsForSale,
  pruneOrphanSaleItems,
} from './reconcile-mongo.js'

const sharedRedis = createRedisClient(process.env.REDIS_URL, 'command')

export const saleItemSyncService = new SaleItemSyncService(
  tenantTokenStore,
  sharedRedis,
  getDb,
  undefined,
  connectionRepository
)
