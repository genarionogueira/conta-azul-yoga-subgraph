import type { Redis } from 'ioredis'

const TOKEN_KEY_PREFIX = 'conta_azul:token:'
const CONNECTED_STORES_KEY = 'conta_azul:connected_stores'
const REFRESH_BUFFER_MS = 5 * 60 * 1000

export interface ContaAzulToken {
  access_token: string
  refresh_token: string
  expires_at: number
}

export class TokenNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenNotFoundError'
  }
}

export class TokenRefreshError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenRefreshError'
  }
}

function redisKey(storeId: string): string {
  return `${TOKEN_KEY_PREFIX}${storeId}`
}

function tokenNeedsRefresh(token: ContaAzulToken): boolean {
  return Date.now() >= token.expires_at - REFRESH_BUFFER_MS
}

export class TokenResolver {
  constructor(
    private readonly redis: Redis,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly tokenUrl: string
  ) {}

  async getToken(storeId: string): Promise<ContaAzulToken | null> {
    const raw = await this.redis.get(redisKey(storeId))
    if (!raw) return null
    const json = raw.startsWith('plain:') ? raw.slice(6) : raw
    return JSON.parse(json) as ContaAzulToken
  }

  async saveToken(storeId: string, token: ContaAzulToken): Promise<void> {
    await this.redis.set(redisKey(storeId), `plain:${JSON.stringify(token)}`)
  }

  async refreshToken(current: ContaAzulToken): Promise<ContaAzulToken> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refresh_token,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    })
    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      throw new TokenRefreshError(`Token refresh failed: ${res.status}`)
    }
    const data = (await res.json()) as {
      access_token: string
      refresh_token: string
      expires_in: number
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    }
  }

  async ensureFreshToken(storeId: string): Promise<ContaAzulToken> {
    const token = await this.getToken(storeId)
    if (!token) {
      throw new TokenNotFoundError(`No token for store ${storeId}`)
    }
    if (!tokenNeedsRefresh(token)) {
      return token
    }
    const fresh = await this.refreshToken(token)
    await this.saveToken(storeId, fresh)
    return fresh
  }

  async ping(): Promise<void> {
    const result = await this.redis.ping()
    if (result !== 'PONG') {
      throw new Error('Redis ping failed')
    }
  }

  async isStoreRegistered(storeId: string): Promise<boolean> {
    const score = await this.redis.zscore(CONNECTED_STORES_KEY, storeId)
    if (score != null) return true
    const raw = await this.redis.get(redisKey(storeId))
    return raw != null
  }

  async listRegisteredStoreIds(): Promise<string[]> {
    const fromIndex = await this.redis.zrange(CONNECTED_STORES_KEY, 0, -1)
    if (fromIndex.length > 0) {
      return [...fromIndex].sort()
    }
    return this.listConnectedStoreIds()
  }

  async listConnectedStoreIds(): Promise<string[]> {
    let cursor = '0'
    const ids = new Set<string>()
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${TOKEN_KEY_PREFIX}*`,
        'COUNT',
        100
      )
      cursor = next
      for (const key of keys) {
        ids.add(key.slice(TOKEN_KEY_PREFIX.length))
      }
    } while (cursor !== '0')
    return [...ids].sort()
  }
}
