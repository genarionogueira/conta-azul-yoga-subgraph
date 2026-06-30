export type PersistMode = 'UPSERT' | 'RECONCILE'

export interface PersistDocumentInput {
  id: string
  saleId?: string | null
  data: Record<string, unknown>
}

export interface PersistResult {
  storeId: string
  synced: number
  deleted: number
  errors: string[]
}
