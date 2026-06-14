import type { Db } from 'mongodb'

export interface SyncConfig {
  collectionName: string
  storeId: string
  fetcher: () => Promise<Record<string, unknown>[]>
  idField?: string
}

export interface SyncResult {
  syncedCount: number
  syncedAt: string
  status: 'success' | 'error' | 'partial'
  errorMessage?: string
}

export type { Db }
