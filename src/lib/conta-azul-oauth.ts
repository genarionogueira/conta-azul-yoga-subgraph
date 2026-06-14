import type { ContaAzulToken } from './token-resolver.js'

export interface BuildAuthorizationUrlParams {
  clientId: string
  redirectUri: string
  state: string
  scope: string
  authUrl: string
}

export function buildAuthorizationUrl(params: BuildAuthorizationUrlParams): string {
  const url = new URL(params.authUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('state', params.state)
  url.searchParams.set('scope', params.scope)
  return url.toString()
}

export interface ExchangeAuthorizationCodeParams {
  code: string
  redirectUri: string
  clientId: string
  clientSecret: string
  tokenUrl: string
}

export class OAuthExchangeError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'OAuthExchangeError'
    this.status = status
  }
}

export async function exchangeAuthorizationCode(
  params: ExchangeAuthorizationCodeParams
): Promise<ContaAzulToken> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
  })
  const credentials = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString(
    'base64'
  )
  const res = await fetch(params.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body,
  })
  if (!res.ok) {
    throw new OAuthExchangeError(
      `Authorization code exchange failed: ${res.status}`,
      res.status
    )
  }
  const data = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
}
