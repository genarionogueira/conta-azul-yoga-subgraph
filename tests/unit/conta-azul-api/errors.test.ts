import { describe, expect, it } from 'vitest'
import { parseRetryAfterMs } from '../../../src/lib/conta-azul-api/errors.js'

describe('parseRetryAfterMs', () => {
  it('GivenSecondsHeader_WhenParsing_ThenReturnsMs', () => {
    expect(parseRetryAfterMs('2')).toBe(2000)
  })

  it('GivenMissingHeader_WhenParsing_ThenDefaults', () => {
    expect(parseRetryAfterMs(null)).toBe(1000)
  })
})
