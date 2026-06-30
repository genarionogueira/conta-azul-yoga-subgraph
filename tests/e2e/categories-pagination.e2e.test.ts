import { describe, it, expect, beforeAll } from 'vitest'
import { gqlClient } from './helpers/gql-client.js'
import { DEFAULT_DEV_TENANT_ID } from '../../src/lib/auth/tenant-context.js'
import { clearTenantRateLimits } from './helpers/redis-e2e.js'
import { clearStoreCategories } from './helpers/mongo-e2e.js'
import { syncStoreCategoriesViaMutation } from './helpers/worker-sync.js'
import { removePriorityStubs } from './helpers/wiremock-admin.js'
import { reseedDefaultE2eConnections } from './setup.js'

function getRedisUrl(): string {
  const base = process.env.E2E_REDIS_URL
  if (!base) throw new Error('E2E_REDIS_URL not set — globalSetup may not have run')
  return base
}

interface ContaAzulCategoryConnection {
  nodes: Array<{ id: string; nome?: string; tipo?: string }>
  edges: Array<{ cursor: string; node: { id: string } }>
  pageInfo: {
    hasNextPage: boolean
    hasPreviousPage: boolean
    startCursor: string | null
    endCursor: string | null
  }
  totalCount: number
}

/** Seeded in globalSetup; excludes optional store-oauth from auth-connect tests. */
const SEEDED_STORES_WHERE = `storeId: { _in: ["store-1", "store-2"] }`

describe('E2E: Relay pagination — categories domain', () => {
  beforeAll(async () => {
    const redisUrl = getRedisUrl()
    await removePriorityStubs()
    await clearTenantRateLimits(redisUrl, DEFAULT_DEV_TENANT_ID)
    await reseedDefaultE2eConnections(redisUrl)
    await clearStoreCategories('store-1', DEFAULT_DEV_TENANT_ID)
    await clearStoreCategories('store-2', DEFAULT_DEV_TENANT_ID)
    await syncStoreCategoriesViaMutation('store-1', DEFAULT_DEV_TENANT_ID)
    await syncStoreCategoriesViaMutation('store-2', DEFAULT_DEV_TENANT_ID)
  })

  it('should return first 3 items with hasNextPage=true when more items exist', async () => {
    const data = await gqlClient<{ contaAzulCategories: ContaAzulCategoryConnection }>(
      `query {
        contaAzulCategories(first: 3) {
          nodes { id nome }
          edges { cursor node { id } }
          pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
          totalCount
        }
      }`
    )
    expect(data.contaAzulCategories.edges.length).toBeGreaterThan(0)
    expect(data.contaAzulCategories.edges.length).toBeLessThanOrEqual(3)
    expect(data.contaAzulCategories.nodes.length).toBe(data.contaAzulCategories.edges.length)
    expect(data.contaAzulCategories.pageInfo.hasNextPage).toBe(true)
    expect(data.contaAzulCategories.pageInfo.hasPreviousPage).toBe(false)
    expect(data.contaAzulCategories.pageInfo.endCursor).toBeTruthy()
    expect(data.contaAzulCategories.totalCount).toBeGreaterThan(3)
  })

  it('should return next page using after cursor', async () => {
    const first = await gqlClient<{ contaAzulCategories: ContaAzulCategoryConnection }>(
      `query {
        contaAzulCategories(first: 2, where: { ${SEEDED_STORES_WHERE} }) {
          edges { cursor node { id storeId } }
          pageInfo { endCursor }
        }
      }`
    )
    expect(first.contaAzulCategories.edges.length).toBe(2)
    const endCursor = first.contaAzulCategories.pageInfo.endCursor!
    const second = await gqlClient<{ contaAzulCategories: ContaAzulCategoryConnection }>(
      `query {
        contaAzulCategories(first: 2, after: "${endCursor}", where: { ${SEEDED_STORES_WHERE} }) {
          edges { cursor node { id storeId } }
          pageInfo { hasNextPage hasPreviousPage }
        }
      }`
    )
    const firstIds = first.contaAzulCategories.edges.map((e) => `${e.node.id}:${e.node.storeId ?? ''}`)
    const secondIds = second.contaAzulCategories.edges.map((e) => `${e.node.id}:${e.node.storeId ?? ''}`)
    expect(secondIds.length).toBeGreaterThan(0)
    expect(firstIds.every((id) => !secondIds.includes(id))).toBe(true)
    expect(second.contaAzulCategories.pageInfo.hasPreviousPage).toBe(true)
  })

  it('should return hasNextPage=false on the last page', async () => {
    const data = await gqlClient<{ contaAzulCategories: ContaAzulCategoryConnection }>(
      `query {
        contaAzulCategories(first: 1000) {
          pageInfo { hasNextPage }
          totalCount
          edges { cursor node { id } }
        }
      }`
    )
    expect(data.contaAzulCategories.pageInfo.hasNextPage).toBe(false)
  })

  it('should return totalCount for all items when unfiltered', async () => {
    const data = await gqlClient<{ contaAzulCategories: ContaAzulCategoryConnection }>(
      `query {
        contaAzulCategories(first: 1, where: { ${SEEDED_STORES_WHERE} }) {
          totalCount
          nodes { id }
        }
      }`
    )
    expect(data.contaAzulCategories.totalCount).toBe(4)
    expect(data.contaAzulCategories.nodes).toHaveLength(1)
  })

  it('should return totalCount matching filtered results', async () => {
    const data = await gqlClient<{ contaAzulCategories: ContaAzulCategoryConnection }>(
      `query {
        contaAzulCategories(first: 1, where: { _and: [{ ${SEEDED_STORES_WHERE} }, { tipo: { _eq: "RECEITA" } }] }) {
          totalCount
          nodes { tipo }
        }
      }`
    )
    expect(data.contaAzulCategories.totalCount).toBe(2)
    expect(data.contaAzulCategories.nodes).toHaveLength(1)
    expect(data.contaAzulCategories.nodes[0]?.tipo).toBe('RECEITA')
  })

  it('should combine where filter with first/after pagination', async () => {
    const data = await gqlClient<{ contaAzulCategories: ContaAzulCategoryConnection }>(
      `query {
        contaAzulCategories(first: 5, where: { _and: [{ ${SEEDED_STORES_WHERE} }, { tipo: { _eq: "RECEITA" } }] }) {
          nodes { tipo }
          pageInfo { hasNextPage }
          totalCount
        }
      }`
    )
    expect(data.contaAzulCategories.nodes.every((n) => n.tipo === 'RECEITA')).toBe(true)
    expect(data.contaAzulCategories.totalCount).toBe(2)
  })

  it('should return last N items using last/before', async () => {
    const all = await gqlClient<{ contaAzulCategories: ContaAzulCategoryConnection }>(
      `query {
        contaAzulCategories(first: 1000) {
          edges { cursor node { id } }
        }
      }`
    )
    expect(all.contaAzulCategories.edges.length).toBeGreaterThan(2)
    const middleCursor = all.contaAzulCategories.edges[2].cursor
    const data = await gqlClient<{ contaAzulCategories: ContaAzulCategoryConnection }>(
      `query {
        contaAzulCategories(last: 2, before: "${middleCursor}") {
          edges { node { id } }
          pageInfo { hasPreviousPage hasNextPage }
        }
      }`
    )
    expect(data.contaAzulCategories.edges).toHaveLength(2)
    expect(data.contaAzulCategories.pageInfo.hasNextPage).toBe(true)
  })
})
