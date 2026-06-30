export function contaAzulRps(): number {
  const raw = process.env.CONTA_AZUL_RPS?.trim()
  if (!raw) return 9
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 9
}

export function contaAzulRpm(): number {
  const raw = process.env.CONTA_AZUL_RPM?.trim()
  if (!raw) return 550
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 550
}

export function contaAzulAcquireMaxWaitMs(): number {
  const raw = process.env.CONTA_AZUL_ACQUIRE_MAX_WAIT_MS?.trim()
  if (!raw) return 15_000
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000
}

export function jobStreamKey(): string {
  return process.env.JOB_STREAM_KEY?.trim() || 'conta_azul:jobs'
}

export function progressReportEveryN(): number {
  const raw = process.env.PROGRESS_REPORT_EVERY_N?.trim()
  if (!raw) return 5
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5
}

export function progressReportMinIntervalMs(): number {
  const raw = process.env.PROGRESS_REPORT_MIN_INTERVAL_MS?.trim()
  if (!raw) return 2000
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2000
}

export function saleItemsMaxConcurrencyPerStore(): number {
  const rps = contaAzulRps()
  const raw = process.env.SALE_ITEMS_MAX_CONCURRENCY_PER_STORE?.trim()
  if (!raw) return rps
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return rps
  return Math.min(parsed, rps)
}
