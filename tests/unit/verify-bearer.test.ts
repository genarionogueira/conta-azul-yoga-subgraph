import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'

import { authenticateRequest, BearerAuthError, extractBearerToken } from '../../src/lib/auth/verify-bearer.js'
import type { AuthSettings } from '../../src/lib/auth/settings.js'

const baseSettings: AuthSettings = {
  jwtRequired: true,
  keycloakEnabled: false,
  jwtIssuer: 'avcd',
  jwtAudience: 'conta-azul-service',
  jwtSecret: 'test-secret-min-32-chars-long-enough',
}

async function signHs256Token(secret: string): Promise<string> {
  return new SignJWT({ sub: 'test-user' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('avcd')
    .setAudience('conta-azul-service')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret))
}

describe('extractBearerToken', () => {
  it('GivenMissingHeader_WhenExtract_ThenThrows401', () => {
    expect(() => extractBearerToken(undefined)).toThrow(BearerAuthError)
  })
})

describe('authenticateRequest', () => {
  it('GivenJwtNotRequired_WhenNoHeader_ThenAllowsRequest', async () => {
    const request = new Request('http://localhost/graphql')
    const payload = await authenticateRequest(request, {
      ...baseSettings,
      jwtRequired: false,
    })
    expect(payload).toBeUndefined()
  })

  it('GivenJwtRequired_WhenMissingHeader_ThenThrows401', async () => {
    const request = new Request('http://localhost/graphql')
    await expect(authenticateRequest(request, baseSettings)).rejects.toBeInstanceOf(
      BearerAuthError
    )
  })

  it('GivenValidHs256Token_WhenJwtRequired_ThenVerifies', async () => {
    const token = await signHs256Token(baseSettings.jwtSecret!)
    const request = new Request('http://localhost/graphql', {
      headers: { authorization: `Bearer ${token}` },
    })

    const payload = await authenticateRequest(request, baseSettings)
    expect(payload?.sub).toBe('test-user')
  })
})
