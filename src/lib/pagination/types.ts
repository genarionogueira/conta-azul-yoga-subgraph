import type { CategoryQueryDiagnostic } from '../diagnostics/types.js'
import type { BoolExp } from '../filter/types.js'

export interface ConnectionArgs {
  first?: number | null
  after?: string | null
  last?: number | null
  before?: string | null
  where?: BoolExp | null
  distinct_on?: string[] | null
}

export interface PageInfo {
  hasNextPage: boolean
  hasPreviousPage: boolean
  startCursor: string | null
  endCursor: string | null
}

export interface Edge<T> {
  cursor: string
  node: T
}

export interface Connection<T> {
  edges: Edge<T>[]
  nodes: T[]
  pageInfo: PageInfo
  totalCount: number
  diagnostics: CategoryQueryDiagnostic[]
}
