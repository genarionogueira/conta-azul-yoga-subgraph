import type { BoolExp } from '../filter/types.js'

function collectFromComparison(
  value: unknown,
  out: Set<string>
): void {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return
  }

  const ops = value as Record<string, unknown>
  if (typeof ops._eq === 'string') {
    out.add(ops._eq)
  }
  if (Array.isArray(ops._in)) {
    for (const item of ops._in) {
      if (typeof item === 'string') out.add(item)
    }
  }
}

function walkExpr(expr: BoolExp, out: Set<string>): void {
  for (const [key, value] of Object.entries(expr)) {
    if (value == null) continue

    if (key === '_and' || key === '_or') {
      for (const item of value as BoolExp[]) {
        walkExpr(item, out)
      }
      continue
    }

    if (key === '_not') {
      walkExpr(value as BoolExp, out)
      continue
    }

    if (key === 'storeId') {
      collectFromComparison(value, out)
    }
  }
}

export function extractStoreIdsFromWhere(where: BoolExp | null | undefined): string[] {
  if (!where) return []
  const ids = new Set<string>()
  walkExpr(where, ids)
  return [...ids].sort()
}
