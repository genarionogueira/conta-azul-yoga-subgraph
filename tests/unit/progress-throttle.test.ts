import { describe, expect, it } from 'vitest'
import { shouldReportProgress } from '../../src/lib/sync/progress-throttle.js'

describe('shouldReportProgress', () => {
  it('fires every N completed items', () => {
    expect(
      shouldReportProgress({
        completed: 5,
        lastReportAtMs: 1000,
        status: 'RUNNING',
        everyN: 5,
        minIntervalMs: 2000,
        nowMs: 1500,
      })
    ).toBe(true)

    expect(
      shouldReportProgress({
        completed: 4,
        lastReportAtMs: 1000,
        status: 'RUNNING',
        everyN: 5,
        minIntervalMs: 2000,
        nowMs: 1500,
      })
    ).toBe(false)
  })

  it('fires when min interval elapsed', () => {
    expect(
      shouldReportProgress({
        completed: 4,
        lastReportAtMs: 1000,
        status: 'RUNNING',
        everyN: 5,
        minIntervalMs: 2000,
        nowMs: 3100,
      })
    ).toBe(true)
  })

  it('always fires on COMPLETE or FAILED', () => {
    expect(
      shouldReportProgress({
        completed: 1,
        lastReportAtMs: 1000,
        status: 'COMPLETE',
        everyN: 5,
        minIntervalMs: 2000,
        nowMs: 1100,
      })
    ).toBe(true)

    expect(
      shouldReportProgress({
        completed: 1,
        lastReportAtMs: 1000,
        status: 'FAILED',
        everyN: 5,
        minIntervalMs: 2000,
        nowMs: 1100,
      })
    ).toBe(true)
  })

  it('fires on first progress when completed is zero', () => {
    expect(
      shouldReportProgress({
        completed: 0,
        lastReportAtMs: null,
        status: 'RUNNING',
      })
    ).toBe(true)
  })
})
