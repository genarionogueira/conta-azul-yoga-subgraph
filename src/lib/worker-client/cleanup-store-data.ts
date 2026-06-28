export async function cleanupStoreData(tenantId: string, storeId: string): Promise<void> {
  const baseUrl = process.env.WORKER_URL ?? 'http://localhost:8010'
  const response = await fetch(`${baseUrl}/internal/disconnect-store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, storeId }),
  })

  if (!response.ok) {
    throw new Error(`Worker disconnect-store failed: ${response.status} ${response.statusText}`)
  }
}
