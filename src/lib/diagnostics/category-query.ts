import type { Db } from 'mongodb'
import type { BoolExp } from '../filter/types.js'
import { MongoRepository } from '../mongo/repository.js'
import type { TenantTokenStore } from '../credentials/tenant-token-store.js'
import { extractStoreIdsFromWhere } from './extract-store-ids.js'
import {
  CategoryQueryDiagnosticCode,
  type CategoryQueryDiagnostic,
} from './types.js'

function redisUnavailableDiagnostic(): CategoryQueryDiagnostic {
  return {
    code: CategoryQueryDiagnosticCode.REDIS_UNAVAILABLE,
    message: 'Cannot reach the OAuth token store (Redis).',
    hint: 'Verify REDIS_URL points to the yoga subgraph Redis instance.',
    storeId: null,
  }
}

function noConnectedStoresDiagnostic(): CategoryQueryDiagnostic {
  return {
    code: CategoryQueryDiagnosticCode.NO_CONNECTED_STORES,
    message: 'No Conta Azul stores are connected.',
    hint: 'Run setupConnection OAuth flow for a store; category sync runs automatically via avcd-worker.',
    storeId: null,
  }
}

function tokenMissingDiagnostic(storeId: string): CategoryQueryDiagnostic {
  return {
    code: CategoryQueryDiagnosticCode.TOKEN_MISSING,
    message: `Store "${storeId}" is registered but has no OAuth token.`,
    hint: `Re-authorize store "${storeId}" via setupConnection; category sync runs when connected.`,
    storeId,
  }
}

function storeNotConnectedDiagnostic(storeId: string): CategoryQueryDiagnostic {
  return {
    code: CategoryQueryDiagnosticCode.STORE_NOT_CONNECTED,
    message: `Store "${storeId}" is not connected to Conta Azul.`,
    hint: `Connect store "${storeId}" via authorizationUrl + setupConnection, then sync categories.`,
    storeId,
  }
}

function dataNotSyncedDiagnostic(storeId: string): CategoryQueryDiagnostic {
  return {
    code: CategoryQueryDiagnosticCode.DATA_NOT_SYNCED,
    message: `Store "${storeId}" has a token but no categories in the local cache.`,
    hint: `Trigger syncContaAzulCategories or wait for the worker scheduler, or query { contaAzulWorkerSyncEvents(storeId: "${storeId}") { events { type status } } }`,
    storeId,
  }
}

async function diagnoseSingleStore(
  tenantId: string,
  storeId: string,
  tokenStore: TenantTokenStore,
  repo: MongoRepository<{ storeId: string }>
): Promise<CategoryQueryDiagnostic | null> {
  const token = await tokenStore.getToken(tenantId, storeId)
  const registered = await tokenStore.isStoreRegistered(tenantId, storeId)

  if (!token) {
    if (registered) {
      return tokenMissingDiagnostic(storeId)
    }
    return storeNotConnectedDiagnostic(storeId)
  }

  const mongoCount = await repo.count({ storeId: { _eq: storeId } })
  if (mongoCount === 0) {
    return dataNotSyncedDiagnostic(storeId)
  }

  return null
}

export async function diagnoseCategoryQuery(args: {
  tenantId: string
  where?: BoolExp | null
  tokenStore: TenantTokenStore
  db: Db
}): Promise<CategoryQueryDiagnostic[]> {
  const { tenantId, where, tokenStore, db } = args

  try {
    await tokenStore.ping()
  } catch {
    return [redisUnavailableDiagnostic()]
  }

  const repo = new MongoRepository<{ storeId: string }>(
    db.collection('conta_azul_categories')
  )
  const storeIds = extractStoreIdsFromWhere(where)

  if (storeIds.length === 0) {
    const candidates = await tokenStore.listRegisteredStoreIds(tenantId)

    if (candidates.length === 0) {
      return [noConnectedStoresDiagnostic()]
    }

    const diagnostics: CategoryQueryDiagnostic[] = []
    for (const storeId of candidates) {
      const diagnostic = await diagnoseSingleStore(tenantId, storeId, tokenStore, repo)
      if (diagnostic) diagnostics.push(diagnostic)
    }
    return diagnostics
  }

  const diagnostics: CategoryQueryDiagnostic[] = []
  for (const storeId of storeIds) {
    const diagnostic = await diagnoseSingleStore(tenantId, storeId, tokenStore, repo)
    if (diagnostic) diagnostics.push(diagnostic)
  }
  return diagnostics
}
