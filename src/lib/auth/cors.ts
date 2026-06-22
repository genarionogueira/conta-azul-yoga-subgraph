export type YogaCorsOptions = {
  origin: string[]
  methods: string[]
  allowedHeaders: string[]
  credentials: boolean
}

function parseCsvEnv(value: string | undefined): string[] {
  if (!value?.trim()) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function loadCorsOptions(): YogaCorsOptions {
  const configuredOrigins = parseCsvEnv(process.env.CORS_ALLOWED_ORIGINS)
  const defaultOrigins = [
    'https://dev.avocado.tech',
    'http://localhost:3000',
    'http://localhost:3001',
  ]

  return {
    origin: configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'x-store-id'],
    credentials: true,
  }
}

export function isAllowedCorsOrigin(
  origin: string | null | undefined,
  allowedOrigins: string[]
): boolean {
  if (!origin) return false
  return allowedOrigins.includes(origin)
}
