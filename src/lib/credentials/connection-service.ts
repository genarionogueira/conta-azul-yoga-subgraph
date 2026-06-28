import { AuthConfig, AuthConfigError } from '../auth-config.js'
import { buildAuthorizationUrl, exchangeAuthorizationCode } from '../conta-azul-oauth.js'
import { createContaAzulClient, type ContaAzulClient } from '../conta-azul-client.js'
import type { ConnectionRepository } from '../connections/connection-repository.js'
import type { ConnectionListItem } from '../connections/types.js'
import type { OAuthStateStore } from '../oauth-state.js'
import { validateStoreId } from './store-id.js'
import {
  TenantTokenStore,
  type ConnectedStoreRecord,
  type ContaAzulToken,
} from './tenant-token-store.js'

export type StartConnectResult = { storeId: string; url: string; state: string }

export type CompleteConnectResult =
  | { success: true; storeId: string; returnUrl?: string }
  | { success: false; storeId: string; error: string; returnUrl?: string }

export interface ConnectionStatusResult {
  storeId: string
  isConnected: boolean
  connectedAt: string | null
  expiresAt: string | null
  error: string | null
}

export interface ConnectionServiceDeps {
  authConfig: AuthConfig
  oauthStateStore: OAuthStateStore
  tokenStore: TenantTokenStore
  connectionRepository: ConnectionRepository
  storeDataCleaner: {
    cleanup(tenantId: string, storeId: string): Promise<void>
  }
}

function auditActor(claims?: Record<string, unknown>): string {
  const azp = claims?.azp ?? claims?.client_id
  if (typeof azp === 'string' && azp.trim()) return azp
  const sub = claims?.sub
  if (typeof sub === 'string' && sub.trim()) return sub
  return 'unknown'
}

export class ConnectionService {
  constructor(private readonly deps: ConnectionServiceDeps) {}

  async startConnect(
    tenantId: string,
    storeId: string,
    returnUrl?: string
  ): Promise<StartConnectResult> {
    const validStoreId = validateStoreId(storeId)
    const redirectUri = this.deps.authConfig.requireRedirectUri()
    const clientId = this.deps.authConfig.getClientId()
    if (!clientId) {
      throw new AuthConfigError('CONTA_AZUL_CLIENT_ID is not configured')
    }

    const state = await this.deps.oauthStateStore.createState(
      tenantId,
      validStoreId,
      returnUrl
    )
    const url = buildAuthorizationUrl({
      clientId,
      redirectUri,
      state,
      scope: this.deps.authConfig.getScope(),
      authUrl: this.deps.authConfig.getAuthUrl(),
    })

    return { storeId: validStoreId, url, state }
  }

  async completeConnect(
    tenantId: string,
    storeId: string,
    code: string,
    state: string,
    authClaims?: Record<string, unknown>,
    name?: string
  ): Promise<CompleteConnectResult> {
    const validStoreId = validateStoreId(storeId)
    const payload = await this.deps.oauthStateStore.consumeState(state)
    if (!payload || payload.storeId !== validStoreId || payload.tenantId !== tenantId) {
      return {
        success: false,
        storeId: validStoreId,
        error: 'Invalid or expired OAuth state',
      }
    }

    return this.exchangeAndSave(
      tenantId,
      validStoreId,
      code,
      payload.returnUrl,
      authClaims,
      name
    )
  }

  async completeConnectFromCallback(
    code: string,
    state: string,
    name?: string
  ): Promise<CompleteConnectResult> {
    const payload = await this.deps.oauthStateStore.consumeState(state)
    if (!payload) {
      return {
        success: false,
        storeId: '',
        error: 'Invalid or expired OAuth state',
      }
    }

    return this.exchangeAndSave(
      payload.tenantId,
      payload.storeId,
      code,
      payload.returnUrl,
      undefined,
      name
    )
  }

  async completeConnectForTenant(
    tenantId: string,
    code: string,
    state: string,
    authClaims?: Record<string, unknown>,
    name?: string
  ): Promise<CompleteConnectResult> {
    const payload = await this.deps.oauthStateStore.consumeState(state)
    if (!payload || payload.tenantId !== tenantId) {
      return {
        success: false,
        storeId: payload?.storeId ?? '',
        error: 'Invalid or expired OAuth state',
      }
    }

    return this.exchangeAndSave(
      tenantId,
      payload.storeId,
      code,
      payload.returnUrl,
      authClaims,
      name
    )
  }

  async disconnect(
    tenantId: string,
    storeId: string,
    authClaims?: Record<string, unknown>
  ): Promise<{ success: boolean; storeId: string; error: string | null }> {
    const validStoreId = validateStoreId(storeId)
    console.info(
      `[credentials] disconnect tenant=${tenantId} store=${validStoreId} actor=${auditActor(authClaims)}`
    )

    const token = await this.deps.tokenStore.getToken(tenantId, validStoreId)
    if (!token) {
      return {
        success: false,
        storeId: validStoreId,
        error: `Store ${validStoreId} is not connected`,
      }
    }

    let cleanupError: string | null = null
    try {
      await this.deps.storeDataCleaner.cleanup(tenantId, validStoreId)
    } catch (err) {
      cleanupError = err instanceof Error ? err.message : 'Unknown error'
      console.warn(
        `[credentials] disconnect cleanup failed tenant=${tenantId} store=${validStoreId}: ${cleanupError}`
      )
    }

    await this.deps.tokenStore.deleteConnection(tenantId, validStoreId)
    await this.deps.connectionRepository.delete(tenantId, validStoreId)

    return {
      success: true,
      storeId: validStoreId,
      error: cleanupError,
    }
  }

