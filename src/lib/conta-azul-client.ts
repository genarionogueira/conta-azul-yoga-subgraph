import createClient from 'openapi-fetch'
import type { paths } from '../conta-azul/schema.js'

export interface ContaAzulCategory {
  id: string
  nome: string
  tipo: string
}

const PAGE_SIZE = 100

export function createContaAzulClient(accessToken: string, baseUrl?: string) {
  const client = createClient<paths>({
    baseUrl: baseUrl ?? process.env.CONTA_AZUL_API_BASE_URL ?? 'https://api-v2.contaazul.com',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  return {
    async listCategorias(): Promise<ContaAzulCategory[]> {
      const all: ContaAzulCategory[] = []
      let page = 1

      while (true) {
        const { data, error, response } = await client.GET('/v1/categorias', {
          params: {
            query: {
              pagina: page,
              tamanho_pagina: PAGE_SIZE,
            },
          },
        })
        const status = response.status
        if (status === 401) {
          throw new Error('Conta Azul token unauthorized')
        }
        if (status === 429) {
          throw new Error('Conta Azul rate limit exceeded')
        }
        if (error || data === undefined) {
          throw new Error(`Conta Azul API error: ${status}`)
        }

        const items = normalizeCategorias(data)
        all.push(...items)
        if (items.length < PAGE_SIZE) {
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
