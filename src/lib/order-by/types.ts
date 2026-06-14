import type { Sort } from 'mongodb'

export type OrderByDirection =
  | 'asc'
  | 'asc_nulls_first'
  | 'asc_nulls_last'
  | 'desc'
  | 'desc_nulls_first'
  | 'desc_nulls_last'

export type OrderByInput = Record<string, OrderByDirection | null | undefined>

const ASC_DIRECTIONS = new Set<OrderByDirection>(['asc', 'asc_nulls_first', 'asc_nulls_last'])

function directionToMongoValue(direction: OrderByDirection): 1 | -1 {
  return ASC_DIRECTIONS.has(direction) ? 1 : -1
}

export function buildMongoSort(orderBy: OrderByInput[] | null | undefined): Sort | undefined {
  if (!orderBy || orderBy.length === 0) {
    return undefined
  }

  const sort: Sort = {}

  for (const clause of orderBy) {
    for (const [field, direction] of Object.entries(clause)) {
      if (direction == null) {
        continue
      }
      sort[field] = directionToMongoValue(direction)
    }
  }

  return Object.keys(sort).length > 0 ? sort : undefined
}
