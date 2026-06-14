import { describe, expect, it } from 'vitest'
import { gqlClient } from './helpers/gql-client.js'

function rewriteToLocalHost(url: string, localBaseUrl: string): string {
  const parsed = new URL(url)
  const base = new URL(localBaseUrl)
  return `${base.origin}${parsed.pathname}${parsed.search}`
}

describe('E2E: Conta Azul Connect UI - Goal: browser OAuth via HTTP routes', () => {
  it('GivenStoreId_WhenConnectStartThenCallback_ThenTokenStoredAndStatusConnected', async () => {
    const baseUrl = process.env.E2E_BASE_URL!
    const wiremockUrl = process.env.E2E_WIREMOCK_ADMIN_URL!
    const storeId = 'store-ui-e2e'

    const startRes = await fetch(`${baseUrl}/connect/start?store_id=${storeId}`, {
      redirect: 'manual',
    })
    expect(startRes.status).toBe(302)
    const authorizeUrl = startRes.headers.get('location')!
    expect(authorizeUrl).toContain('oauth2/authorize')

    const callbackRes = await fetch(rewriteToLocalHost(authorizeUrl, wiremockUrl), {
      redirect: 'manual',
    })
    expect(callbackRes.status).toBe(302)
    const callbackLocation = callbackRes.headers.get('location')!
    expect(callbackLocation).toContain('/callback')

    const finalRes = await fetch(rewriteToLocalHost(callbackLocation, baseUrl))
    expect(finalRes.status).toBe(200)
    const html = await finalRes.text()
    expect(html.toLowerCase()).toContain('connected')

    const status = await gqlClient<{ connectionStatus: { isConnected: boolean; error: string | null } }>(
      `{ connectionStatus(storeId: "${storeId}") { isConnected error } }`
    )
    expect(status.connectionStatus.isConnected).toBe(true)
    expect(status.connectionStatus.error).toBeNull()
  })

  it('GivenOAuthErrorParam_WhenCallback_ThenShowsErrorPage', async () => {
    const baseUrl = process.env.E2E_BASE_URL!
    const res = await fetch(`${baseUrl}/callback?error=access_denied`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html.toLowerCase()).toMatch(/failed|error|denied/)
  })
})
