import type { Redis } from 'ioredis'

const TOKEN_KEY_PREFIX = 'conta_azul:token:'
const STORE_LINK_PREFIX = 'conta_azul:store_link:'
const CONNECTED_STORES_PREFIX = 'conta_azul:connected_stores:'
const TTL_BUFFER_MS = 24 * 60 * 60 * 1000
const REFRESH_BUFFER_MS = 5 * 60 * 1000

export interface ContaAzulToken {
  access_token: string
  refresh_token: string
  expires_at: number
  connected_at?: number
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

function tokenKey(tenantId: string, connectionId: string): string {
  return `${TOKEN_KEY_PREFIX}${tenantId}:${connectionId}`
}

function legacyTokenKey(tenantId: string, storeId: string): string {
  return `${TOKEN_KEY_PREFIX}${tenantId}:${storeId}`
}

function storeLinkKey(tenantId: string, storeId: string): string {
  return `${STORE_LINK_PREFIX}${tenantId}:${storeId}`
}

function connectedStoresKey(tenantId: string): string {
  return `${CONNECTED_STORES_PREFIX}${tenantId}`
}

function tokenNeedsRefresh(token: ContaAzulToken): boolean {
  return Date.now() >= token.expires_at - REFRESH_BUFFER_MS
}

function ttlSeconds(token: ContaAzulToken): number {
  const remainingMs = token.expires_at - Date.now() + TTL_BUFFER_MS
  return Math.max(Math.ceil(remainingMs / 1000), 60)
}

function parseToken(raw: string): ContaAzulToken {
  const json = raw.startsWith('plain:') ? raw.slice(6) : raw
  return JSON.parse(json) as ContaAzulToken
}

export interface ConnectedStoreRecord {
  storeId: string
  isConnected: boolean
  connectedAt: string | null
  expiresAt: string | null
}

export class TenantTokenStore {
  constructor(
    private readonly redis: Redis,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly tokenUrl: string
  ) {}

  private async resolveConnectionId(
    tenantId: string,
    storeId: string
  ): Promise<string | null> {
    const linked = await this.redis.get(storeLinkKey(tenantId, storeId))
    if (linked) return linked
    const legacy = await this.redis.get(legacyTokenKey(tenantId, storeId))
    if (legacy) return storeId
    return null
  }

  async getTokenByConnectionId(
    tenantId: string,
    connectionId: string
  ): Promise<ContaAzulToken | null> {
    const raw = await this.redis.get(tokenKey(tenantId, connectionId))
    if (!raw) return null
    return parseToken(raw)
  }

  async getToken(tenantId: string, storeId: string): Promise<ContaAzulToken | null> {
    const connectionId = await this.resolveConnectionId(tenantId, storeId)
    if (connectionId) {
      const byConnection = await this.getTokenByConnectionId(tenantId, connectionId)
      if (byConnection) return byConnection
    }
    const legacyRaw = await this.redis.get(legacyTokenKey(tenantId, storeId))
    if (!legacyRaw) return null
    return parseToken(legacyRaw)
  }

  async saveConnection(
    tenantId: string,
    connectionId: string,
    storeId: string,
    token: ContaAzulToken
  ): Promise<void> {
    const connectedAt = token.connected_at ?? Date.now()
    const stored: ContaAzulToken = { ...token, connected_at: connectedAt }
    const key = tokenKey(tenantId, connectionId)
    await this.redis.setex(key, ttlSeconds(stored), `plain:${JSON.stringify(stored)}`)
    await this.redis.set(storeLinkKey(tenantId, storeId), connectionId)
    await this.redis.zadd(connectedStoresKey(tenantId), connectedAt, storeId)
    await this.redis.del(legacyTokenKey(tenantId, storeId))
  }

  async deleteConnection(
    tenantId: string,
    connectionId: string,
    storeId: string
  ): Promise<boolean> {
    const deleted = await this.redis.del(tokenKey(tenantId, connectionId))
    await this.redis.del(storeLinkKey(tenantId, storeId))
    await this.redis.del(legacyTokenKey(tenantId, storeId))
    await this.redis.zrem(connectedStoresKey(tenantId), storeId)
    return deleted > 0
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
      connected_at: current.connected_at,
    }
  }

  async ensureFreshToken(tenantId: string, storeId: string): Promise<ContaAzulToken> {
    const connectionId = await this.resolveConnectionId(tenantId, storeId)
    const token = await this.getToken(tenantId, storeId)
    if (!token) {
      throw new TokenNotFoundError(`No token for store ${storeId}`)
    }
    if (!tokenNeedsRefresh(token)) {
      return token
    }
    const fresh = await this.refreshToken(token)
    const resolvedConnectionId = connectionId ?? storeId
    await this.saveConnection(tenantId, resolvedConnectionId, storeId, fresh)
    return fresh
  }

  async listConnectedStoreIds(tenantId: string): Promise<string[]> {
    const storeIds = await this.redis.zrange(connectedStoresKey(tenantId), 0, -1)
    const connected: string[] = []

    for (const storeId of storeIds) {
      const token = await this.getToken(tenantId, storeId)
      if (token) {
        connected.push(storeId)
      } else {
        await this.redis.zrem(connectedStoresKey(tenantId), storeId)
      }
    }

    return connected.sort()
  }

  async listConnectedStores(tenantId: string): Promise<ConnectedStoreRecord[]> {
    const storeIds = await this.listConnectedStoreIds(tenantId)
    const records: ConnectedStoreRecord[] = []

    for (const storeId of storeIds) {
      const token = await this.getToken(tenantId, storeId)
      records.push({
        storeId,
        isConnected: token !== null,
        connectedAt: token?.connected_at
          ? new Date(token.connected_at).toISOString()
          : null,
        expiresAt: token?.expires_at ? new Date(token.expires_at).toISOString() : null,
      })
    }

    return records
  }

  async isStoreRegistered(tenantId: string, storeId: string): Promise<boolean> {
    const score = await this.redis.zscore(connectedStoresKey(tenantId), storeId)
    if (score != null) return true
    return (await this.getToken(tenantId, storeId)) !== null
  }

  async listRegisteredStoreIds(tenantId: string): Promise<string[]> {
    return this.listConnectedStoreIds(tenantId)
  }

  async ping(): Promise<void> {
    const result = await this.redis.ping()
    if (result !== 'PONG') {
      throw new Error('Redis ping failed')
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit()
  }
}
