import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BearerAuthError,
  extractBearerToken,
} from '../../src/lib/auth/verify-bearer.js'
import {
  loadAuthSettings,
  zitadelProjectAudience,
} from '../../src/lib/auth/settings.js'

describe('extractBearerToken', () => {
  it('GivenMissingHeader_WhenExtracting_ThenThrowsBearerAuthError', () => {
    expect(() => extractBearerToken(null)).toThrow(BearerAuthError)
    expect(() => extractBearerToken(undefined)).toThrow(BearerAuthError)
    expect(() => extractBearerToken('')).toThrow(BearerAuthError)
  })

  it('GivenNonBearerHeader_WhenExtracting_ThenThrowsBearerAuthError', () => {
    expect(() => extractBearerToken('Basic abc123')).toThrow(BearerAuthError)
  })

  it('GivenOpaqueToken_WhenExtracting_ThenThrowsInvalidBearerToken', () => {
    expect(() => extractBearerToken('Bearer opaque-token')).toThrow(
      BearerAuthError
    )
    expect(() => extractBearerToken('Bearer opaque-token')).toThrow(
      /Invalid bearer token/
    )
  })

  it('GivenJwt_WhenExtracting_ThenReturnsToken', () => {
    const jwt = 'header.payload.signature'
    expect(extractBearerToken(`Bearer ${jwt}`)).toBe(jwt)
  })
})

describe('zitadelProjectAudience', () => {
  it('GivenProjectId_WhenBuildingAudience_ThenMatchesWebDashScopeFormat', () => {
    expect(zitadelProjectAudience('proj-123')).toBe(
      'urn:zitadel:iam:org:project:id:proj-123:aud'
    )
  })
})

describe('loadAuthSettings', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
  })

  afterEach(() => {
    process.env = env
  })

  it('GivenZitadelEnv_WhenLoading_ThenReadsProjectId', () => {
    process.env.JWT_REQUIRED = 'true'
    process.env.ZITADEL_ISSUER = 'https://zitadel.avcd.ai'
    process.env.ZITADEL_PROJECT_ID = '  test-project-id  '
    process.env.KEYCLOAK_ENABLED = 'false'

    const settings = loadAuthSettings()
    expect(settings.jwtRequired).toBe(true)
    expect(settings.zitadelIssuer).toBe('https://zitadel.avcd.ai')
    expect(settings.zitadelProjectId).toBe('test-project-id')
    expect(settings.keycloakEnabled).toBe(false)
  })

  it('GivenTrailingSlashIssuer_WhenLoading_ThenStripsSlash', () => {
    process.env.ZITADEL_ISSUER = 'https://zitadel.avcd.ai/'
    const settings = loadAuthSettings()
    expect(settings.zitadelIssuer).toBe('https://zitadel.avcd.ai')
  })
})
