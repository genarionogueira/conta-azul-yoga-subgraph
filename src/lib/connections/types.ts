export interface ConnectionDocument {
  tenantId: string
  id: string
  name: string
  connectedAt: Date
  updatedAt: Date
}

export interface ConnectionListItem {
  id: string
  name: string
  connectedAt: string | null
  isConnected: boolean
}
