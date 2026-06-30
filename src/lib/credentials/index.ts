import { createRedisClient } from '../redis/create-redis-client.js'
import { AuthConfig } from '../auth-config.js'
import { ConnectionRepository } from '../connections/connection-repository.js'
import { getDb } from '../mongo/connection.js'
import { OAuthStateStore } from '../oauth-state.js'
import { ConnectionService } from './connection-service.js'
import { TenantTokenStore } from './tenant-token-store.js'

export const authConfig = new AuthConfig()

function createSharedRedis() {
  return createRedisClient(process.env.REDIS_URL, 'command')
}

const sharedRedis = createSharedRedis()

export const oauthStateStore = new OAuthStateStore(sharedRedis)

export const tenantTokenStore = new TenantTokenStore(
  sharedRedis,
  authConfig.getClientId(),
  authConfig.getClientSecret(),
  authConfig.getTokenUrl()
)

export const connectionRepository = new ConnectionRepository(getDb)

export const connectionService = new ConnectionService({
  authConfig,
  oauthStateStore,
  tokenStore: tenantTokenStore,
  connectionRepository,
})

export async function disconnectCredentialsRedis(): Promise<void> {
  await sharedRedis.quit()
}

// Backward-compatible alias for diagnostics and tests
export const authTokenResolver = tenantTokenStore
