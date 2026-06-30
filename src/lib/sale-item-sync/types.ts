export interface SaleLineItem {
  id: string
  saleId: string
  produtoId?: string | null
  nome?: string | null
  descricao?: string | null
  tipo?: string | null
  quantidade?: number | null
  valor?: number | null
  custo?: number | null
}

export interface SyncSaleItemsResult {
  storeId: string
  saleId: string
  synced: number
  deleted: number
  errors: string[]
}

export interface SyncResult {
  storeId: string
  synced: number
  deleted: number
  errors: string[]
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
