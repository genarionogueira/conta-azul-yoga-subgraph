import type { JWTPayload } from 'jose'
import type { YogaInitialContext } from 'graphql-yoga'
import { createContaAzulClient, type ContaAzulClient } from './lib/conta-azul-client.js'
import { getRequestAuthClaims } from './lib/auth/request-auth-store.js'
import { resolveTenantId } from './lib/auth/tenant-context.js'
import { loadAuthSettings } from './lib/auth/settings.js'
import { connectionService, tenantTokenStore } from './lib/credentials/index.js'
import { extractStoreId } from './lib/extract-store-id.js'
import { TenantTokenStore, type ContaAzulToken } from './lib/token-resolver.js'

export interface AppContext {
  tenantId: string
  authClaims?: JWTPayload
  storeId: string | undefined
  contaAzulClient: ContaAzulClient | undefined
}

export function getTokenStore(): TenantTokenStore {
  return tenantTokenStore
}

/** @deprecated Use getTokenStore() */
export function getTokenResolver(): TenantTokenStore {
  return tenantTokenStore
}

export async function listConnectedStoreIds(tenantId: string): Promise<string[]> {
  return connectionService.listConnectedStoreIds(tenantId)
}

export async function getContaAzulClientForStore(
  tenantId: string,
  storeId: string
): Promise<ContaAzulClient | undefined> {
  return connectionService.getClientForStore(tenantId, storeId)
}

export async function buildContext(_initial: YogaInitialContext): Promise<AppContext> {
  const authClaims = getRequestAuthClaims()
  const authSettings = loadAuthSettings()
  const tenantId = resolveTenantId(authClaims, authSettings.jwtRequired)
  const storeId = extractStoreId(_initial.request)

  const contaAzulClient =
    storeId !== undefined
      ? await getContaAzulClientForStore(tenantId, storeId)
      : undefined

  return {
    tenantId,
    authClaims,
    storeId,
    contaAzulClient,
  }
}

export type { ContaAzulToken }
