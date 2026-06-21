import { randomBytes } from 'node:crypto'
import type { Redis } from 'ioredis'

const STATE_KEY_PREFIX = 'conta_azul:oauth:state:'
const STATE_TTL_SECONDS = 600

export interface OAuthStatePayload {
  storeId: string
  returnUrl?: string
}

function stateKey(state: string): string {
  return `${STATE_KEY_PREFIX}${state}`
}

function encodePayload(payload: OAuthStatePayload): string {
  if (payload.returnUrl) {
    return JSON.stringify(payload)
  }
  return payload.storeId
}

function decodePayload(raw: string): OAuthStatePayload {
  try {
    const parsed = JSON.parse(raw) as { storeId?: unknown; returnUrl?: unknown }
    if (typeof parsed.storeId === 'string' && parsed.storeId.trim()) {
      return {
        storeId: parsed.storeId,
        returnUrl:
          typeof parsed.returnUrl === 'string' && parsed.returnUrl.trim()
            ? parsed.returnUrl
            : undefined,
      }
    }
  } catch {
    /* legacy plain storeId value */
  }

  return { storeId: raw }
}

export class OAuthStateStore {
  constructor(private readonly redis: Redis) {}

  async createState(storeId: string, returnUrl?: string): Promise<string> {
    const state = randomBytes(32).toString('hex')
    const payload: OAuthStatePayload = { storeId, returnUrl }
    await this.redis.set(
      stateKey(state),
      encodePayload(payload),
      'EX',
      STATE_TTL_SECONDS
    )
    return state
  }

  async consumeState(state: string): Promise<OAuthStatePayload | null> {
    const key = stateKey(state)
    const raw = await this.redis.get(key)
    if (!raw) return null
    await this.redis.del(key)
    return decodePayload(raw)
  }
}
