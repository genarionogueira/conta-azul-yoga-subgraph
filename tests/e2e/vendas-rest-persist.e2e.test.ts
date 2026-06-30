import { describe, it, expect } from 'vitest'
import { gqlClient, gqlRaw } from './helpers/gql-client.js'
import {
  mapCaSaleItemToPersistDocument,
  mapCaSaleToPersistDocument,
  mapCaVendedorToPersistDocument,
  workerAuthHeaders,
} from './helpers/vendas-rest-persist.js'
import { DEFAULT_DEV_TENANT_ID } from '../../src/lib/auth/tenant-context.js'

const STORE_ID = 'store-1'
const TENANT_ID = DEFAULT_DEV_TENANT_ID

describe('E2E: Vendas fetch+persist - worker sync then domain read', () => {
  it('GivenWorkerFetchAndPersist_WhenQueryingSales_ThenReturnsMongoRows', async () => {
    const fetch = await gqlClient<{
      contaAzulRestVendaBusca: { storeId: string; items: Record<string, unknown>[] }
    }>(
      `query($tenantId: ID!, $storeId: ID!) {
        contaAzulRestVendaBusca(tenantId: $tenantId, storeId: $storeId) {
          storeId
          items
        }
      }`,
      { tenantId: TENANT_ID, storeId: STORE_ID },
      workerAuthHeaders()
    )

    expect(fetch.contaAzulRestVendaBusca.items.length).toBeGreaterThan(0)

    const documents = fetch.contaAzulRestVendaBusca.items.map((item) =>
      mapCaSaleToPersistDocument(item)
    )

    await gqlClient(
      `mutation($tenantId: ID!, $storeId: ID!, $documents: [PersistDocumentInput!]!) {
        persistSales(tenantId: $tenantId, storeId: $storeId, documents: $documents, mode: RECONCILE) {
          synced
          deleted
        }
      }`,
      { tenantId: TENANT_ID, storeId: STORE_ID, documents },
      workerAuthHeaders()
    )

    const firstSaleId = String(fetch.contaAzulRestVendaBusca.items[0]?.id)
    const itemsFetch = await gqlClient<{
      contaAzulRestVendaItens: { items: Record<string, unknown>[] }
    }>(
      `query($tenantId: ID!, $storeId: ID!, $saleId: ID!) {
        contaAzulRestVendaItens(tenantId: $tenantId, storeId: $storeId, saleId: $saleId) {
          items
        }
      }`,
      { tenantId: TENANT_ID, storeId: STORE_ID, saleId: firstSaleId },
      workerAuthHeaders()
    )

    const itemDocuments = itemsFetch.contaAzulRestVendaItens.items.map((item) =>
      mapCaSaleItemToPersistDocument(item, firstSaleId)
    )

    await gqlClient(
      `mutation($tenantId: ID!, $storeId: ID!, $saleId: ID!, $documents: [PersistDocumentInput!]!) {
        persistSaleItems(
          tenantId: $tenantId
          storeId: $storeId
          saleId: $saleId
          documents: $documents
          mode: RECONCILE
        ) {
          synced
        }
      }`,
      {
        tenantId: TENANT_ID,
        storeId: STORE_ID,
        saleId: firstSaleId,
        documents: itemDocuments,
      },
      workerAuthHeaders()
    )

    const sales = await gqlClient<{
      sales: { totalCount: number; nodes: Array<{ id: string; saleId?: string }> }
    }>(
      `query {
        sales(where: { storeId: { _eq: "${STORE_ID}" } }) {
          totalCount
          nodes { id tipo storeId }
        }
      }`
    )
    expect(sales.sales.totalCount).toBeGreaterThan(0)

    const saleItems = await gqlClient<{
      saleItems: { totalCount: number; nodes: Array<{ id: string; saleId: string }> }
    }>(
      `query($saleId: ID!) {
        saleItems(where: { _and: [{ storeId: { _eq: "${STORE_ID}" } }, { saleId: { _eq: $saleId } }] }) {
          totalCount
          nodes { id saleId storeId }
        }
      }`,
      { saleId: firstSaleId }
    )
    expect(saleItems.saleItems.totalCount).toBeGreaterThan(0)
    expect(saleItems.saleItems.nodes.every((row) => row.saleId === firstSaleId)).toBe(true)
  })

  it('GivenNonWorkerJwt_WhenCallingContaAzulRest_ThenForbidden', async () => {
    const result = await gqlRaw(
      `query($tenantId: ID!, $storeId: ID!) {
        contaAzulRestVendaBusca(tenantId: $tenantId, storeId: $storeId) { storeId items }
      }`,
      { tenantId: TENANT_ID, storeId: STORE_ID },
      { Authorization: 'Bearer invalid-token' }
    )
    expect(result.errors?.[0]?.message).toMatch(/worker authentication required/i)
  })

  it('GivenWorkerFetch_WhenPersistVendedores_ThenVendedoresQueryable', async () => {
    const fetch = await gqlClient<{
      contaAzulRestVendaVendedores: { items: Record<string, unknown>[] }
    }>(
      `query($tenantId: ID!, $storeId: ID!) {
        contaAzulRestVendaVendedores(tenantId: $tenantId, storeId: $storeId) { items }
      }`,
      { tenantId: TENANT_ID, storeId: STORE_ID },
      workerAuthHeaders()
    )

    const documents = fetch.contaAzulRestVendaVendedores.items.map((item) =>
      mapCaVendedorToPersistDocument(item)
    )

    await gqlClient(
      `mutation($tenantId: ID!, $storeId: ID!, $documents: [PersistDocumentInput!]!) {
        persistVendedores(tenantId: $tenantId, storeId: $storeId, documents: $documents, mode: RECONCILE) {
          synced
        }
      }`,
      { tenantId: TENANT_ID, storeId: STORE_ID, documents },
      workerAuthHeaders()
    )

    const vendedores = await gqlClient<{
      vendedores: { totalCount: number; nodes: Array<{ id: string; nome: string }> }
    }>(
      `query {
        vendedores(where: { storeId: { _eq: "${STORE_ID}" } }) {
          totalCount
          nodes { id nome storeId }
        }
      }`
    )
    expect(vendedores.vendedores.totalCount).toBeGreaterThan(0)
  })
})
