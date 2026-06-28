export interface ReconcileSyncResult {
  syncedCount: number
  syncedAt: string
  status: string
  errorMessage: string | null
}

export async function triggerReconcile(input: {
  tenantId: string
  storeId?: string
}): Promise<ReconcileSyncResult> {
  const baseUrl = process.env.WORKER_URL ?? 'http://localhost:8010'
  const response = await fetch(`${baseUrl}/internal/reconcile-once`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: input.tenantId,
      storeId: input.storeId,
    }),
  })

  if (!response.ok) {
    throw new Error(`Worker reconcile failed: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as ReconcileSyncResult
}
