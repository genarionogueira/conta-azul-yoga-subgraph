import { describe, it, expect } from 'vitest'

function getBaseUrl(): string {
  const url = process.env.E2E_BASE_URL
  if (!url) throw new Error('E2E_BASE_URL not set — globalSetup may not have run')
  return url
}

describe('E2E: Health endpoint', () => {
  it('GivenRunningContainer_WhenGetHealth_ThenReturns200', async () => {
    const res = await fetch(`${getBaseUrl()}/health`)
    expect(res.status).toBe(200)
  })

  it('GivenRunningContainer_WhenGetHealth_ThenBodyHasStatusOk', async () => {
    const res = await fetch(`${getBaseUrl()}/health`)
    const body = (await res.json()) as { status: string; auth?: unknown }
    expect(body.status).toBe('ok')
    expect(body.auth).toBeDefined()
  })

  it('GivenRunningContainer_WhenGetHealth_ThenContentTypeIsJson', async () => {
    const res = await fetch(`${getBaseUrl()}/health`)
    const contentType = res.headers.get('content-type') ?? ''
    expect(contentType).toContain('application/json')
  })
})
