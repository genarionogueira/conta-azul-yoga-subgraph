import { describe, expect, it, vi } from 'vitest'
import {
  getSalesWatermark,
  maxDataAlteracao,
  setSalesWatermark,
  shrinkWindowStart,
} from '../../../src/lib/sync/watermark.js'

describe('watermark', () => {
  it('GivenWatermark_WhenShrinkingWindow_ThenSubtractsOverlapDay', () => {
    const start = shrinkWindowStart('2026-01-10T00:00:00.000Z', '2026-01-01')
    expect(start).toBe('2026-01-09')
  })

  it('GivenNoWatermark_WhenShrinkingWindow_ThenUsesDefault', () => {
    expect(shrinkWindowStart(null, '2026-01-01')).toBe('2026-01-01')
  })

  it('GivenSales_WhenComputingMaxDataAlteracao_ThenReturnsLatest', () => {
    expect(
      maxDataAlteracao(['2026-01-01', '2026-01-05', null, '2026-01-03'])
    ).toBe('2026-01-05')
  })

  it('GivenRedis_WhenSettingWatermark_ThenReadsBack', async () => {
    const values = new Map<string, string>()
    const redis = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        values.set(key, value)
        return 'OK'
      }),
    }
    await setSalesWatermark(redis as never, 'tenant-1', 'store-1', '2026-02-01')
    await expect(getSalesWatermark(redis as never, 'tenant-1', 'store-1')).resolves.toBe(
      '2026-02-01'
    )
  })
})
