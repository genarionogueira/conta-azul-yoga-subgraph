export type AuthSettings = {
  jwtRequired: boolean
  zitadelIssuer?: string
  zitadelProjectId?: string
  keycloakEnabled: boolean
  keycloakIssuer?: string
  keycloakAudience?: string
  jwtSecret?: string
  jwtIssuer: string
  jwtAudience: string
}

function envFlag(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === 'true'
}

export function loadAuthSettings(): AuthSettings {
  const zitadelIssuer = process.env.ZITADEL_ISSUER?.trim().replace(/\/$/, '')
  const keycloakIssuer = process.env.KEYCLOAK_ISSUER?.trim().replace(/\/$/, '')

  return {
    jwtRequired: envFlag('JWT_REQUIRED'),
    zitadelIssuer: zitadelIssuer || undefined,
    zitadelProjectId: process.env.ZITADEL_PROJECT_ID?.trim() || undefined,
    keycloakEnabled: envFlag('KEYCLOAK_ENABLED'),
    keycloakIssuer: keycloakIssuer || undefined,
    keycloakAudience: process.env.KEYCLOAK_AUDIENCE?.trim() || undefined,
    jwtSecret: process.env.JWT_SECRET?.trim() || undefined,
    jwtIssuer: process.env.JWT_ISSUER?.trim() || 'avcd',
    jwtAudience: process.env.JWT_AUDIENCE?.trim() || 'conta-azul-service',
  }
}

export function logAuthSettingsOnStartup(settings: AuthSettings): void {
  const methods: string[] = []
  if (settings.zitadelIssuer) {
    methods.push(`zitadel issuer=${settings.zitadelIssuer} projectId=${settings.zitadelProjectId ?? '(none)'}`)
  }
  if (settings.keycloakEnabled && settings.keycloakIssuer) {
    methods.push(`keycloak issuer=${settings.keycloakIssuer}`)
  }
  if (settings.jwtSecret) {
    methods.push('hs256-dev-fallback')
  }

  console.log(
    `[auth] jwtRequired=${settings.jwtRequired} methods=[${methods.join(', ') || 'none'}]`
  )

  if (settings.jwtRequired && settings.zitadelIssuer && !settings.zitadelProjectId) {
    console.warn(
      '[auth] JWT_REQUIRED=true with ZITADEL_ISSUER but no ZITADEL_PROJECT_ID — audience validation is disabled'
    )
  }
}
