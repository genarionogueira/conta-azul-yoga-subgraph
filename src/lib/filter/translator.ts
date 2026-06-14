import type { BoolExp } from './types.js'

export type MongoFilter = Record<string, unknown>

const LOGICAL_KEYS = new Set(['_and', '_or', '_not'])

const OPERATOR_MAP: Record<string, string> = {
  _eq: '$eq',
  _neq: '$ne',
  _gt: '$gt',
  _gte: '$gte',
  _lt: '$lt',
  _lte: '$lte',
  _in: '$in',
  _nin: '$nin',
  _regex: '$regex',
}

function likeToRegex(pattern: string): string {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return escaped.replace(/%/g, '.*')
}

function translateOps(ops: Record<string, unknown>): MongoFilter {
  const mongoOps: MongoFilter = {}

  for (const [key, value] of Object.entries(ops)) {
    if (value === null || value === undefined) {
      continue
    }

    if (key === '_is_null') {
      if (value === true) {
        mongoOps.$eq = null
      } else if (value === false) {
        mongoOps.$ne = null
      }
      continue
    }

    if (key === '_like' || key === '_ilike') {
      mongoOps.$regex = likeToRegex(String(value))
      mongoOps.$options = 'i'
      continue
    }

    const mongoKey = OPERATOR_MAP[key]
    if (mongoKey) {
      mongoOps[mongoKey] = value
    }
  }

  return mongoOps
}

function translateExpr(expr: BoolExp): MongoFilter {
  const result: MongoFilter = {}

  for (const [key, value] of Object.entries(expr)) {
    if (value === null || value === undefined) {
      continue
    }

    if (key === '_and') {
      const items = value as BoolExp[]
      if (items.length > 0) {
        result.$and = items.map((item) => translateExpr(item))
      }
      continue
    }

    if (key === '_or') {
      const items = value as BoolExp[]
      if (items.length > 0) {
        result.$or = items.map((item) => translateExpr(item))
      }
      continue
    }

    if (key === '_not') {
      result.$nor = [translateExpr(value as BoolExp)]
      continue
    }

    if (LOGICAL_KEYS.has(key)) {
      continue
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      const mongoOps = translateOps(value as Record<string, unknown>)
      // Hasura-style: empty comparison exp (e.g. storeId: {}) means no constraint on that field.
      if (Object.keys(mongoOps).length > 0) {
        result[key] = mongoOps
      }
    }
  }

  return result
}

export function buildMongoFilter(where: BoolExp | null | undefined): MongoFilter {
  if (!where || Object.keys(where).length === 0) {
    return {}
  }
  return translateExpr(where)
}
