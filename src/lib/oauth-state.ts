import { randomBytes } from 'node:crypto'
import type { Redis } from 'ioredis'

const STATE_KEY_PREFIX = 'conta_azul:oauth:state:'
const STATE_TTL_SECONDS = 600

function stateKey(state: string): string {
  return `${STATE_KEY_PREFIX}${state}`
}

export class OAuthStateStore {
  constructor(private readonly redis: Redis) {}

  async createState(storeId: string): Promise<string> {
    const state = randomBytes(32).toString('hex')
    await this.redis.set(stateKey(state), storeId, 'EX', STATE_TTL_SECONDS)
    return state
  }

  async consumeState(state: string): Promise<string | null> {
    const key = stateKey(state)
    const storeId = await this.redis.get(key)
    if (!storeId) return null
    await this.redis.del(key)
    return storeId
  }
}
