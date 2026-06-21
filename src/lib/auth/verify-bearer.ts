import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

import { type AuthSettings } from './settings.js'

export class BearerAuthError extends Error {
  readonly statusCode: number
  readonly wwwAuthenticate: string

  constructor(message: string, statusCode = 401) {
    super(message)
    this.name = 'BearerAuthError'
    this.statusCode = statusCode
    this.wwwAuthenticate =
      statusCode === 401 ? 'Bearer error="invalid_token"' : 'Bearer'
  }
}

export function extractBearerToken(authorization: string | null | undefined): string {
  if (!authorization?.startsWith('Bearer ')) {
    throw new BearerAuthError('Missing Authorization header')
  }

  const token = authorization.slice('Bearer '.length).trim()
  if (!token || token.split('.').length !== 3) {
    throw new BearerAuthError('Invalid bearer token')
  }

  return token
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwks(url: string) {
  const cached = jwksCache.get(url)
  if (cached) return cached
  const jwks = createRemoteJWKSet(new URL(url))
  jwksCache.set(url, jwks)
  return jwks
}

async function verifyZitadelToken(
  token: string,
  settings: AuthSettings
): Promise<JWTPayload> {
  const issuer = settings.zitadelIssuer
  if (!issuer) {
    throw new BearerAuthError('Zitadel auth is not configured')
  }

  const verifyOptions: Parameters<typeof jwtVerify>[2] = { issuer }
  if (settings.zitadelProjectId) {
    // Zitadel adds the raw project ID to the token `aud` claim when the client
    // requests the `urn:zitadel:iam:org:project:id:{id}:aud` scope. The URN is
    // the request scope, never the audience value, so validate the bare ID.
    verifyOptions.audience = settings.zitadelProjectId
  }

  const { payload } = await jwtVerify(token, getJwks(`${issuer}/oauth/v2/keys`), verifyOptions)
  return payload
}

async function verifyKeycloakToken(
  token: string,
  settings: AuthSettings
): Promise<JWTPayload> {
  const issuer = settings.keycloakIssuer
  if (!issuer) {
    throw new BearerAuthError('Keycloak auth is not configured')
  }

  const verifyOptions: Parameters<typeof jwtVerify>[2] = { issuer }
  if (settings.keycloakAudience) {
    verifyOptions.audience = settings.keycloakAudience
  }

  const jwksUrl = `${issuer}/protocol/openid-connect/certs`
  const { payload } = await jwtVerify(token, getJwks(jwksUrl), verifyOptions)
  return payload
}

async function verifyHs256Token(
  token: string,
  settings: AuthSettings
): Promise<JWTPayload> {
  if (!settings.jwtSecret) {
    throw new BearerAuthError('HS256 auth is not configured')
  }

  const secret = new TextEncoder().encode(settings.jwtSecret)
  const { payload } = await jwtVerify(token, secret, {
    issuer: settings.jwtIssuer,
    audience: settings.jwtAudience,
    algorithms: ['HS256'],
  })
  return payload
}

export async function verifyBearerToken(
  token: string,
  settings: AuthSettings
): Promise<JWTPayload> {
  const errors: string[] = []

  if (settings.zitadelIssuer) {
    try {
      return await verifyZitadelToken(token, settings)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Zitadel validation failed')
    }
  }

  if (settings.keycloakEnabled && settings.keycloakIssuer) {
    try {
      return await verifyKeycloakToken(token, settings)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Keycloak validation failed')
    }
  }

  if (settings.jwtSecret) {
    try {
      return await verifyHs256Token(token, settings)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'HS256 validation failed')
    }
  }

  throw new BearerAuthError(
    errors[0] ?? 'No authentication method configured',
  )
}

export async function authenticateRequest(
  request: Request,
  settings: AuthSettings
): Promise<JWTPayload | undefined> {
  if (!settings.jwtRequired) {
    return undefined
  }

  const token = extractBearerToken(request.headers.get('authorization'))
  return verifyBearerToken(token, settings)
}
