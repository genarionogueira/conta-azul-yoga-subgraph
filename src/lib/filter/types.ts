export interface StringComparisonExp {
  _eq?: string | null
  _neq?: string | null
  _in?: string[] | null
  _nin?: string[] | null
  _like?: string | null
  _ilike?: string | null
  _regex?: string | null
  _is_null?: boolean | null
}

export interface IDComparisonExp {
  _eq?: string | null
  _neq?: string | null
  _in?: string[] | null
  _nin?: string[] | null
  _is_null?: boolean | null
}

export interface IntComparisonExp {
  _eq?: number | null
  _neq?: number | null
  _gt?: number | null
  _gte?: number | null
  _lt?: number | null
  _lte?: number | null
  _in?: number[] | null
  _nin?: number[] | null
  _is_null?: boolean | null
}

export interface FloatComparisonExp extends IntComparisonExp {}

export interface BooleanComparisonExp {
  _eq?: boolean | null
  _neq?: boolean | null
  _is_null?: boolean | null
}

export type BoolExp = Record<string, unknown>

export type ComparisonExp =
  | StringComparisonExp
  | IDComparisonExp
  | IntComparisonExp
  | FloatComparisonExp
  | BooleanComparisonExp
