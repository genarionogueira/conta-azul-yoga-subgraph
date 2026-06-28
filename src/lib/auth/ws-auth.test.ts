import { describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import { buildWsAppContext } from './ws-context.js'
import { BearerAuthError } from './verify-bearer.js'
import { WORKER_CONTEXT_TENANT_ID } from './tenant-context.js'

const jwtSecret = 'test-secret-for-ws-auth'

function authSettings(jwtRequired: boolean) {
  return {
    jwtRequired,
    keycloakEnabled: false,
    jwtSecret,
    jwtIssuer: 'avcd',
    jwtAudience: 'conta-azul-service',
  }
}

async function signToken(payload: Record<string, unknown>) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('avcd')
    .setAudience('conta-azul-service')
    .sign(new TextEncoder().encode(jwtSecret))
}

describe('buildWsAppContext', () => {
  it('GivenValidUserToken_WhenBuildWsAppContext_ThenResolvesTenant', async () => {
    const token = await signToken({
      sub: 'user-123',
      'urn:zitadel:iam:org:id': 'tenant-org-1',
    })
    const context = await buildWsAppContext(
      { authorization: `Bearer ${token}` },
      authSettings(true)
    )

    expect(context.tenantId).toBe('tenant-org-1')
    expect(context.authClaims?.sub).toBe('user-123')
  })

  it('GivenWorkerToken_WhenBuildWsAppContext_ThenUsesWorkerTenant', async () => {
    const token = await signToken({ sub: 'avcd-worker' })
    const context = await buildWsAppContext(
      { authorization: `Bearer ${token}` },
      authSettings(true)
    )

    expect(context.tenantId).toBe(WORKER_CONTEXT_TENANT_ID)
  })

  it('GivenJwtRequiredAndMissingAuth_WhenBuildWsAppContext_ThenThrows', async () => {
    await expect(buildWsAppContext({}, authSettings(true))).rejects.toBeInstanceOf(
      BearerAuthError
    )
  })

  it('GivenJwtOptional_WhenBuildWsAppContext_ThenUsesDefaultTenant', async () => {
    const context = await buildWsAppContext({}, authSettings(false))
    expect(context.tenantId).toBe('dev-tenant')
  })
})
