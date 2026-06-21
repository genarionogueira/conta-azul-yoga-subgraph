export function getWebDashPublicUrl(): string | undefined {
  const value = process.env.WEB_DASH_PUBLIC_URL?.trim()
  return value || undefined
}

function collectAllowedOrigins(): Set<string> {
  const origins = new Set<string>()
  const primary = getWebDashPublicUrl()
  if (primary) {
    try {
      origins.add(new URL(primary).origin)
    } catch {
      /* ignore invalid WEB_DASH_PUBLIC_URL */
    }
  }

  const extra = process.env.OAUTH_RETURN_URL_ORIGINS?.split(',') ?? []
  for (const item of extra) {
    const trimmed = item.trim()
    if (!trimmed) continue
    try {
      origins.add(new URL(trimmed).origin)
    } catch {
      origins.add(trimmed)
    }
  }

  return origins
}

export function validateReturnUrl(candidate: string | undefined): string | null {
  if (!candidate?.trim()) return null

  const allowedOrigins = collectAllowedOrigins()
  if (allowedOrigins.size === 0) return null

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!allowedOrigins.has(url.origin)) return null
    return url.toString()
  } catch {
    return null
  }
}

export function buildPostConnectRedirect(
  storeId: string,
  returnUrl?: string
): string | null {
  const base = validateReturnUrl(returnUrl) ?? getWebDashPublicUrl()
  if (!base) return null

  const url = new URL(base)
  url.searchParams.set('contaAzulConnected', storeId)
  return url.toString()
}
