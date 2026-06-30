import { describe, it, expect } from 'vitest'
import { gqlClient } from './helpers/gql-client.js'

const SEEDED_STORES_WHERE = `storeId: { _in: ["store-1", "store-2"] }`

describe('E2E: sales - worker sync then Mongo query', () => {
  it('GivenWorkerReconcile_WhenQueryingSales_ThenReturnsSyncedRows', async () => {
    const data = await gqlClient<{
      sales: { nodes: Array<{ id: string; numero: number; tipo: string }>; totalCount: number }
    }>(
      `query { sales(where: { ${SEEDED_STORES_WHERE} }) { totalCount nodes { id numero tipo storeId } } }`
    )
    expect(data.sales.totalCount).toBeGreaterThan(0)
    expect(data.sales.nodes.length).toBeGreaterThan(0)
    expect(data.sales.nodes[0]).toHaveProperty('id')
    expect(data.sales.nodes[0]).toHaveProperty('numero')
    expect(data.sales.nodes[0]).toHaveProperty('tipo')
  })

  it('GivenSyncedSales_WhenFilteringByTipo_ThenReturnsSubset', async () => {
    const data = await gqlClient<{
      sales: { nodes: Array<{ tipo: string }>; totalCount: number }
    }>(
      `query { sales(where: { _and: [{ ${SEEDED_STORES_WHERE} }, { tipo: { _eq: "VENDA" } }] }) { totalCount nodes { id tipo } } }`
    )
    expect(data.sales.totalCount).toBeGreaterThan(0)
    expect(data.sales.nodes.every((sale) => sale.tipo === 'VENDA')).toBe(true)
  })

  it('GivenSyncedSales_WhenAggregate_ThenCountMatchesFilter', async () => {
    const data = await gqlClient<{
      salesAggregate: { aggregate: { count: number } }
    }>(
      `query { salesAggregate(where: { storeId: { _in: ["store-1", "store-2"] } }) { aggregate { count } } }`
    )
    expect(data.salesAggregate.aggregate.count).toBeGreaterThanOrEqual(1)
  })
})
