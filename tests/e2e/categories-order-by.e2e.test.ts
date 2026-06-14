import { describe, it, expect } from 'vitest'
import { gqlClient } from './helpers/gql-client.js'

const SEEDED_STORES_WHERE = `storeId: { _in: ["store-1", "store-2"] }`

describe('E2E: ContaAzulCategories — order_by + distinct_on', () => {
  it('GivenOrderByNomeAsc_WhenQuerying_ThenReturnsSortedByNomeAscending', async () => {
    const data = await gqlClient<{
      contaAzulCategories: { nodes: Array<{ id: string; nome: string }> }
    }>(
      `query {
        contaAzulCategories(
          where: { ${SEEDED_STORES_WHERE} }
          order_by: [{ nome: asc }]
        ) {
          nodes { id nome }
        }
      }`
    )
    const names = data.contaAzulCategories.nodes.map((node) => node.nome)
    expect(names).toEqual([...names].sort())
  })

  it('GivenOrderByMultipleFields_WhenQuerying_ThenRespectsPriority', async () => {
    const data = await gqlClient<{
      contaAzulCategories: { nodes: Array<{ tipo: string; nome: string }> }
    }>(
      `query {
        contaAzulCategories(
          where: { ${SEEDED_STORES_WHERE} }
          order_by: [{ tipo: asc }, { nome: asc }]
        ) {
          nodes { tipo nome }
        }
      }`
    )
    const nodes = data.contaAzulCategories.nodes
    expect(nodes.length).toBeGreaterThan(0)
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1]
      const curr = nodes[i]
      const tipoCompare = prev.tipo.localeCompare(curr.tipo)
      if (tipoCompare > 0) {
        expect.fail(`Expected tipo asc order at index ${i}`)
      }
      if (tipoCompare === 0) {
        expect(prev.nome.localeCompare(curr.nome)).toBeLessThanOrEqual(0)
      }
    }
  })

  it('GivenDistinctOnTipo_WhenQuerying_ThenEachTipoAppearsOnce', async () => {
    const data = await gqlClient<{
      contaAzulCategories: { nodes: Array<{ tipo: string }> }
    }>(
      `query {
        contaAzulCategories(
          where: { ${SEEDED_STORES_WHERE} }
          distinct_on: [tipo]
        ) {
          nodes { tipo }
        }
      }`
    )
    const tipos = data.contaAzulCategories.nodes.map((node) => node.tipo)
    expect(new Set(tipos).size).toBe(tipos.length)
    expect(tipos.length).toBe(2)
  })
})
