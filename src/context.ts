import { Redis } from 'ioredis'
import type { YogaInitialContext } from 'graphql-yoga'
import { createContaAzulClient, type ContaAzulClient } from './lib/conta-azul-client.js'
import { extractStoreId } from './lib/extract-store-id.js'
import { TokenResolver } from './lib/token-resolver.js'

export interface AppContext {
  storeId: string | undefined
  contaAzulClient: ContaAzulClient | undefined
}

function createTokenResolver(): TokenResolver {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'
  const redis = new Redis(redisUrl)
  return new TokenResolver(
    redis,
    process.env.CONTA_AZUL_CLIENT_ID ?? '',
    process.env.CONTA_AZUL_CLIENT_SECRET ?? '',
    process.env.CONTA_AZUL_TOKEN_URL ?? 'https://auth.contaazul.com/oauth2/token'
  )
}

const tokenResolver = createTokenResolver()

export function getTokenResolver(): TokenResolver {
  return tokenResolver
}

export async function listConnectedStoreIds(): Promise<string[]> {
  return tokenResolver.listConnectedStoreIds()
}

export async function getContaAzulClientForStore(
  storeId: string
): Promise<ContaAzulClient | undefined> {
  try {
    const token = await tokenResolver.ensureFreshToken(storeId)
    return createContaAzulClient(token.access_token)
  } catch {
    return undefined
  }
}

export async function buildContext({ request }: YogaInitialContext): Promise<AppContext> {
  const storeId = extractStoreId(request)
  if (!storeId) {
    return { storeId: undefined, contaAzulClient: undefined }
  }

  const contaAzulClient = await getContaAzulClientForStore(storeId)
  return { storeId, contaAzulClient }
}
