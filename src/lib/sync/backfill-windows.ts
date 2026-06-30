export interface SalesWindow {
  dataInicio: string
  dataFim: string
  chunkIndex: number
  chunkTotal: number
}

function backfillMonths(): number {
  const raw = process.env.BACKFILL_MONTHS?.trim()
  const parsed = raw ? Number.parseInt(raw, 10) : 24
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function monthEnd(date: Date): string {
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
  return end.toISOString().slice(0, 10)
}

function monthStartIso(date: Date): string {
  return monthStart(date).toISOString().slice(0, 10)
}

export function planSalesWindows(now: Date = new Date()): SalesWindow[] {
  const months = backfillMonths()
  const windows: SalesWindow[] = []
  const cursor = monthStart(now)
  cursor.setUTCMonth(cursor.getUTCMonth() - (months - 1))

  const endMonth = monthStart(now)
  while (cursor <= endMonth) {
    windows.push({
      dataInicio: monthStartIso(cursor),
      dataFim: monthEnd(cursor),
      chunkIndex: windows.length,
      chunkTotal: 0,
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  const chunkTotal = windows.length
  return windows.map((window) => ({ ...window, chunkTotal }))
}

export function backfillDoneKey(
  tenantId: string,
  storeId: string,
  jobId: string
): string {
  return `conta_azul:backfill:done:${tenantId}:${storeId}:${jobId}`
}
