import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AuthConfig,
  AuthConfigError,
  RedirectUriError,
  validateRedirectUri,
} from '../../src/lib/auth-config.js'

describe('validateRedirectUri', () => {
  it('GivenHttpsUri_WhenValidating_ThenPasses', () => {
    expect(() => validateRedirectUri('https://app.example.com/callback')).not.toThrow()
  })

  it('GivenLocalhostHttpUri_WhenValidating_ThenPasses', () => {
    expect(() => validateRedirectUri('http://localhost:4000/callback')).not.toThrow()
  })

  it('GivenMockContaAzulHttpUri_WhenValidating_ThenPasses', () => {
    expect(() =>
      validateRedirectUri('http://mock-conta-azul:8080/callback')
    ).not.toThrow()
  })

  it('GivenYogaSubgraphHttpUri_WhenValidating_ThenPasses', () => {
    expect(() =>
      validateRedirectUri('http://yoga-subgraph:4000/callback')
    ).not.toThrow()
  })

  it('GivenInvalidFormat_WhenValidating_ThenThrowsRedirectUriError', () => {
    expect(() => validateRedirectUri('not-a-url')).toThrow(RedirectUriError)
  })

  it('GivenHttpNonLocalhost_WhenValidating_ThenThrowsRedirectUriError', () => {
    expect(() => validateRedirectUri('http://example.com/callback')).toThrow(
      RedirectUriError
    )
  })
})

describe('AuthConfig', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
  })

  afterEach(() => {
    process.env = env
  })

  it('GivenNoRedirectUri_WhenGetRedirectUri_ThenReturnsNull', () => {
    delete process.env.CONTA_AZUL_REDIRECT_URI
    const config = new AuthConfig()
    expect(config.getRedirectUri()).toBeNull()
  })

  it('GivenRedirectUri_WhenRequireRedirectUri_ThenReturnsTrimmedValue', () => {
    process.env.CONTA_AZUL_REDIRECT_URI = '  http://localhost:4000/callback  '
    const config = new AuthConfig()
    expect(config.requireRedirectUri()).toBe('http://localhost:4000/callback')
  })

  it('GivenNoRedirectUri_WhenRequireRedirectUri_ThenThrowsAuthConfigError', () => {
    delete process.env.CONTA_AZUL_REDIRECT_URI
    const config = new AuthConfig()
    expect(() => config.requireRedirectUri()).toThrow(AuthConfigError)
  })

  it('GivenDefaultEnv_WhenGetAuthUrl_ThenReturnsContaAzulLogin', () => {
    delete process.env.CONTA_AZUL_AUTH_URL
    const config = new AuthConfig()
    expect(config.getAuthUrl()).toBe('https://auth.contaazul.com/login')
  })

  it('GivenCustomAuthUrl_WhenGetAuthUrl_ThenReturnsEnvValue', () => {
    process.env.CONTA_AZUL_AUTH_URL = 'https://custom.auth/login'
    const config = new AuthConfig()
    expect(config.getAuthUrl()).toBe('https://custom.auth/login')
  })

  it('GivenClientCredentials_WhenGetClientIdConfigured_ThenReturnsTrue', () => {
    process.env.CONTA_AZUL_CLIENT_ID = 'client-id'
    process.env.CONTA_AZUL_CLIENT_SECRET = 'client-secret'
    const config = new AuthConfig()
    expect(config.getClientIdConfigured()).toBe(true)
  })

  it('GivenMissingSecret_WhenGetClientIdConfigured_ThenReturnsFalse', () => {
    process.env.CONTA_AZUL_CLIENT_ID = 'client-id'
    delete process.env.CONTA_AZUL_CLIENT_SECRET
    const config = new AuthConfig()
    expect(config.getClientIdConfigured()).toBe(false)
  })

  it('GivenValidRedirectUri_WhenSnapshot_ThenIncludesAllFields', () => {
    process.env.CONTA_AZUL_REDIRECT_URI = 'http://localhost:4000/callback'
    process.env.CONTA_AZUL_CLIENT_ID = 'client-id'
    process.env.CONTA_AZUL_CLIENT_SECRET = 'client-secret'
    const config = new AuthConfig()
    expect(config.snapshot()).toEqual({
      redirectUri: 'http://localhost:4000/callback',
      authUrl: 'https://auth.contaazul.com/login',
      tokenUrl: 'https://auth.contaazul.com/oauth2/token',
      clientIdConfigured: true,
    })
  })
})
