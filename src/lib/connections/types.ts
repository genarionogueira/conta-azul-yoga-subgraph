export type ConnectionStatus = 'ACTIVE' | 'DISCONNECTED'

export interface ConnectionDocument {
  tenantId: string
  connectionId: string
  storeId: string
  /** @deprecated legacy field — same as storeId when present */
  id?: string
  contaAzulAccountId: string
  name: string
  status: ConnectionStatus
  connectedAt: Date
  disconnectedAt?: Date | null
  updatedAt: Date
}

export interface ConnectionListItem {
  connectionId: string
  storeId: string
  /** Alias of storeId for web-dash compat */
  id: string
  name: string
  status: ConnectionStatus
  connectedAt: string | null
  disconnectedAt: string | null
  isConnected: boolean
}

export function resolveStoreId(doc: Pick<ConnectionDocument, 'storeId' | 'id'>): string {
  return doc.storeId ?? doc.id ?? ''
}

export function normalizeConnectionDocument(
  doc: ConnectionDocument & { id?: string }
): ConnectionDocument {
  const storeId = doc.storeId ?? doc.id ?? ''
  return {
    ...doc,
    storeId,
    connectionId: doc.connectionId ?? storeId,
    contaAzulAccountId: doc.contaAzulAccountId ?? '',
    status: doc.status ?? 'ACTIVE',
    disconnectedAt: doc.disconnectedAt ?? null,
  }
}
