import { describe, expect, it } from 'vitest'
import { parseTtl } from '../../../src/lib/cache/ttl-parser.js'

describe('parseTtl', () => {
  it('Given24h_WhenParsing_ThenReturns86400000ms', () => {
    expect(parseTtl('24h')).toBe(86_400_000)
  })

  it('Given30m_WhenParsing_ThenReturns1800000ms', () => {
    expect(parseTtl('30m')).toBe(1_800_000)
  })

  it('Given60s_WhenParsing_ThenReturns60000ms', () => {
    expect(parseTtl('60s')).toBe(60_000)
  })

  it('GivenPlainSeconds_WhenParsing_ThenReturnsMilliseconds', () => {
    expect(parseTtl('90')).toBe(90_000)
  })

  it('GivenInvalidSuffix_WhenParsing_ThenThrows', () => {
    expect(() => parseTtl('1x')).toThrow('Unrecognized TTL format')
  })

  it('GivenEmptyString_WhenParsing_ThenThrows', () => {
    expect(() => parseTtl('')).toThrow('Unrecognized TTL format')
  })

  it('GivenZeroHours_WhenParsing_ThenReturnsZero', () => {
    expect(parseTtl('0h')).toBe(0)
  })

  it('GivenNonIntegerHours_WhenParsing_ThenThrows', () => {
    expect(() => parseTtl('1.5h')).toThrow('Unrecognized TTL format')
  })

  it('GivenWhitespacePadded_WhenParsing_ThenThrows', () => {
    expect(() => parseTtl(' 24h')).toThrow('Unrecognized TTL format')
  })
})
