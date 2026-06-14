import { describe, it, expect } from 'vitest'
import { encodeCursor, decodeCursor } from '../../src/lib/pagination/cursor.js'

describe('pagination cursor', () => {
  it('GivenOffset0_WhenEncoded_ThenDecodesBackTo0', () => {
    expect(decodeCursor(encodeCursor(0))).toBe(0)
  })

  it('GivenOffset42_WhenEncoded_ThenDecodesBackTo42', () => {
    expect(decodeCursor(encodeCursor(42))).toBe(42)
  })

  it('GivenLargeOffset_WhenEncoded_ThenDecodesCorrectly', () => {
    expect(decodeCursor(encodeCursor(999999))).toBe(999999)
  })

  it('GivenEncodedCursor_ThenProducesOpaqueBase64String', () => {
    const cursor = encodeCursor(42)
    expect(cursor).not.toBe('42')
    expect(cursor).toMatch(/^[A-Za-z0-9+/=]+$/)
  })

  it('GivenNegativeOffset_WhenEncoded_ThenDecodesBackToNegative', () => {
    expect(decodeCursor(encodeCursor(-1))).toBe(-1)
  })
})
