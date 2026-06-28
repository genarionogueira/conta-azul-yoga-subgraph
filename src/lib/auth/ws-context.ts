import type { JWTPayload } from 'jose'
import type { AuthSettings } from './settings.js'
import { BearerAuthError, extractBearerToken, verifyBearerToken } from './verify-bearer.js'
import { resolveTenantId } from './tenant-context.js'
import type { AppContext } from '../../context.js'

export async function buildWsAppContext(
  connectionParams: Record<string, unknown> | null | undefined,
  authSettings: AuthSettings
): Promise<AppContext> {
  const rawAuth =
    connectionParams?.authorization ?? connectionParams?.Authorization
  let authClaims: JWTPayload | undefined

  if (typeof rawAuth === 'string' && rawAuth.startsWith('Bearer ')) {
    try {
      authClaims = await verifyBearerToken(
        extractBearerToken(rawAuth),
        authSettings
      )
    } catch {
      if (authSettings.jwtRequired) {
        throw new BearerAuthError('Invalid WebSocket token')
      }
    }
  } else if (authSettings.jwtRequired) {
    throw new BearerAuthError('WebSocket authorization required')
  }

  const tenantId = resolveTenantId(authClaims, authSettings.jwtRequired)
  return {
    tenantId,
    authClaims,
    storeId: undefined,
    contaAzulClient: undefined,
  }
}
