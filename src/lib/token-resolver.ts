export {
  TenantTokenStore,
  TokenNotFoundError,
  TokenRefreshError,
  type ContaAzulToken,
  type ConnectedStoreRecord,
} from './credentials/tenant-token-store.js'

// Legacy export name used by diagnostics and tests
export { TenantTokenStore as TokenResolver } from './credentials/tenant-token-store.js'
