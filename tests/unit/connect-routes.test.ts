import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleConnectRequest } from '../../src/http/connect-routes.js'

vi.mock('../../src/lib/auth/connect-flow.js', () => ({
  startConnect: vi.fn(),
  completeConnectFromCallback: vi.fn(),
}))

const { startConnect, completeConnectFromCallback } = await import(
  '../../src/lib/auth/connect-flow.js'
)

function createMockResponse(): ServerResponse & {
  statusCode?: number
  headers: Record<string, string | string[] | undefined>
  body: string
} {
  const res = {
    statusCode: undefined as number | undefined,
    headers: {} as Record<string, string | string[] | undefined>,
    body: '',
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status
      if (headers) Object.assign(this.headers, headers)
      return this
    },
    end(chunk?: string) {
      this.body = chunk ?? ''
    },
  }
  return res as unknown as ServerResponse & typeof res
}

function createRequest(method = 'GET'): IncomingMessage {
  return { method } as IncomingMessage
}

const deps = {
  connectFlow: {
    authConfig: {} as never,
    oauthStateStore: {} as never,
    tokenResolver: {} as never,
  },
}

describe('connect-routes', () => {
  beforeEach(() => {
    vi.mocked(startConnect).mockReset()
    vi.mocked(completeConnectFromCallback).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('GivenNoStoreId_WhenGetConnect_ThenReturnsFormHtml', async () => {
    const res = createMockResponse()
    const handled = await handleConnectRequest(
      createRequest(),
      res,
      '/connect',
      new URLSearchParams(),
      deps
    )

    expect(handled).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Store ID')
    expect(res.body).toContain('Connect')
  })

  it('GivenStoreId_WhenGetConnect_ThenShowsConnectLink', async () => {
    const res = createMockResponse()
    await handleConnectRequest(
      createRequest(),
      res,
      '/connect',
      new URLSearchParams({ store_id: 'store-1' }),
      deps
    )

    expect(res.body).toContain('store-1')
    expect(res.body).toContain('/connect/start?store_id=store-1')
  })

  it('GivenStoreId_WhenConnectStart_Then302WithLocation', async () => {
    vi.mocked(startConnect).mockResolvedValue({
      storeId: 'store-1',
      url: 'https://auth.example.com/authorize',
      state: 'state-1',
    })
    const res = createMockResponse()

    await handleConnectRequest(
      createRequest(),
      res,
      '/connect/start',
      new URLSearchParams({ store_id: 'store-1' }),
      deps
    )

    expect(startConnect).toHaveBeenCalledWith('store-1', deps.connectFlow)
    expect(res.statusCode).toBe(302)
    expect(res.headers.Location).toBe('https://auth.example.com/authorize')
  })

  it('GivenMissingStoreId_WhenConnectStart_Then400', async () => {
    const res = createMockResponse()
    await handleConnectRequest(
      createRequest(),
      res,
      '/connect/start',
      new URLSearchParams(),
      deps
    )

    expect(res.statusCode).toBe(400)
    expect(res.body.toLowerCase()).toContain('store_id')
  })

  it('GivenCodeAndState_WhenCallback_ThenSuccessHtml', async () => {
    vi.mocked(completeConnectFromCallback).mockResolvedValue({
      success: true,
      storeId: 'store-1',
    })
    const res = createMockResponse()

    await handleConnectRequest(
      createRequest(),
      res,
      '/callback',
      new URLSearchParams({ code: 'abc', state: 'xyz' }),
      deps
    )

    expect(res.statusCode).toBe(200)
    expect(res.body.toLowerCase()).toContain('connected')
    expect(res.body).toContain('store-1')
  })

  it('GivenOAuthError_WhenCallback_ThenErrorHtml', async () => {
    const res = createMockResponse()
    await handleConnectRequest(
      createRequest(),
      res,
      '/callback',
      new URLSearchParams({ error: 'access_denied' }),
      deps
    )

    expect(res.body.toLowerCase()).toContain('failed')
    expect(res.body).toContain('access_denied')
  })

  it('GivenInvalidState_WhenCallback_ThenErrorHtml', async () => {
    vi.mocked(completeConnectFromCallback).mockResolvedValue({
      success: false,
      storeId: '',
      error: 'Invalid or expired OAuth state',
    })
    const res = createMockResponse()

    await handleConnectRequest(
      createRequest(),
      res,
      '/callback',
      new URLSearchParams({ code: 'abc', state: 'bad' }),
      deps
    )

    expect(res.body).toContain('Invalid or expired OAuth state')
  })
})
