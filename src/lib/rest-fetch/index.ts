import { tenantTokenStore } from '../credentials/index.js'
import { createRedisClient } from '../redis/create-redis-client.js'
import { RestFetchService } from './rest-fetch-service.js'

const sharedRedis = createRedisClient(process.env.REDIS_URL, 'command')

export const restFetchService = new RestFetchService(tenantTokenStore, sharedRedis)
