import { GraphQLError } from 'graphql'
import type { AppContext } from '../../../../context.js'
import { requireWorkerAuth } from '../../../../lib/auth/worker-auth.js'
import { ContaAzulRateLimitError } from '../../../../lib/conta-azul-api/errors.js'
import { restFetchService } from '../../../../lib/rest-fetch/index.js'

function mapRateLimitError(err: unknown): never {
  if (err instanceof ContaAzulRateLimitError) {
    throw new GraphQLError('RATE_LIMITED', {
      extensions: {
        code: 'RATE_LIMITED',
        retryAfterMs: err.retryAfterMs,
      },
    })
  }
  throw err
}

export async function contaAzulRestVendaBusca(
  _parent: unknown,
  args: {
    tenantId: string
    storeId: string
    dataInicio?: string | null
    dataFim?: string | null
  },
  context: AppContext
) {
  requireWorkerAuth(context)
  try {
    return await restFetchService.fetchVendaBusca(
      args.tenantId,
      args.storeId,
      args.dataInicio,
      args.dataFim
    )
  } catch (err) {
    mapRateLimitError(err)
  }
}

export async function contaAzulRestVendaItens(
  _parent: unknown,
  args: { tenantId: string; storeId: string; saleId: string },
  context: AppContext
) {
  requireWorkerAuth(context)
  try {
    return await restFetchService.fetchVendaItens(
      args.tenantId,
      args.storeId,
      args.saleId
    )
  } catch (err) {
    mapRateLimitError(err)
  }
}

export async function contaAzulRestVendaVendedores(
  _parent: unknown,
  args: { tenantId: string; storeId: string },
  context: AppContext
) {
  requireWorkerAuth(context)
  try {
    return await restFetchService.fetchVendaVendedores(args.tenantId, args.storeId)
  } catch (err) {
    mapRateLimitError(err)
  }
}
