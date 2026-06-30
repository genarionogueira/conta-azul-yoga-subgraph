export interface SaleItem {
  id: string
  numero?: number | null
  data?: string | null
  dataAlteracao?: string | null
  tipo?: string | null
  situacaoNome?: string | null
  situacaoDescricao?: string | null
  clienteNome?: string | null
  clienteId?: string | null
  origem?: string | null
}

export interface SyncResult {
  storeId: string
  synced: number
  deleted: number
  errors: string[]
}

export interface DisconnectStoreDataResult {
  storeId: string
  deleted: number
}

export interface StorePollResult {
  tenantId: string
  storeId: string
  status: 'success' | 'skipped' | 'error'
  syncedCount: number
  skippedCount: number
  errorMessage?: string | null
}

export interface ReconcileAllResult {
  status: 'success' | 'partial' | 'error'
  syncedCount: number
  storesProcessed: number
  successCount: number
  errorCount: number
  storeResults: StorePollResult[]
}
