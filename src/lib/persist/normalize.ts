import type { PersistDocumentInput } from './types.js'

export function normalizePersistDocument(
  input: PersistDocumentInput,
  tenantId: string,
  storeId: string,
  saleId?: string | null,
  connectionId?: string | null
): Record<string, unknown> {
  const data =
    typeof input.data === 'object' && input.data !== null && !Array.isArray(input.data)
      ? input.data
      : {}

  const doc: Record<string, unknown> = {
    ...data,
    id: String(input.id),
    tenantId,
    storeId,
    _syncedAt: new Date(),
  }

  if (connectionId) {
    doc.connectionId = connectionId
  }

  const resolvedSaleId = input.saleId ?? saleId
  if (resolvedSaleId != null && resolvedSaleId !== '') {
    doc.saleId = String(resolvedSaleId)
  }

  return doc
}

export function normalizePersistDocuments(
  inputs: PersistDocumentInput[],
  tenantId: string,
  storeId: string,
  saleId?: string | null,
  connectionId?: string | null
): Record<string, unknown>[] {
  return inputs.map((input) =>
    normalizePersistDocument(input, tenantId, storeId, saleId, connectionId)
  )
}
