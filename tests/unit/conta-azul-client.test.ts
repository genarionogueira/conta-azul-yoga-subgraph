import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createContaAzulClient } from '../../src/lib/conta-azul-client.js'

const mockGet = vi.fn()

vi.mock('openapi-fetch', () => ({
  default: vi.fn(() => ({
    GET: mockGet,
  })),
}))

describe('createContaAzulClient', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('GivenValidAccessToken_WhenListCategorias_ThenCallsCorrectURL', async () => {
    mockGet.mockResolvedValue({
      data: [{ id: '1', nome: 'Receitas', tipo: 'RECEITA' }],
      error: undefined,
      response: { status: 200 },
    })

    const client = createContaAzulClient('test-token', 'https://api.example.com')
    await client.listCategorias()

    expect(mockGet).toHaveBeenCalledWith('/v1/categorias', {
      params: { query: { pagina: 1, tamanho_pagina: 100 } },
    })
  })

  it('GivenAPIReturns429_WhenListCategorias_ThenThrowsRateLimitError', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { message: 'rate limited' },
      response: { status: 429 },
    })

    const client = createContaAzulClient('test-token')

    await expect(client.listCategorias()).rejects.toThrow('Conta Azul rate limit exceeded')
  })

  it('GivenAPIReturns401_WhenListCategorias_ThenThrowsAuthError', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { message: 'unauthorized' },
      response: { status: 401 },
    })

    const client = createContaAzulClient('test-token')

    await expect(client.listCategorias()).rejects.toThrow('Conta Azul token unauthorized')
  })

  it('GivenAPIReturns200_WhenListCategorias_ThenReturnsMappedArray', async () => {
    const categories = [
      { id: 'cat-1', nome: 'Receitas', tipo: 'RECEITA' },
      { id: 'cat-2', nome: 'Despesas', tipo: 'DESPESA' },
    ]
    mockGet.mockResolvedValue({
      data: categories,
      error: undefined,
      response: { status: 200 },
    })

    const client = createContaAzulClient('test-token')
    const result = await client.listCategorias()

    expect(result).toEqual(categories)
  })

  it('GivenAPIReturnsPaginatedShape_WhenListCategorias_ThenReturnsItensArray', async () => {
    const categories = [{ id: 'cat-1', nome: 'Receitas', tipo: 'RECEITA' }]
    mockGet.mockResolvedValue({
      data: { itens_totais: 1, itens: categories },
      error: undefined,
      response: { status: 200 },
    })

    const client = createContaAzulClient('test-token')
    const result = await client.listCategorias()

    expect(result).toEqual(categories)
  })

  it('GivenMultiplePages_WhenListCategorias_ThenReturnsAllItemsMerged', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `cat-${i}`,
      nome: `Cat ${i}`,
      tipo: 'RECEITA',
    }))
    const page2 = [{ id: 'cat-last', nome: 'Last', tipo: 'DESPESA' }]

    mockGet
      .mockResolvedValueOnce({
        data: { itens: page1 },
        error: undefined,
        response: { status: 200 },
      })
      .mockResolvedValueOnce({
        data: { itens: page2 },
        error: undefined,
        response: { status: 200 },
      })

    const client = createContaAzulClient('test-token')
    const result = await client.listCategorias()

    expect(result).toHaveLength(101)
    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(mockGet).toHaveBeenNthCalledWith(1, '/v1/categorias', {
      params: { query: { pagina: 1, tamanho_pagina: 100 } },
    })
    expect(mockGet).toHaveBeenNthCalledWith(2, '/v1/categorias', {
      params: { query: { pagina: 2, tamanho_pagina: 100 } },
    })
  })

  it('GivenSinglePageLessThanPageSize_WhenListCategorias_ThenStopsAfterOneRequest', async () => {
    mockGet.mockResolvedValue({
      data: [{ id: 'cat-1', nome: 'Receitas', tipo: 'RECEITA' }],
      error: undefined,
      response: { status: 200 },
    })

    const client = createContaAzulClient('test-token')
    await client.listCategorias()

    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('GivenEmptyItens_WhenListCategorias_ThenReturnsEmptyArray', async () => {
    mockGet.mockResolvedValue({
      data: { itens: [] },
      error: undefined,
      response: { status: 200 },
    })

    const client = createContaAzulClient('test-token')
    const result = await client.listCategorias()

    expect(result).toEqual([])
    expect(mockGet).toHaveBeenCalledTimes(1)
  })
})
