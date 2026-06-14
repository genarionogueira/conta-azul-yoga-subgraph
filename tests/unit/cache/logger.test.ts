import { describe, expect, it, vi, beforeEach } from 'vitest'
import { logCache } from '../../../src/lib/cache/logger.js'

describe('logCache', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('GivenEventAndFields_WhenLogging_ThenFormatsCachePrefix', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    logCache('fresh_hit', { key: 'col:store-1', entity: 'ContaAzulCategory' })
    expect(info).toHaveBeenCalledWith(
      '[cache] event=fresh_hit key=col:store-1 entity=ContaAzulCategory'
    )
  })

  it('GivenUndefinedFields_WhenLogging_ThenOmitsUndefined', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    logCache('skip_no_stores', { entity: 'ContaAzulCategory', storeIds: undefined })
    expect(info).toHaveBeenCalledWith(
      '[cache] event=skip_no_stores entity=ContaAzulCategory'
    )
  })

  it('GivenWarnEvent_WhenLogging_ThenUsesConsoleWarn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logCache('skip_no_token', { key: 'k', storeId: 'store-1' })
    expect(warn).toHaveBeenCalled()
  })
})
