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

export async function registerParallelBackfillSalesStub(saleCount = 50): Promise<void> {
  const base = getWiremockAdminUrl()
  const sales = Array.from({ length: saleCount }, (_, index) => {
    const n = index + 1
    return {
      id: `sale-pb-${n}`,
      numero: 2000 + n,
      data: '2026-01-15',
      data_alteracao: '2026-01-15T10:00:00Z',
      tipo: 'VENDA',
      situacao: { nome: 'APROVADA', descricao: 'Aprovada' },
      cliente: { nome: `Cliente ${n}`, id: `cli-${n}` },
      origem: 'MANUAL',
    }
  })

  const res = await fetch(`${base}/__admin/mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      priority: 1,
      request: { method: 'GET', urlPath: '/v1/venda/busca' },
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: {
          itens: sales,
          totais: {
            total: saleCount,
            aprovado: saleCount,
            cancelado: 0,
            atendimento: 0,
            expirado: 0,
          },
        },
      },
    }),
  })
  if (!res.ok) {
    throw new Error(`WireMock parallel sales stub failed: ${res.status}`)
  }
}

export async function getWiremockRequests(): Promise<
  Array<{ request?: { url?: string; loggedDate?: number } }>
> {
  const base = getWiremockAdminUrl()
  const res = await fetch(`${base}/__admin/requests`)
  if (!res.ok) {
    throw new Error(`WireMock requests fetch failed: ${res.status}`)
  }
  const body = (await res.json()) as {
    requests?: Array<{ request?: { url?: string; loggedDate?: number } }>
  }
  return body.requests ?? []
}
