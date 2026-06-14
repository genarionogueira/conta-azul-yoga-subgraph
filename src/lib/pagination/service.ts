import type { Document, Sort } from 'mongodb'
import { encodeCursor, decodeCursor } from './cursor.js'
import type { Connection, ConnectionArgs } from './types.js'
import { validateConnectionArgs } from './validate-args.js'
import type { MongoRepository } from '../mongo/repository.js'

const DEFAULT_PAGE_SIZE = 10

export async function buildConnection<T extends Document>(
  repo: MongoRepository<T>,
  args: ConnectionArgs,
  sort?: Sort
): Promise<Connection<T>> {
  validateConnectionArgs(args)
  const { first, after, last, before, where, distinct_on } = args

  if (last != null && first == null) {
    return buildBackward(repo, { last, before, where, distinct_on }, sort)
  }
  return buildForward(repo, { first: first ?? DEFAULT_PAGE_SIZE, after, where, distinct_on }, sort)
}

async function buildForward<T extends Document>(
  repo: MongoRepository<T>,
  args: { first: number; after?: string | null; where?: ConnectionArgs['where']; distinct_on?: ConnectionArgs['distinct_on'] },
  sort?: Sort
): Promise<Connection<T>> {
  const { first, after, where, distinct_on: distinctOn } = args
  const afterOffset = after != null ? decodeCursor(after) : -1
  const skip = Number.isNaN(afterOffset) ? 0 : afterOffset + 1

  const [items, totalCount] = await Promise.all([
    repo.findMany({ where, limit: first + 1, offset: skip, sort, distinctOn }),
    repo.count(where, distinctOn),
  ])

  const hasNextPage = items.length > first
  const nodes = (hasNextPage ? items.slice(0, first) : items) as T[]
  const edges = nodes.map((node, i) => ({ cursor: encodeCursor(skip + i), node }))

  return buildConnectionResult(edges, nodes, {
    hasNextPage,
    hasPreviousPage: skip > 0,
    totalCount,
  })
}

async function buildBackward<T extends Document>(
  repo: MongoRepository<T>,
  args: { last: number; before?: string | null; where?: ConnectionArgs['where']; distinct_on?: ConnectionArgs['distinct_on'] },
  sort?: Sort
): Promise<Connection<T>> {
  const { last, before, where, distinct_on: distinctOn } = args
  const totalCount = await repo.count(where, distinctOn)
  const beforeOffset = before != null ? decodeCursor(before) : totalCount
  const resolvedBefore = Number.isNaN(beforeOffset) ? totalCount : beforeOffset
  const skip = Math.max(0, resolvedBefore - last)
  const take = resolvedBefore - skip

  const items =
    take > 0 ? await repo.findMany({ where, limit: take, offset: skip, sort, distinctOn }) : []
  const nodes = items as T[]
  const edges = nodes.map((node, i) => ({ cursor: encodeCursor(skip + i), node }))

  return buildConnectionResult(edges, nodes, {
    hasNextPage: resolvedBefore < totalCount,
    hasPreviousPage: skip > 0,
    totalCount,
  })
}

function buildConnectionResult<T extends Document>(
  edges: Array<{ cursor: string; node: T }>,
  nodes: T[],
  args: { hasNextPage: boolean; hasPreviousPage: boolean; totalCount: number }
): Connection<T> {
  const { hasNextPage, hasPreviousPage, totalCount } = args
  return {
    edges,
    nodes,
    pageInfo: {
      hasNextPage,
      hasPreviousPage,
      startCursor: edges.length > 0 ? edges[0].cursor : null,
      endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
    },
    totalCount,
    diagnostics: [],
  }
}
