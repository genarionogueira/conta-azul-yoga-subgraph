import type { Redis } from 'ioredis'

const CONNECTED_STORES_PREFIX = 'conta_azul:connected_stores:'
const LEGACY_CONNECTED_STORES_KEY = 'conta_azul:connected_stores'

export async function listTenantIds(
  redis: Redis,
  mode: string,
  defaultTenantId: string
): Promise<string[]> {
  if (mode.trim().toLowerCase() === 'default_only') {
    return [defaultTenantId]
  }

  const prefix = CONNECTED_STORES_PREFIX
  const tenantIds = new Set<string>()

  let cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      `${prefix}*`,
      'COUNT',
      100
    )
    cursor = nextCursor
    for (const key of keys) {
      if (key.startsWith(prefix)) {
        const tenantId = key.slice(prefix.length)
        if (tenantId) tenantIds.add(tenantId)
      }
    }
  } while (cursor !== '0')

  if (defaultTenantId.trim()) {
    tenantIds.add(defaultTenantId.trim())
  }

  return [...tenantIds].sort()
}

export async function listConnectedStoreIdsForTenant(
  redis: Redis,
  tenantId: string,
  defaultTenantId: string
): Promise<string[]> {
  const storeIds = new Set<string>()
  const tenantKey = `${CONNECTED_STORES_PREFIX}${tenantId}`
  const ids = await redis.zrange(tenantKey, 0, -1)
  for (const storeId of ids) {
    storeIds.add(storeId)
  }

  if (tenantId === defaultTenantId) {
    const legacyIds = await redis.zrange(LEGACY_CONNECTED_STORES_KEY, 0, -1)
    for (const storeId of legacyIds) {
      storeIds.add(storeId)
    }
  }

  return [...storeIds].sort()
}
