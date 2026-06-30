import { describe, expect, it } from 'vitest'
import { computePercentage, initialBackfillResources, RESOURCE_WEIGHTS } from '../../src/lib/sync/progress.js'

describe('progress.computePercentage', () => {
  it('returns 0 for empty resources', () => {
    expect(computePercentage([])).toBe(0)
  })

  it('returns 100 when all weighted resources complete', () => {
    const resources = initialBackfillResources(2).map((resource) => {
      const total = resource.resource === 'sale_items' ? 1 : (resource.total ?? 1)
      return { ...resource, total, completed: total }
    })
    expect(computePercentage(resources)).toBe(100)
  })

  it('weights sum to 100', () => {
    const sum = Object.values(RESOURCE_WEIGHTS).reduce((acc, value) => acc + value, 0)
    expect(sum).toBe(100)
  })

  it('partial sales chunks contribute proportionally', () => {
    const resources = initialBackfillResources(4).map((resource) => {
      if (resource.resource === 'sales') {
        return { ...resource, completed: 2 }
      }
      return resource
    })
    expect(computePercentage(resources)).toBe(Math.round((35 * 0.5) / 100 * 100))
  })

  it('slim disconnect resources reach 100 when both complete', () => {
    expect(
      computePercentage(
        [
          { resource: 'metadata', total: 1, completed: 1 },
          { resource: 'credentials', total: 1, completed: 1 },
        ],
        'DISCONNECT'
      )
    ).toBe(100)
  })
})
