import { Redis } from 'ioredis'
import { AuthConfig } from '../../lib/auth-config.js'
import { OAuthStateStore } from '../../lib/oauth-state.js'
import { TokenResolver } from '../../lib/token-resolver.js'

export const authConfig = new AuthConfig()

function createSharedRedis(): Redis {
  return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')
}

const sharedRedis = createSharedRedis()

export const oauthStateStore = new OAuthStateStore(sharedRedis)

export const authTokenResolver = new TokenResolver(
  sharedRedis,
  authConfig.getClientId(),
  authConfig.getClientSecret(),
  authConfig.getTokenUrl()
)

export async function disconnectAuthRedis(): Promise<void> {
  await sharedRedis.quit()
}
