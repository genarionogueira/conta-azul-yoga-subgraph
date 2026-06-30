import createClient from 'openapi-fetch'
import type { paths } from '../conta-azul/schema.js'
import type { RateLimiter } from './conta-azul-api/rate-limiter.js'
import {
  ContaAzulRateLimitError,
  parseRetryAfterMs,
} from './conta-azul-api/errors.js'

export interface ContaAzulCategory {
  id: string
  nome: string
  tipo: string
}

export interface ContaAzulSaleRecord {
  id: string
  numero?: number | null
  data?: string | null
  dataAlteracao?: string | null
  tipo?: string | null
  situacaoNome?: string | null
  situacaoDescricao?: string | null
  clienteNome?: string | null
  clienteId?: string | null
  origem?: string | null
}

export interface ContaAzulSaleLineRecord {
  id: string
  saleId: string
  produtoId: string | null
  nome: string | null
  descricao: string | null
  tipo: string | null
  quantidade: number | null
  valor: number | null
  custo: number | null
}

export interface ContaAzulVendedorRecord {
  id: string
  nome?: string | null
  email?: string | null
  ativo?: boolean | null
}

export interface ContaAzulClientContext {
  tenantId: string
  storeId: string
  limiter: RateLimiter
}

const CATEGORY_PAGE_SIZE = 100
const SALES_PAGE_SIZE = 100
const SALE_ITEMS_PAGE_SIZE = 100
const VENDEDORES_PAGE_SIZE = 100

export function salesSyncDays(): number {
  const raw = process.env.SALES_SYNC_DAYS?.trim()
  if (!raw) return 90
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 90
  return parsed
}

function formatDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function salesDateWindow(days = salesSyncDays()): {
  data_inicio: string
  data_fim: string
} {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - days)
  return {
    data_inicio: formatDateUtc(start),
    data_fim: formatDateUtc(end),
  }
}

async function assertResponseOk(
  status: number,
  response: Response,
  error: unknown,
  data: unknown
): Promise<void> {
  if (status === 401) {
    throw new Error('Conta Azul token unauthorized')
  }
  if (status === 429) {
    throw new ContaAzulRateLimitError(
      parseRetryAfterMs(response.headers.get('Retry-After'))
    )
  }
  if (error || data === undefined) {
    throw new Error(`Conta Azul API error: ${status}`)
  }
}

