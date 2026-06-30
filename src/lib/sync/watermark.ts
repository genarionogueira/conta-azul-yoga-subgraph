import type { Redis } from 'ioredis'

const SALES_WATERMARK_PREFIX = 'conta_azul:watermark:sales:'
const OVERLAP_DAYS = 1

function salesWatermarkKey(tenantId: string, storeId: string): string {
  return `${SALES_WATERMARK_PREFIX}${tenantId}:${storeId}`
}

export async function getSalesWatermark(
  redis: Redis,
  tenantId: string,
  storeId: string
): Promise<string | null> {
  const value = await redis.get(salesWatermarkKey(tenantId, storeId))
  return value?.trim() ? value : null
}

export async function setSalesWatermark(
  redis: Redis,
  tenantId: string,
  storeId: string,
  isoTimestamp: string
): Promise<void> {
  await redis.set(salesWatermarkKey(tenantId, storeId), isoTimestamp)
}

export function shrinkWindowStart(
  watermark: string | null,
  defaultStart: string
): string {
  if (!watermark) return defaultStart
  const parsed = Date.parse(watermark)
  if (!Number.isFinite(parsed)) return defaultStart
  const overlap = new Date(parsed)
  overlap.setUTCDate(overlap.getUTCDate() - OVERLAP_DAYS)
  const overlapIso = overlap.toISOString().slice(0, 10)
  return overlapIso < defaultStart ? defaultStart : overlapIso
}

export function maxDataAlteracao(
  values: Array<string | null | undefined>
): string | null {
  let max: string | null = null
  for (const value of values) {
    if (!value) continue
    if (!max || value > max) {
      max = value
    }
  }
  return max
}
