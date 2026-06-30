export class ContaAzulRateLimitError extends Error {
  readonly retryAfterMs: number

  constructor(retryAfterMs: number, message = 'Conta Azul rate limit exceeded') {
    super(message)
    this.name = 'ContaAzulRateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

export function parseRetryAfterMs(header: string | null): number {
  if (!header?.trim()) return 1000
  const trimmed = header.trim()
  const asSeconds = Number.parseInt(trimmed, 10)
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.max(asSeconds * 1000, 1)
  }
  const asDate = Date.parse(trimmed)
  if (Number.isFinite(asDate)) {
    return Math.max(asDate - Date.now(), 1)
  }
  return 1000
}
