import { describe, expect, it, vi } from 'vitest'
import { fetchAllStoreCategories } from '../../src/lib/categories-aggregator.js'
import type { ContaAzulClient } from '../../src/lib/conta-azul-client.js'

describe('fetchAllStoreCategories', () => {
  it('GivenTwoStores_WhenFetchAll_ThenReturnsFlatListWithStoreIdOnEachRow', async () => {
    const listCategoriasA = vi.fn().mockResolvedValue([
      { id: 'cat-1', nome: 'Receitas', tipo: 'RECEITA' },
    ])
    const listCategoriasB = vi.fn().mockResolvedValue([
      { id: 'cat-2', nome: 'Despesas', tipo: 'DESPESA' },
    ])

    const result = await fetchAllStoreCategories({
      listConnectedStoreIds: vi.fn().mockResolvedValue(['store-a', 'store-b']),
      getClientForStore: vi.fn(async (storeId: string) => {
        if (storeId === 'store-a') {
          return { listCategorias: listCategoriasA } as ContaAzulClient
        }
        return { listCategorias: listCategoriasB } as ContaAzulClient
      }),
    })

    expect(result).toEqual([
      { id: 'cat-1', nome: 'Receitas', tipo: 'RECEITA', storeId: 'store-a' },
      { id: 'cat-2', nome: 'Despesas', tipo: 'DESPESA', storeId: 'store-b' },
    ])
  })

  it('GivenOneStoreFails_WhenFetchAll_ThenReturnsSuccessfulStoreRowsOnly', async () => {
    const listCategorias = vi.fn().mockResolvedValue([
      { id: 'cat-1', nome: 'Receitas', tipo: 'RECEITA' },
    ])

    const result = await fetchAllStoreCategories({
      listConnectedStoreIds: vi.fn().mockResolvedValue(['store-ok', 'store-fail']),
      getClientForStore: vi.fn(async (storeId: string) => {
        if (storeId === 'store-ok') {
          return { listCategorias } as ContaAzulClient
        }
        return {
          listCategorias: vi.fn().mockRejectedValue(new Error('Conta Azul API error: 500')),
        } as ContaAzulClient
      }),
    })

    expect(result).toEqual([
      { id: 'cat-1', nome: 'Receitas', tipo: 'RECEITA', storeId: 'store-ok' },
    ])
  })

  it('GivenNoConnectedStores_WhenFetchAll_ThenReturnsEmptyArray', async () => {
    const result = await fetchAllStoreCategories({
      listConnectedStoreIds: vi.fn().mockResolvedValue([]),
      getClientForStore: vi.fn(),
    })

    expect(result).toEqual([])
  })

  it('GivenStoreWithNoClient_WhenFetchAll_ThenSkipsStore', async () => {
    const listCategorias = vi.fn().mockResolvedValue([
      { id: 'cat-1', nome: 'Receitas', tipo: 'RECEITA' },
    ])

    const result = await fetchAllStoreCategories({
      listConnectedStoreIds: vi.fn().mockResolvedValue(['store-ok', 'store-missing']),
      getClientForStore: vi.fn(async (storeId: string) => {
        if (storeId === 'store-ok') {
          return { listCategorias } as ContaAzulClient
        }
        return undefined
      }),
    })

    expect(result).toEqual([
      { id: 'cat-1', nome: 'Receitas', tipo: 'RECEITA', storeId: 'store-ok' },
    ])
  })

  it('GivenAllStoresFail_WhenFetchAll_ThenThrows', async () => {
    await expect(
      fetchAllStoreCategories({
        listConnectedStoreIds: vi.fn().mockResolvedValue(['store-a']),
        getClientForStore: vi.fn().mockResolvedValue(undefined),
      })
    ).rejects.toThrow('Failed to fetch categories from all connected stores')
  })
})
