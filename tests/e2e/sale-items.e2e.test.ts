import { describe, it, expect } from 'vitest'
import { gqlClient } from './helpers/gql-client.js'

const SEEDED_STORES_WHERE = `storeId: { _in: ["store-1", "store-2"] }`

describe('E2E: saleItems - worker sync then Mongo query', () => {
  it('GivenWorkerReconcile_WhenQueryingSaleItems_ThenReturnsSyncedLineItems', async () => {
    const data = await gqlClient<{
      saleItems: {
        nodes: Array<{
          id: string
          storeId: string
          saleId: string
          nome: string | null
          tipo: string | null
          quantidade: number | null
          valor: number | null
        }>
        totalCount: number
      }
    }>(
      `query {
        saleItems(where: { ${SEEDED_STORES_WHERE} }) {
          totalCount
          nodes { id storeId saleId nome tipo quantidade valor }
        }
      }`
    )

    expect(data.saleItems.totalCount).toBeGreaterThan(0)
    expect(data.saleItems.nodes.length).toBeGreaterThan(0)
    expect(data.saleItems.nodes[0]).toHaveProperty('id')
    expect(data.saleItems.nodes[0]).toHaveProperty('saleId')
    expect(data.saleItems.nodes[0]).toHaveProperty('nome')
    expect(data.saleItems.nodes[0]).toHaveProperty('quantidade')
    expect(data.saleItems.nodes[0]).toHaveProperty('valor')

    const saleOneLines = data.saleItems.nodes.filter((line) => line.saleId === 'sale-1')
    expect(saleOneLines.length).toBeGreaterThanOrEqual(1)
  })

  it('GivenSyncedItems_WhenFilteringBySaleId_ThenReturnsOnlyThatSalesLines', async () => {
    const data = await gqlClient<{
      saleItems: {
        nodes: Array<{ saleId: string }>
        totalCount: number
      }
    }>(
      `query {
        saleItems(where: { _and: [{ ${SEEDED_STORES_WHERE} }, { saleId: { _eq: "sale-1" } }] }) {
          totalCount
          nodes { id saleId }
        }
      }`
    )

    expect(data.saleItems.totalCount).toBeGreaterThan(0)
    expect(data.saleItems.nodes.every((line) => line.saleId === 'sale-1')).toBe(true)
  })

  it('GivenSyncedItems_WhenFilteringByTipoProduto_ThenReturnsSubset', async () => {
    const data = await gqlClient<{
      saleItems: {
        nodes: Array<{ tipo: string | null }>
        totalCount: number
      }
    }>(
      `query {
        saleItems(where: { _and: [{ ${SEEDED_STORES_WHERE} }, { tipo: { _eq: "PRODUTO" } }] }) {
          totalCount
          nodes { id tipo }
        }
      }`
    )

    expect(data.saleItems.totalCount).toBeGreaterThan(0)
    expect(data.saleItems.nodes.every((line) => line.tipo === 'PRODUTO')).toBe(true)
  })
})
