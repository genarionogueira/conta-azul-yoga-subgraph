import type { Redis } from 'ioredis'
import { createLimitedContaAzulClient } from '../conta-azul-api/client-factory.js'
import { ContaAzulRateLimitError } from '../conta-azul-api/errors.js'
import { salesDateWindow } from '../conta-azul-client.js'
import { TenantTokenStore } from '../credentials/tenant-token-store.js'

export interface RestFetchResult {
  storeId: string
  fetchedAt: string
  items: unknown[]
}

export class RestFetchService {
  constructor(
    private readonly tokenStore: TenantTokenStore,
    private readonly redis: Redis
  ) {}

  private async createClient(tenantId: string, storeId: string) {
    const token = await this.tokenStore.ensureFreshToken(tenantId, storeId)
    return createLimitedContaAzulClient(
      this.redis,
      token.access_token,
      tenantId,
      storeId
    )
  }

  async fetchVendaBusca(
    tenantId: string,
    storeId: string,
    dataInicio?: string | null,
    dataFim?: string | null
  ): Promise<RestFetchResult> {
    try {
      const client = await this.createClient(tenantId, storeId)
      const window = salesDateWindow()
      const items = await client.fetchVendasRaw({
        dataInicio: dataInicio ?? window.data_inicio,
        dataFim: dataFim ?? window.data_fim,
      })
      return {
        storeId,
        fetchedAt: new Date().toISOString(),
        items,
      }
    } catch (err) {
      if (err instanceof ContaAzulRateLimitError) {
        throw err
      }
      throw err
    }
  }

  async fetchVendaItens(
    tenantId: string,
    storeId: string,
    saleId: string
  ): Promise<RestFetchResult> {
    const client = await this.createClient(tenantId, storeId)
    const items = await client.fetchVendaItensRaw(saleId)
    return {
      storeId,
      fetchedAt: new Date().toISOString(),
      items,
    }
  }

  async fetchVendaVendedores(
    tenantId: string,
    storeId: string
  ): Promise<RestFetchResult> {
    const client = await this.createClient(tenantId, storeId)
    const items = await client.fetchVendedoresRaw()
    return {
      storeId,
      fetchedAt: new Date().toISOString(),
      items,
    }
  }
}
