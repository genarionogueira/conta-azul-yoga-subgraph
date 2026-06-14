import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OAuthExchangeError,
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
} from '../../src/lib/conta-azul-oauth.js'

describe('buildAuthorizationUrl', () => {
  it('GivenOAuthParams_WhenBuildingUrl_ThenIncludesRequiredQueryParams', () => {
    const url = buildAuthorizationUrl({
      authUrl: 'https://auth.example.com/login',
      clientId: 'client-id',
      redirectUri: 'http://localhost:4000/callback',
      state: 'state-token',
      scope: 'openid profile',
    })

    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://auth.example.com/login')
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('client_id')).toBe('client-id')
    expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:4000/callback')
    expect(parsed.searchParams.get('state')).toBe('state-token')
    expect(parsed.searchParams.get('scope')).toBe('openid profile')
  })
})

describe('exchangeAuthorizationCode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('GivenSuccessfulTokenResponse_WhenExchanging_ThenReturnsMappedToken', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
        }),
        { status: 200 }
      )
    )

    const token = await exchangeAuthorizationCode({
      code: 'auth-code',
      redirectUri: 'http://localhost/callback',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      tokenUrl: 'https://auth.example.com/oauth2/token',
    })

    expect(token.access_token).toBe('access-token')
    expect(token.refresh_token).toBe('refresh-token')
    expect(token.expires_at).toBeGreaterThan(Date.now())
    expect(fetch).toHaveBeenCalledWith(
      'https://auth.example.com/oauth2/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      })
    )
  })

  it('GivenFailedTokenResponse_WhenExchanging_ThenThrowsOAuthExchangeError', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('invalid_grant', { status: 400 }))

    await expect(
      exchangeAuthorizationCode({
        code: 'bad-code',
        redirectUri: 'http://localhost/callback',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        tokenUrl: 'https://auth.example.com/oauth2/token',
      })
    ).rejects.toBeInstanceOf(OAuthExchangeError)
  })
})
