import { authConfig } from '../../oauth-services.js'

export async function contaAzulAuthConfig() {
  return authConfig.snapshot()
}
