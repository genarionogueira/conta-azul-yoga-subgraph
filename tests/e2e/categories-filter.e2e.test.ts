import { describe, it, expect } from 'vitest'
import { gqlClient } from './helpers/gql-client.js'

const SEEDED_STORES_WHERE = `storeId: { _in: ["store-1", "store-2"] }`

describe('E2E: Hasura filtering + MongoDB cache — categories domain', () => {
  it('should return all categories when no filter supplied', async () => {
    const data = await gqlClient<{
      contaAzulCategories: { nodes: unknown[]; totalCount: number }
    }>(
      `query { contaAzulCategories(where: { ${SEEDED_STORES_WHERE} }) { totalCount nodes { id nome tipo storeId } } }`
    )
    expect(data.contaAzulCategories.nodes.length).toBeGreaterThan(0)
    expect(data.contaAzulCategories.totalCount).toBe(4)
    expect(data.contaAzulCategories.nodes[0]).toHaveProperty('storeId')
  })

  it('should filter by tipo using _eq', async () => {
    const data = await gqlClient<{
      contaAzulCategories: { nodes: Array<{ tipo: string }>; totalCount: number }
    }>(
      `query { contaAzulCategories(where: { _and: [{ ${SEEDED_STORES_WHERE} }, { tipo: { _eq: "RECEITA" } }] }) { totalCount nodes { id tipo } } }`
    )
    expect(data.contaAzulCategories.totalCount).toBe(2)
    expect(data.contaAzulCategories.nodes.every((c) => c.tipo === 'RECEITA')).toBe(true)
  })

  it('should filter by nome using _like', async () => {
    const data = await gqlClient<{ contaAzulCategories: { nodes: Array<{ nome: string }> } }>(
      `query { contaAzulCategories(where: { nome: { _like: "%Receita%" } }) { nodes { nome } } }`
    )
    expect(data.contaAzulCategories.nodes.length).toBeGreaterThan(0)
    expect(data.contaAzulCategories.nodes.every((c) => c.nome.includes('Receita'))).toBe(true)
  })

  it('should apply first pagination', async () => {
    const data = await gqlClient<{ contaAzulCategories: { nodes: unknown[] } }>(
      `query { contaAzulCategories(first: 1) { nodes { id } } }`
    )
    expect(data.contaAzulCategories.nodes).toHaveLength(1)
  })

  it('should return categories seeded by worker without manual sync mutation', async () => {
    const data = await gqlClient<{
      contaAzulCategories: { totalCount: number; nodes: unknown[] }
    }>(
      `query { contaAzulCategories(where: { ${SEEDED_STORES_WHERE} }) { totalCount nodes { id storeId } } }`
    )
    expect(data.contaAzulCategories.totalCount).toBeGreaterThan(0)
    expect(data.contaAzulCategories.nodes.length).toBeGreaterThan(0)
  })
})
