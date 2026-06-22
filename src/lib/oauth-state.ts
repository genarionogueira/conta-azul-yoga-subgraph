import { randomBytes } from 'node:crypto'
import type { Redis } from 'ioredis'

const STATE_KEY_PREFIX = 'conta_azul:oauth:state:'
const STATE_TTL_SECONDS = 600

export interface OAuthStatePayload {
  tenantId: string
  storeId: string
  returnUrl?: string
}

function stateKey(state: string): string {
  return `${STATE_KEY_PREFIX}${state}`
}

function encodePayload(payload: OAuthStatePayload): string {
  return JSON.stringify(payload)
}

function decodePayload(raw: string): OAuthStatePayload | null {
  try {
    const parsed = JSON.parse(raw) as {
      tenantId?: unknown
      storeId?: unknown
      returnUrl?: unknown
    }
    if (
      typeof parsed.tenantId === 'string' &&
      parsed.tenantId.trim() &&
      typeof parsed.storeId === 'string' &&
      parsed.storeId.trim()
    ) {
      return {
        tenantId: parsed.tenantId.trim(),
        storeId: parsed.storeId.trim(),
        returnUrl:
          typeof parsed.returnUrl === 'string' && parsed.returnUrl.trim()
            ? parsed.returnUrl
            : undefined,
      }
    }
  } catch {
    /* legacy payloads without tenantId are rejected */
  }

  return null
}

export class OAuthStateStore {
  constructor(private readonly redis: Redis) {}

  async createState(
    tenantId: string,
    storeId: string,
    returnUrl?: string
  ): Promise<string> {
    const state = randomBytes(32).toString('hex')
    const payload: OAuthStatePayload = { tenantId, storeId, returnUrl }
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