  async listConnected(tenantId: string): Promise<ConnectedStoreRecord[]> {
    return this.deps.tokenStore.listConnectedStores(tenantId)
  }

  async updateConnection(
    tenantId: string,
    id: string,
    name: string
  ): Promise<{ success: boolean; id: string; name: string | null; error: string | null }> {
    const validStoreId = validateStoreId(id)
    const token = await this.deps.tokenStore.getToken(tenantId, validStoreId)
    if (!token) {
      return {
        success: false,
        id: validStoreId,
        name: null,
        error: `Store ${validStoreId} is not connected`,
      }
    }

    const displayName = name.trim() || validStoreId
    await this.deps.connectionRepository.upsert(tenantId, validStoreId, name)

    return {
      success: true,
      id: validStoreId,
      name: displayName,
      error: null,
    }
  }

  async listConnections(tenantId: string): Promise<ConnectionListItem[]> {
    const storeIds = await this.deps.tokenStore.listConnectedStoreIds(tenantId)
    const mongoDocs = await this.deps.connectionRepository.listByTenant(tenantId)
    const docById = new Map(mongoDocs.map((doc) => [doc.id, doc]))
    const connectedIdSet = new Set(storeIds)

    for (const doc of mongoDocs) {
      if (!connectedIdSet.has(doc.id)) {
        await this.deps.connectionRepository.delete(tenantId, doc.id)
      }
    }

    const results: ConnectionListItem[] = []
    for (const storeId of storeIds) {
      const token = await this.deps.tokenStore.getToken(tenantId, storeId)
      if (!token) {
        continue
      }

      let doc = docById.get(storeId)
      if (!doc) {
        await this.deps.connectionRepository.upsert(tenantId, storeId, storeId)
        doc = {
          tenantId,
          id: storeId,
          name: storeId,
          connectedAt: token.connected_at ? new Date(token.connected_at) : new Date(),
          updatedAt: new Date(),
        }
      }

      results.push({
        id: storeId,
        name: doc.name,
        connectedAt: doc.connectedAt.toISOString(),
        isConnected: true,
      })
    }

    return results.sort((a, b) => a.id.localeCompare(b.id))
  }

  async getStatus(tenantId: string, storeId: string): Promise<ConnectionStatusResult> {
    const validStoreId = validateStoreId(storeId)
    try {
      const token = await this.deps.tokenStore.getToken(tenantId, validStoreId)
      if (!token) {
        return {
          storeId: validStoreId,
          isConnected: false,
          connectedAt: null,
          expiresAt: null,
          error: null,
        }
      }

      return {
        storeId: validStoreId,
        isConnected: true,
        connectedAt: token.connected_at
          ? new Date(token.connected_at).toISOString()
          : null,
        expiresAt: new Date(token.expires_at).toISOString(),
        error: null,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return {
        storeId: validStoreId,
        isConnected: false,
        connectedAt: null,
        expiresAt: null,
        error: message,
      }
    }
  }

  async getClientForStore(
    tenantId: string,
    storeId: string
  ): Promise<ContaAzulClient | undefined> {
    try {
      const token = await this.deps.tokenStore.ensureFreshToken(tenantId, storeId)
      return createContaAzulClient(token.access_token)
    } catch {
      return undefined
    }
  }

  async listConnectedStoreIds(tenantId: string): Promise<string[]> {
    return this.deps.tokenStore.listConnectedStoreIds(tenantId)
  }

  private async schedulePostConnectCategorySync(
    tenantId: string,
    storeId: string
  ): Promise<void> {
    try {
      const { categorySyncService } = await import('../category-sync/index.js')
      void categorySyncService.syncStore(tenantId, storeId, 'connect').catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(
          `[credentials] post-connect category sync failed tenant=${tenantId} store=${storeId}: ${message}`
        )
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[credentials] post-connect category sync unavailable: ${message}`)
    }
  }

  private async exchangeAndSave(
    tenantId: string,
    storeId: string,
    code: string,
    returnUrl?: string,
    authClaims?: Record<string, unknown>,
    name?: string
  ): Promise<CompleteConnectResult> {
    try {
      const redirectUri = this.deps.authConfig.requireRedirectUri()
      const token = await exchangeAuthorizationCode({
        code,
        redirectUri,
        clientId: this.deps.authConfig.getClientId(),
        clientSecret: this.deps.authConfig.getClientSecret(),
        tokenUrl: this.deps.authConfig.getTokenUrl(),
      })

      const stored: ContaAzulToken = {
        ...token,
        connected_at: Date.now(),
      }
      await this.deps.tokenStore.saveConnection(tenantId, storeId, stored)
      await this.deps.connectionRepository.upsert(tenantId, storeId, name ?? storeId)

      console.info(
        `[credentials] connect tenant=${tenantId} store=${storeId} actor=${auditActor(authClaims)}`
      )

      void this.schedulePostConnectCategorySync(tenantId, storeId)

      return { success: true, storeId, returnUrl }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, storeId, error: message, returnUrl }
    }
  }
}
