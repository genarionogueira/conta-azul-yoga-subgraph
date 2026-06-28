import { Redis, type RedisOptions } from 'ioredis'

export type RedisClientRole = 'command' | 'blocking'

const DEFAULT_REDIS_URL = 'redis://localhost:6379'

const SHARED_OPTIONS: RedisOptions = {
  connectTimeout: 10_000,
  keepAlive: 30_000,
  enableReadyCheck: true,
  lazyConnect: false,
}

function optionsForRole(role: RedisClientRole): RedisOptions {
  if (role === 'blocking') {
    return {
      ...SHARED_OPTIONS,
      maxRetriesPerRequest: null,
    }
  }

  return {
    ...SHARED_OPTIONS,
    commandTimeout: 5_000,
    maxRetriesPerRequest: 3,
  }
}

export function createRedisClient(
  url: string = process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
  role: RedisClientRole = 'command'
): Redis {
  const client = new Redis(url, optionsForRole(role))
  client.on('error', (err: Error) => {
    console.error(`[redis] ${role} ${err.message}`)
  })
  return client
}
