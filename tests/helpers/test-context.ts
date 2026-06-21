import type { AppContext } from '../../src/context.js'
import { DEFAULT_DEV_TENANT_ID } from '../../src/lib/auth/tenant-context.js'

export const TEST_TENANT_ID = DEFAULT_DEV_TENANT_ID

export function createTestContext(overrides: Partial<AppContext> = {}): AppContext {
  return {
    tenantId: TEST_TENANT_ID,
    storeId: undefined,
    contaAzulClient: undefined,
    ...overrides,
  }
}
