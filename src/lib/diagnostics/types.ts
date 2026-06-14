export const CategoryQueryDiagnosticCode = {
  STORE_NOT_CONNECTED: 'STORE_NOT_CONNECTED',
  TOKEN_MISSING: 'TOKEN_MISSING',
  DATA_NOT_SYNCED: 'DATA_NOT_SYNCED',
  NO_CONNECTED_STORES: 'NO_CONNECTED_STORES',
  REDIS_UNAVAILABLE: 'REDIS_UNAVAILABLE',
} as const

export type CategoryQueryDiagnosticCode =
  (typeof CategoryQueryDiagnosticCode)[keyof typeof CategoryQueryDiagnosticCode]

export interface CategoryQueryDiagnostic {
  code: CategoryQueryDiagnosticCode
  message: string
  hint: string
  storeId?: string | null
}
