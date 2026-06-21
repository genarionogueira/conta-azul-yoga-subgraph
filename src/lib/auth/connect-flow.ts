import { AuthConfig, AuthConfigError } from '../auth-config.js'
import { buildAuthorizationUrl, exchangeAuthorizationCode } from '../conta-azul-oauth.js'
import type { OAuthStateStore } from '../oauth-state.js'
import type { TokenResolver } from '../token-resolver.js'

export type StartConnectResult = { storeId: string; url: string; state: string }

export type CompleteConnectResult =
  | { success: true; storeId: string; returnUrl?: string }
  | { success: false; storeId: string; error: string; returnUrl?: string }

export interface ConnectFlowDeps {
  authConfig: AuthConfig
  oauthStateStore: OAuthStateStore
  tokenResolver: TokenResolver
}

function requireStoreId(storeId: string): void {
  if (!storeId.trim()) {
    throw new AuthConfigError('storeId is required')
  }
}

async function exchangeAndSaveToken(
  storeId: string,
  code: string,
  deps: ConnectFlowDeps,
  returnUrl?: string
): Promise<CompleteConnectResult> {
  try {
    const redirectUri = deps.authConfig.requireRedirectUri()
    const token = await exchangeAuthorizationCode({
      code,
      redirectUri,
      clientId: deps.authConfig.getClientId(),
      clientSecret: deps.authConfig.getClientSecret(),
      tokenUrl: deps.authConfig.getTokenUrl(),
    })
    await deps.tokenResolver.saveToken(storeId, token)
    return { success: true, storeId, returnUrl }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, storeId, error: message, returnUrl }
  }
}

export async function startConnect(
  storeId: string,
  deps: ConnectFlowDeps,
  returnUrl?: string
): Promise<StartConnectResult> {
  requireStoreId(storeId)
  const redirectUri = deps.authConfig.requireRedirectUri()
  const clientId = deps.authConfig.getClientId()
  if (!clientId) {
    throw new AuthConfigError('CONTA_AZUL_CLIENT_ID is not configured')
  }
  const state = await deps.oauthStateStore.createState(storeId, returnUrl)
  const url = buildAuthorizationUrl({
    clientId,
    redirectUri,
    state,
    scope: deps.authConfig.getScope(),
    authUrl: deps.authConfig.getAuthUrl(),
  })
  return { storeId, url, state }
}

export async function completeConnect(
  storeId: string,
  code: string,
  state: string,
  deps: ConnectFlowDeps
): Promise<CompleteConnectResult> {
  requireStoreId(storeId)
  const payload = await deps.oauthStateStore.consumeState(state)
  if (!payload || payload.storeId !== storeId) {
    return {
      success: false,
      storeId,
      error: 'Invalid or expired OAuth state',
    }
  }
  return exchangeAndSaveToken(storeId, code, deps, payload.returnUrl)
}

/** OAuth callback handler — storeId is resolved from consumed state only. */
export async function completeConnectFromCallback(
  code: string,
  state: string,
  deps: ConnectFlowDeps
): Promise<CompleteConnectResult> {
  const payload = await deps.oauthStateStore.consumeState(state)
  if (!payload) {
    return {
      success: false,
      storeId: '',
      error: 'Invalid or expired OAuth state',
    }
  }
  return exchangeAndSaveToken(payload.storeId, code, deps, payload.returnUrl)
}
