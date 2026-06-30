import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createContaAzulClient,
  normalizeVendaItens,
  normalizeVendas,
  salesDateWindow,
  salesSyncDays,
} from '../../src/lib/conta-azul-client.js'
import { ContaAzulRateLimitError } from '../../src/lib/conta-azul-api/errors.js'

const mockGet = vi.fn()

vi.mock('openapi-fetch', () => ({
  default: vi.fn(() => ({
    GET: mockGet,
  })),
}))

describe('salesSyncDays', () => {
  it('GivenMissingEnv_WhenReading_ThenDefaultsTo90', () => {
    delete process.env.SALES_SYNC_DAYS
    expect(salesSyncDays()).toBe(90)
  })

  it('GivenInvalidEnv_WhenReading_ThenDefaultsTo90', () => {
    process.env.SALES_SYNC_DAYS = '0'
    expect(salesSyncDays()).toBe(90)
    delete process.env.SALES_SYNC_DAYS
  })

  it('GivenValidEnv_WhenReading_ThenReturnsParsedValue', () => {
    process.env.SALES_SYNC_DAYS = '30'
    expect(salesSyncDays()).toBe(30)
    delete process.env.SALES_SYNC_DAYS
  })
})

describe('salesDateWindow', () => {
  it('GivenDays_WhenBuildingWindow_ThenReturnsIsoDates', () => {
    const window = salesDateWindow(7)
    expect(window.data_inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(window.data_fim).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('normalizeVendas', () => {
  it('GivenPaginatedShape_WhenNormalizing_ThenFlattensNestedFields', () => {
    const result = normalizeVendas({
      itens: [
        {
          id: 'sale-1',
          numero: 10,
          data: '2026-01-01',
          data_alteracao: '2026-01-02T00:00:00Z',
          tipo: 'VENDA',
          situacao: { nome: 'APROVADA', descricao: 'Ok' },
          cliente: { id: 'c-1', nome: 'Cliente' },
          origem: 'API',
        },
      ],
    })

    expect(result).toEqual([
      {
        id: 'sale-1',
        numero: 10,
        data: '2026-01-01',
        dataAlteracao: '2026-01-02T00:00:00Z',
        tipo: 'VENDA',
        situacaoNome: 'APROVADA',
        situacaoDescricao: 'Ok',
        clienteNome: 'Cliente',
        clienteId: 'c-1',
        origem: 'API',
      },
    ])
  })
})

describe('normalizeVendaItens', () => {
  it('GivenPaginatedShape_WhenNormalizing_ThenMapsFieldsWithSaleId', () => {
    const result = normalizeVendaItens(
      {
        itens: [
          {
            id: 'line-1',
            id_item: 'prod-1',
            nome: 'Widget',
            descricao: 'Blue widget',
            tipo: 'PRODUTO',
            quantidade: 2,
            valor: 49.9,
            custo: 10,
          },
        ],
      },
      'sale-1'
    )

    expect(result).toEqual([
      {
        id: 'line-1',
        saleId: 'sale-1',
        produtoId: 'prod-1',
        nome: 'Widget',
        descricao: 'Blue widget',
        tipo: 'PRODUTO',
        quantidade: 2,
        valor: 49.9,
        custo: 10,
      },
    ])
  })

  it('GivenMissingId_WhenNormalizing_ThenSkipsRow', () => {
    const result = normalizeVendaItens(
      {
        itens: [{ nome: 'No id' }, { id: 'line-2', nome: 'Ok' }],
      },
      'sale-2'
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('line-2')
  })
})

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
      response: { status: 429, headers: { get: () => null } },
    })

    const client = createContaAzulClient('test-token')

    await expect(client.listCategorias()).rejects.toBeInstanceOf(ContaAzulRateLimitError)
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

  it('GivenValidAccessToken_WhenListVendas_ThenCallsBuscaWithDateWindow', async () => {
    process.env.SALES_SYNC_DAYS = '90'
    mockGet.mockResolvedValue({
      data: {
        itens: [
          {
            id: 'sale-1',
            numero: 1001,
            tipo: 'VENDA',
          },
        ],
      },
      error: undefined,
      response: { status: 200 },
    })

    const client = createContaAzulClient('test-token', 'https://api.example.com')
    const result = await client.listVendas()
    const window = salesDateWindow(90)

    expect(mockGet).toHaveBeenCalledWith('/v1/venda/busca', {
      params: {
        query: {
          data_inicio: window.data_inicio,
          data_fim: window.data_fim,
          pagina: 1,
          tamanho_pagina: 100,
        },
      },
    })
    expect(result[0]?.id).toBe('sale-1')
    delete process.env.SALES_SYNC_DAYS
  })

  it('GivenAPIReturns429_WhenListVendas_ThenThrowsRateLimitError', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { message: 'rate limited' },
      response: { status: 429, headers: { get: () => null } },
    })

    const client = createContaAzulClient('test-token')

    await expect(client.listVendas()).rejects.toBeInstanceOf(ContaAzulRateLimitError)
  })

  it('GivenAPIReturns401_WhenListVendas_ThenThrowsAuthError', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { message: 'unauthorized' },
      response: { status: 401 },
    })

    const client = createContaAzulClient('test-token')

    await expect(client.listVendas()).rejects.toThrow('Conta Azul token unauthorized')
  })

  it('GivenMultiplePages_WhenListVendas_ThenReturnsAllItemsMerged', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `sale-${i}`,
      tipo: 'VENDA',
    }))
    const page2 = [{ id: 'sale-last', tipo: 'VENDA' }]

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
    const result = await client.listVendas()

    expect(result).toHaveLength(101)
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('GivenEmptyItens_WhenListVendas_ThenReturnsEmptyArray', async () => {
    mockGet.mockResolvedValue({
      data: { itens: [] },
      error: undefined,
      response: { status: 200 },
    })

    const client = createContaAzulClient('test-token')
    const result = await client.listVendas()

    expect(result).toEqual([])
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('GivenValidAccessToken_WhenListVendaItens_ThenCallsCorrectPath', async () => {
    mockGet.mockResolvedValue({
      data: {
        itens: [
          {
            id: 'line-1',
            id_item: 'prod-1',
            nome: 'Widget',
            tipo: 'PRODUTO',
            quantidade: 1,
            valor: 10,
          },
        ],
      },
      error: undefined,
      response: { status: 200 },
    })

    const client = createContaAzulClient('test-token', 'https://api.example.com')
    const result = await client.listVendaItens('sale-1')

    expect(mockGet).toHaveBeenCalledWith('/v1/venda/{id_venda}/itens', {
      params: {
        path: { id_venda: 'sale-1' },
        query: { pagina: 1, tamanho_pagina: 100 },
      },
    })
    expect(result[0]?.id).toBe('line-1')
    expect(result[0]?.saleId).toBe('sale-1')
  })

  it('GivenAPIReturns429_WhenListVendaItens_ThenThrowsRateLimitError', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { message: 'rate limited' },
      response: { status: 429, headers: { get: () => null } },
    })

    const client = createContaAzulClient('test-token')

    await expect(client.listVendaItens('sale-1')).rejects.toBeInstanceOf(
      ContaAzulRateLimitError
    )
  })

  it('GivenMultiplePages_WhenListVendaItens_ThenReturnsAllItemsMerged', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `line-${i}`,
      nome: `Item ${i}`,
      tipo: 'PRODUTO',
    }))
    const page2 = [{ id: 'line-last', nome: 'Last', tipo: 'PRODUTO' }]

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
    const result = await client.listVendaItens('sale-1')

    expect(result).toHaveLength(101)
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('GivenValidAccessToken_WhenListVendedores_ThenCallsCorrectPath', async () => {
    mockGet.mockResolvedValue({
      data: {
        itens: [{ id: 'vend-1', nome: 'Joao', email: 'j@example.com', ativo: true }],
      },
      error: undefined,
      response: { status: 200 },
    })

    const client = createContaAzulClient('test-token', 'https://api.example.com')
    const result = await client.listVendedores()

    expect(mockGet).toHaveBeenCalledWith('/v1/venda/vendedores', {
      params: {
        query: { pagina: 1, tamanho_pagina: 100 },
      },
    })
    expect(result).toEqual([
      { id: 'vend-1', nome: 'Joao', email: 'j@example.com', ativo: true },
    ])
  })

  it('GivenAPIReturns429_WhenListVendedores_ThenThrowsRateLimitError', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { message: 'rate limited' },
      response: { status: 429, headers: { get: () => null } },
    })

    const client = createContaAzulClient('test-token')

    await expect(client.listVendedores()).rejects.toBeInstanceOf(ContaAzulRateLimitError)
  })
})
