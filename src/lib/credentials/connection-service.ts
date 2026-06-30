import { AuthConfig, AuthConfigError } from '../auth-config.js'
import { buildAuthorizationUrl, exchangeAuthorizationCode } from '../conta-azul-oauth.js'
import { createContaAzulClient, fetchConnectedAccount, type ContaAzulClient } from '../conta-azul-client.js'
import type { ConnectionRepository } from '../connections/connection-repository.js'
import type { ConnectionListItem } from '../connections/types.js'
import { resolveStoreId } from '../connections/types.js'
import type { OAuthStateStore } from '../oauth-state.js'
import { validateStoreId } from './store-id.js'
import { enqueueStoreReconcileJob, enqueueStoreDisconnectJob } from '../sync/store-sync-job-service.js'
import type { SyncMode } from '../jobs/job-stream.js'
import { createRedisClient } from '../redis/create-redis-client.js'
import {
  TenantTokenStore,
  type ConnectedStoreRecord,
  type ContaAzulToken,
} from './tenant-token-store.js'

export type StartConnectResult = { storeId: string; url: string; state: string }

export type CompleteConnectResult =
  | { success: true; storeId: string; jobId: string; returnUrl?: string }
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
      name,
      state
    )
  }

  async completeConnectFromCallback(
    code: string,
    state: string,
    name?: string
  ): Promise<CompleteConnectResult> {
    const payload = await this.deps.oauthStateStore.consumeState(state)
    if (!payload) {
      // The callback is single-use, but browsers re-request it (refresh, back
      // button, link prefetch). If this exact state already completed a connect,
      // replay that result so the user is redirected back instead of seeing an
      // "Invalid or expired OAuth state" dead end.
      const replay = await this.resolveReplay(state)
      if (replay) return replay

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
      name,
      state
    )
  }

  private async resolveReplay(
    state: string,
    expectedStoreId?: string
  ): Promise<CompleteConnectResult | null> {
    const completed = await this.deps.oauthStateStore.peekCompleted(state)
    if (!completed) return null
    if (expectedStoreId && completed.storeId !== expectedStoreId) return null

    return {
      success: true,
      storeId: completed.storeId,
      jobId: completed.jobId,
      returnUrl: completed.returnUrl,
    }
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
      name,
      state
    )
  }

  async disconnect(
    tenantId: string,
    storeId: string,
    authClaims?: Record<string, unknown>
  ): Promise<{
    success: boolean
    storeId: string
    jobId: string | null
    error: string | null
  }> {
    const validStoreId = validateStoreId(storeId)
    console.info(
      `[credentials] disconnect tenant=${tenantId} store=${validStoreId} actor=${auditActor(authClaims)}`
    )

    const token = await this.deps.tokenStore.getToken(tenantId, validStoreId)
    if (!token) {
      return {
        success: false,
        storeId: validStoreId,
        jobId: null,
        error: `Store ${validStoreId} is not connected`,
      }
    }

    const conn = await this.deps.connectionRepository.findActiveByStoreId(tenantId, validStoreId)

    const redis = createRedisClient(process.env.REDIS_URL, 'command')
    try {
      const { jobId } = await enqueueStoreDisconnectJob(redis, {
        tenantId,
        storeId: validStoreId,
        connectionId: conn?.connectionId,
      })
      return {
        success: true,
        storeId: validStoreId,
        jobId,
        error: null,
      }
    } finally {
      await redis.quit()
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
    await this.deps.connectionRepository.upsertActiveName(tenantId, validStoreId, name)

    return {
      success: true,
      id: validStoreId,
      name: displayName,
      error: null,
    }
  }

  async updateStoreId(
    tenantId: string,
    connectionId: string,
    newStoreId: string
  ): Promise<{
    success: boolean
    connectionId: string
    storeId: string | null
    error: string | null
  }> {
    const validStoreId = validateStoreId(newStoreId)
    const conn = await this.deps.connectionRepository.findByConnectionId(tenantId, connectionId)
    if (!conn || conn.status !== 'ACTIVE') {
      return {
        success: false,
        connectionId,
        storeId: null,
        error: 'Connection is not active',
      }
    }

    const token = await this.deps.tokenStore.getTokenByConnectionId(tenantId, connectionId)
    if (!token) {
      return {
        success: false,
        connectionId,
        storeId: null,
        error: 'Connection has no active credentials',
      }
    }

    const conflict = await this.deps.connectionRepository.findActiveByStoreId(tenantId, validStoreId)
    if (conflict && conflict.connectionId !== connectionId) {
      return {
        success: false,
        connectionId,
        storeId: null,
        error: `Store slug ${validStoreId} is already in use`,
      }
    }

    const oldStoreId = resolveStoreId(conn)
    await this.deps.connectionRepository.migrateStoreId(tenantId, connectionId, validStoreId)
    await this.deps.tokenStore.deleteConnection(tenantId, connectionId, oldStoreId)
    await this.deps.tokenStore.saveConnection(tenantId, connectionId, validStoreId, token)

    return {
      success: true,
      connectionId,
      storeId: validStoreId,
      error: null,
    }
  }

  async listConnections(tenantId: string): Promise<ConnectionListItem[]> {
    const mongoDocs = await this.deps.connectionRepository.listByTenant(tenantId)
    const results: ConnectionListItem[] = []

    for (const doc of mongoDocs) {
      const storeId = resolveStoreId(doc)
      const token =
        doc.status === 'ACTIVE'
          ? await this.deps.tokenStore.getToken(tenantId, storeId)
          : null

      results.push({
        connectionId: doc.connectionId,
        storeId,
        id: storeId,
        name: doc.name,
        status: doc.status,
        connectedAt: doc.connectedAt?.toISOString() ?? null,
        disconnectedAt: doc.disconnectedAt?.toISOString() ?? null,
        isConnected: doc.status === 'ACTIVE' && token !== null,
      })
    }

    return results.sort((a, b) => a.storeId.localeCompare(b.storeId))
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

  private async exchangeAndSave(
    tenantId: string,
    storeId: string,
    code: string,
    returnUrl?: string,
    authClaims?: Record<string, unknown>,
    name?: string,
    state?: string
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

      const account = await fetchConnectedAccount(token.access_token)
      const displayName = name?.trim() || account.name?.trim() || storeId

      let connectionId: string
      let reconcileMode: SyncMode = 'BACKFILL'

      const existing = await this.deps.connectionRepository.findByContaAzulAccountId(
        tenantId,
        account.contaAzulAccountId
      )

      if (existing?.status === 'DISCONNECTED') {
        connectionId = existing.connectionId
        const oldStoreId = resolveStoreId(existing)
        await this.deps.connectionRepository.reactivate(
          tenantId,
          connectionId,
          storeId,
          displayName
        )
        if (oldStoreId !== storeId) {
          await this.deps.connectionRepository.migrateStoreId(tenantId, connectionId, storeId)
        }
        await this.deps.connectionRepository.backfillConnectionIdOnSyncedData(
          tenantId,
          connectionId,
          oldStoreId
        )
        const hasData = await this.deps.connectionRepository.hasSyncedData(tenantId, connectionId)
        reconcileMode = hasData ? 'INCREMENTAL' : 'BACKFILL'
      } else if (existing?.status === 'ACTIVE') {
        const activeStoreId = resolveStoreId(existing)
        if (activeStoreId !== storeId) {
          return {
            success: false,
            storeId,
            error: `Conta Azul account already connected as ${activeStoreId}`,
            returnUrl,
          }
        }
        connectionId = existing.connectionId
        await this.deps.connectionRepository.upsertActiveName(tenantId, storeId, displayName)
        reconcileMode = (await this.deps.connectionRepository.hasSyncedData(tenantId, connectionId))
          ? 'INCREMENTAL'
          : 'BACKFILL'
      } else {
        const created = await this.deps.connectionRepository.create(
          tenantId,
          storeId,
          account.contaAzulAccountId,
          displayName
        )
        connectionId = created.connectionId
      }

      const stored: ContaAzulToken = {
        ...token,
        connected_at: Date.now(),
      }
      await this.deps.tokenStore.saveConnection(tenantId, connectionId, storeId, stored)

      console.info(
        `[credentials] connect tenant=${tenantId} store=${storeId} connectionId=${connectionId} actor=${auditActor(authClaims)}`
      )

      const redis = createRedisClient(process.env.REDIS_URL, 'command')
      const { jobId } = await enqueueStoreReconcileJob(redis, {
        tenantId,
        storeId,
        trigger: 'connect',
        mode: reconcileMode,
        connectionId,
      })
      await redis.quit()

      if (state) {
        try {
          await this.deps.oauthStateStore.markCompleted(state, {
            storeId,
            jobId,
            returnUrl,
          })
        } catch (markErr) {
          const reason = markErr instanceof Error ? markErr.message : 'Unknown error'
          console.warn(
            `[credentials] markCompleted failed tenant=${tenantId} store=${storeId}: ${reason}`
          )
        }
      }

      return { success: true, storeId, jobId, returnUrl }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(
        `[credentials] connect failed tenant=${tenantId} store=${storeId}: ${message}`
      )
      return { success: false, storeId, error: message, returnUrl }
    }
  }
}
