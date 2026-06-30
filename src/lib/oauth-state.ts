import { randomBytes } from 'node:crypto'
import type { Redis } from 'ioredis'

const STATE_KEY_PREFIX = 'conta_azul:oauth:state:'
const COMPLETED_KEY_PREFIX = 'conta_azul:oauth:completed:'
// Tolerates slow IdP logins and the ngrok free-tier interstitial in local dev,
// where the original 10 min could elapse before the callback reaches us.
const STATE_TTL_SECONDS = 1800
// After a successful connect, remember the outcome briefly so a re-loaded callback
// (browser refresh/back button, link prefetch) redirects back instead of erroring
// with "Invalid or expired OAuth state" on a single-use code/state.
const COMPLETED_TTL_SECONDS = 600

export interface OAuthStatePayload {
  tenantId: string
  storeId: string
  returnUrl?: string
}

export interface CompletedConnect {
  storeId: string
  jobId: string
  returnUrl?: string
}

function stateKey(state: string): string {
  return `${STATE_KEY_PREFIX}${state}`
}

function completedKey(state: string): string {
  return `${COMPLETED_KEY_PREFIX}${state}`
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

function decodeCompleted(raw: string): CompletedConnect | null {
  try {
    const parsed = JSON.parse(raw) as {
      storeId?: unknown
      jobId?: unknown
      returnUrl?: unknown
    }
    if (
      typeof parsed.storeId === 'string' &&
      parsed.storeId.trim() &&
      typeof parsed.jobId === 'string'
    ) {
      return {
        storeId: parsed.storeId.trim(),
        jobId: parsed.jobId,
        returnUrl:
          typeof parsed.returnUrl === 'string' && parsed.returnUrl.trim()
            ? parsed.returnUrl
            : undefined,
      }
    }
  } catch {
    /* ignore malformed completed markers */
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

  // Atomic read-and-delete so a single-use state cannot be exchanged twice, even
  // when the callback is requested concurrently (e.g. browser link prefetch).
  async consumeState(state: string): Promise<OAuthStatePayload | null> {
    const raw = await this.redis.getdel(stateKey(state))
    if (!raw) return null
    return decodePayload(raw)
  }

  async markCompleted(state: string, completed: CompletedConnect): Promise<void> {
    await this.redis.set(
      completedKey(state),
      JSON.stringify(completed),
      'EX',
      COMPLETED_TTL_SECONDS
    )
  }

  async peekCompleted(state: string): Promise<CompletedConnect | null> {
    const raw = await this.redis.get(completedKey(state))
    if (!raw) return null
    return decodeCompleted(raw)
  }
}
