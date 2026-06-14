export class RedirectUriError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RedirectUriError'
  }
}

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthConfigError'
  }
}

function isAllowedHttpRedirect(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  if (hostname.includes('mock-conta-azul')) return true
  if (hostname === 'yoga-subgraph') return true
  if (hostname.endsWith('.local')) return true
  return false
}

export function validateRedirectUri(uri: string): void {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    throw new RedirectUriError('Invalid redirect URI format')
  }
  if (parsed.protocol === 'https:') return
  if (parsed.protocol === 'http:' && isAllowedHttpRedirect(parsed.hostname)) return
  throw new RedirectUriError(
    'Invalid redirect URI: must use HTTPS or http://localhost (or E2E mock host)'
  )
}

export class AuthConfig {
  getRedirectUri(): string | null {
    const value = process.env.CONTA_AZUL_REDIRECT_URI?.trim()
    return value || null
  }

  requireRedirectUri(): string {
    const uri = this.getRedirectUri()
    if (!uri) {
      throw new AuthConfigError('CONTA_AZUL_REDIRECT_URI is not configured')
    }
    validateRedirectUri(uri)
    return uri
  }

  getAuthUrl(): string {
    return process.env.CONTA_AZUL_AUTH_URL ?? 'https://auth.contaazul.com/login'
  }

  getTokenUrl(): string {
    return process.env.CONTA_AZUL_TOKEN_URL ?? 'https://auth.contaazul.com/oauth2/token'
  }

  getScope(): string {
    return (
      process.env.CONTA_AZUL_OAUTH_SCOPE ??
      'openid profile aws.cognito.signin.user.admin'
    )
  }

  getClientId(): string {
    return process.env.CONTA_AZUL_CLIENT_ID ?? ''
  }

  getClientSecret(): string {
    return process.env.CONTA_AZUL_CLIENT_SECRET ?? ''
  }

  getClientIdConfigured(): boolean {
    return Boolean(this.getClientId() && this.getClientSecret())
  }

  snapshot(): {
    redirectUri: string | null
    authUrl: string
    tokenUrl: string
    clientIdConfigured: boolean
  } {
    const redirectUri = this.getRedirectUri()
    if (redirectUri) {
      validateRedirectUri(redirectUri)
    }
    return {
      redirectUri,
      authUrl: this.getAuthUrl(),
      tokenUrl: this.getTokenUrl(),
      clientIdConfigured: this.getClientIdConfigured(),
    }
  }
}
