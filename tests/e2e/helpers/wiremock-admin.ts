function getWiremockAdminUrl(): string {
  const url = process.env.E2E_WIREMOCK_ADMIN_URL
  if (!url) {
    throw new Error('E2E_WIREMOCK_ADMIN_URL not set — globalSetup may not have run')
  }
  return url
}

export async function resetWireMockRequests(): Promise<void> {
  const base = getWiremockAdminUrl()
  const res = await fetch(`${base}/__admin/requests`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(`WireMock reset failed: ${res.status}`)
  }
}

export async function getRequestCount(urlPath: string): Promise<number> {
  const base = getWiremockAdminUrl()
  const res = await fetch(`${base}/__admin/requests`)
  if (!res.ok) {
    throw new Error(`WireMock requests fetch failed: ${res.status}`)
  }
  const body = (await res.json()) as {
    requests?: Array<{ request?: { url?: string } }>
  }
  return (body.requests ?? []).filter((entry) =>
    entry.request?.url?.includes(urlPath)
  ).length
}

export async function setWireMockStub(
  urlPath: string,
  status: number,
  jsonBody?: unknown
): Promise<void> {
  const base = getWiremockAdminUrl()
  const res = await fetch(`${base}/__admin/mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      priority: 1,
      request: { method: 'GET', urlPath },
      response: {
        status,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: jsonBody ?? [],
      },
    }),
  })
  if (!res.ok) {
    throw new Error(`WireMock stub create failed: ${res.status}`)
  }
}

export async function removePriorityStubs(): Promise<void> {
  const base = getWiremockAdminUrl()
  const listRes = await fetch(`${base}/__admin/mappings`)
  if (!listRes.ok) return
  const body = (await listRes.json()) as {
    mappings?: Array<{ id?: string; priority?: number }>
  }
  for (const mapping of body.mappings ?? []) {
    if (mapping.priority === 1 && mapping.id) {
      await fetch(`${base}/__admin/mappings/${mapping.id}`, { method: 'DELETE' })
    }
  }
}