export function createContaAzulClient(
  accessToken: string,
  baseUrl?: string,
  context?: ContaAzulClientContext
) {
  const client = createClient<paths>({
    baseUrl: baseUrl ?? process.env.CONTA_AZUL_API_BASE_URL ?? 'https://api-v2.contaazul.com',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  async function beforeRequest(): Promise<void> {
    if (context) {
      await context.limiter.acquire(context.tenantId, context.storeId)
    }
  }

  return {
    async listCategorias(): Promise<ContaAzulCategory[]> {
      const all: ContaAzulCategory[] = []
      let page = 1

      while (true) {
        await beforeRequest()
        const { data, error, response } = await client.GET('/v1/categorias', {
          params: {
            query: {
              pagina: page,
              tamanho_pagina: CATEGORY_PAGE_SIZE,
            },
          },
        })
        await assertResponseOk(response.status, response, error, data)

        const items = normalizeCategorias(data)
        all.push(...items)
        if (items.length < CATEGORY_PAGE_SIZE) {
          break
        }
        page += 1
      }

      return all
    },

    async listVendas(options?: {
      dataInicio?: string
      dataFim?: string
    }): Promise<ContaAzulSaleRecord[]> {
      const window = salesDateWindow()
      const dataInicio = options?.dataInicio ?? window.data_inicio
      const dataFim = options?.dataFim ?? window.data_fim
      const all: ContaAzulSaleRecord[] = []
      let page = 1

      while (true) {
        await beforeRequest()
        const { data, error, response } = await client.GET('/v1/venda/busca', {
          params: {
            query: {
              data_inicio: dataInicio,
              data_fim: dataFim,
              pagina: page,
              tamanho_pagina: SALES_PAGE_SIZE,
            },
          },
        })
        await assertResponseOk(response.status, response, error, data)

        const items = normalizeVendas(data)
        all.push(...items)
        if (items.length < SALES_PAGE_SIZE) {
          break
        }
        page += 1
      }

      return all
    },

    async listVendaItens(saleId: string): Promise<ContaAzulSaleLineRecord[]> {
      const all: ContaAzulSaleLineRecord[] = []
      let page = 1

      while (true) {
        await beforeRequest()
        const { data, error, response } = await client.GET('/v1/venda/{id_venda}/itens', {
          params: {
            path: { id_venda: saleId },
            query: {
              pagina: page,
              tamanho_pagina: SALE_ITEMS_PAGE_SIZE,
            },
          },
        })
        await assertResponseOk(response.status, response, error, data)

        const items = normalizeVendaItens(data, saleId)
        all.push(...items)
        if (items.length < SALE_ITEMS_PAGE_SIZE) {
          break
        }
        page += 1
      }

      return all
    },

    async listVendedores(): Promise<ContaAzulVendedorRecord[]> {
      const raw = await this.fetchVendedoresRaw()
      return raw
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .filter((item) => item.id != null)
        .map((item) => ({
          id: String(item.id),
          nome: (item.nome as string | undefined) ?? null,
          email: (item.email as string | undefined) ?? null,
          ativo: (item.ativo as boolean | undefined) ?? null,
        }))
    },

    async fetchVendasRaw(options?: {
      dataInicio?: string
      dataFim?: string
    }): Promise<unknown[]> {
      const window = salesDateWindow()
      const dataInicio = options?.dataInicio ?? window.data_inicio
      const dataFim = options?.dataFim ?? window.data_fim
      const all: unknown[] = []
      let page = 1

      while (true) {
        await beforeRequest()
        const { data, error, response } = await client.GET('/v1/venda/busca', {
          params: {
            query: {
              data_inicio: dataInicio,
              data_fim: dataFim,
              pagina: page,
              tamanho_pagina: SALES_PAGE_SIZE,
            },
          },
        })
        await assertResponseOk(response.status, response, error, data)

        const items = extractPaginatedItems(data)
        all.push(...items)
        if (items.length < SALES_PAGE_SIZE) {
          break
        }
        page += 1
      }

      return all
    },

    async fetchVendaItensRaw(saleId: string): Promise<unknown[]> {
      const all: unknown[] = []
      let page = 1

      while (true) {
        await beforeRequest()
        const { data, error, response } = await client.GET('/v1/venda/{id_venda}/itens', {
          params: {
            path: { id_venda: saleId },
            query: {
              pagina: page,
              tamanho_pagina: SALE_ITEMS_PAGE_SIZE,
            },
          },
        })
        await assertResponseOk(response.status, response, error, data)

        const items = extractPaginatedItems(data)
        all.push(...items)
        if (items.length < SALE_ITEMS_PAGE_SIZE) {
          break
        }
        page += 1
      }

      return all
    },

    async fetchVendedoresRaw(): Promise<unknown[]> {
      const all: unknown[] = []
      let page = 1

      while (true) {
        await beforeRequest()
        const { data, error, response } = await client.GET('/v1/venda/vendedores', {
          params: {
            query: {
              pagina: page,
              tamanho_pagina: VENDEDORES_PAGE_SIZE,
            },
          },
        })
        await assertResponseOk(response.status, response, error, data)

        const items = extractPaginatedItems(data)
        all.push(...items)
        if (items.length < VENDEDORES_PAGE_SIZE) {
          break
        }
        page += 1
      }

      return all
    },
  }
}

export type ContaAzulClient = ReturnType<typeof createContaAzulClient>

interface CategoriasPaginatedResponse {
  itens?: ContaAzulCategory[]
}

function extractPaginatedItems(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data
  }
  const paginated = data as { itens?: unknown[] }
  if (paginated?.itens && Array.isArray(paginated.itens)) {
    return paginated.itens
  }
  throw new Error('Conta Azul API returned unexpected paginated shape')
}

function normalizeCategorias(data: unknown): ContaAzulCategory[] {
  if (Array.isArray(data)) {
    return data as ContaAzulCategory[]
  }
  const paginated = data as CategoriasPaginatedResponse
  if (paginated?.itens && Array.isArray(paginated.itens)) {
    return paginated.itens
  }
  throw new Error('Conta Azul API returned unexpected categorias shape')
}

interface VendaApiItem {
  id?: string
  numero?: number
  data?: string
  data_alteracao?: string
  tipo?: string
  situacao?: { nome?: string; descricao?: string }
  cliente?: { id?: string; nome?: string }
  origem?: string
}

interface VendasPaginatedResponse {
  itens?: VendaApiItem[]
}

export function normalizeVendas(data: unknown): ContaAzulSaleRecord[] {
  const paginated = data as VendasPaginatedResponse
  const rawItems = Array.isArray(data)
    ? (data as VendaApiItem[])
    : paginated?.itens

  if (!rawItems || !Array.isArray(rawItems)) {
    throw new Error('Conta Azul API returned unexpected vendas shape')
  }

  return rawItems
    .filter((item) => item.id != null)
    .map((item) => ({
      id: String(item.id),
      numero: item.numero ?? null,
      data: item.data ?? null,
      dataAlteracao: item.data_alteracao ?? null,
      tipo: item.tipo ?? null,
      situacaoNome: item.situacao?.nome ?? null,
      situacaoDescricao: item.situacao?.descricao ?? null,
      clienteNome: item.cliente?.nome ?? null,
      clienteId: item.cliente?.id ?? null,
      origem: item.origem ?? null,
    }))
}

interface VendaLinhaApiItem {
  id?: string
  id_item?: string
  nome?: string
  descricao?: string
  tipo?: string
  quantidade?: number
  valor?: number
  custo?: number
}

interface VendaItensPaginatedResponse {
  itens?: VendaLinhaApiItem[]
}

export function normalizeVendaItens(
  data: unknown,
  saleId: string
): ContaAzulSaleLineRecord[] {
  const paginated = data as VendaItensPaginatedResponse
  const rawItems = Array.isArray(data)
    ? (data as VendaLinhaApiItem[])
    : paginated?.itens

  if (!rawItems || !Array.isArray(rawItems)) {
    throw new Error('Conta Azul API returned unexpected venda itens shape')
  }

  return rawItems
    .filter((item) => item.id != null)
    .map((item) => ({
      id: String(item.id),
      saleId,
      produtoId: item.id_item ?? null,
      nome: item.nome ?? null,
      descricao: item.descricao ?? null,
      tipo: item.tipo ?? null,
      quantidade: item.quantidade ?? null,
      valor: item.valor ?? null,
      custo: item.custo ?? null,
    }))
}

export interface ConnectedAccountInfo {
  id?: string
  nome?: string
  documento: string
}

export function normalizeDocumento(documento: string): string {
  return documento.replace(/\D/g, '')
}

export function contaAzulApiBaseUrl(): string {
  return (
    process.env.CONTA_AZUL_API_BASE_URL?.trim() ||
    process.env.CONTA_AZUL_API_URL?.trim() ||
    'https://api.contaazul.com'
  )
}

export async function fetchConnectedAccount(
  accessToken: string
): Promise<{ contaAzulAccountId: string; name?: string }> {
  const baseUrl = contaAzulApiBaseUrl().replace(/\/$/, '')
  const res = await fetch(`${baseUrl}/v1/pessoas/conta-conectada`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`Conta Azul conta-conectada failed: ${res.status}`)
  }
  const data = (await res.json()) as ConnectedAccountInfo
  if (!data.documento?.trim()) {
    throw new Error('Conta Azul conta-conectada response missing documento')
  }
  return {
    contaAzulAccountId: normalizeDocumento(data.documento),
    name: data.nome,
  }
}
