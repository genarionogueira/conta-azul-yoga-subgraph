import type { JWTPayload } from 'jose'
import type { AppContext } from '../../context.js'
import { loadAuthSettings } from './settings.js'
import { isWorkerAuth } from './worker-auth.js'

export const ZITADEL_ORG_CLAIM = 'urn:zitadel:iam:org:id'
/** Present on Zitadel JWT access tokens when `urn:zitadel:iam:org:id:{orgId}` scope is requested. */
export const ZITADEL_RESOURCE_OWNER_CLAIM = 'urn:zitadel:iam:user:resourceowner:id'
export const DEFAULT_DEV_TENANT_ID = process.env.DEFAULT_DEV_TENANT_ID?.trim() || 'dev-tenant'
/** Sentinel tenant for avcd-worker service JWT — not a real tenant; mutations use explicit tenantId args. */
export const WORKER_CONTEXT_TENANT_ID = '__worker__'

export class TenantRequiredError extends Error {
  constructor(message = 'Tenant context is required') {
    super(message)
    this.name = 'TenantRequiredError'
  }
}

function envFlag(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === 'true'
}

export function extractTenantId(payload: JWTPayload | undefined): string | undefined {
  if (!payload) return undefined

  const customClaim = process.env.TENANT_ID_CLAIM?.trim()
  if (customClaim) {
    const value = payload[customClaim]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  const zitadelOrg = payload[ZITADEL_ORG_CLAIM]
  if (typeof zitadelOrg === 'string' && zitadelOrg.trim()) {
    return zitadelOrg.trim()
  }

  const resourceOwner = payload[ZITADEL_RESOURCE_OWNER_CLAIM]
  if (typeof resourceOwner === 'string' && resourceOwner.trim()) {
    return resourceOwner.trim()
  }

  if (envFlag('ALLOW_SUB_AS_TENANT') || !loadAuthSettings().jwtRequired) {
    const sub = payload.sub
    if (typeof sub === 'string' && sub.trim()) {
      return sub.trim()
    }
  }

  return undefined
}

export function resolveTenantId(
  authClaims: JWTPayload | undefined,
  jwtRequired = loadAuthSettings().jwtRequired
): string {
  if (isWorkerAuth(authClaims)) {
    return WORKER_CONTEXT_TENANT_ID
  }
  const fromClaims = extractTenantId(authClaims)
  if (fromClaims) return fromClaims
  if (!jwtRequired) return DEFAULT_DEV_TENANT_ID
  throw new TenantRequiredError('Unable to resolve tenant from JWT claims')
}

export function requireTenant(context: AppContext | undefined): string {
  if (!context?.tenantId) {
    throw new TenantRequiredError('Tenant context is required')
  }
  return context.tenantId
}
