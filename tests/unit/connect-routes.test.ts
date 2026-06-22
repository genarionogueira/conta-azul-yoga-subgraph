import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleConnectRequest } from '../../src/http/connect-routes.js'
import { TEST_TENANT_ID } from '../helpers/test-context.js'

const mockStartConnect = vi.fn()
const mockCompleteConnectFromCallback = vi.fn()
const mockAuthenticate = vi.fn()

const deps = {
  connectionService: {
    startConnect: mockStartConnect,
    completeConnectFromCallback: mockCompleteConnectFromCallback,
  },
  authConfig: {} as never,
  jwtRequired: false,
  authenticateIncomingRequest: mockAuthenticate,
}

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

describe('connect-routes', () => {
  beforeEach(() => {
    mockStartConnect.mockReset()
    mockCompleteConnectFromCallback.mockReset()
    mockAuthenticate.mockReset()
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
    mockStartConnect.mockResolvedValue({
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

    expect(mockStartConnect).toHaveBeenCalledWith(TEST_TENANT_ID, 'store-1')
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

  it('GivenCodeAndState_WhenCallback_ThenRedirectsToWebDash', async () => {
    process.env.WEB_DASH_PUBLIC_URL = 'https://dev.avocado.tech'
    mockCompleteConnectFromCallback.mockResolvedValue({
      success: true,
      storeId: 'store-1',
      returnUrl: 'https://dev.avocado.tech/',
    })
    const res = createMockResponse()

    await handleConnectRequest(
      createRequest(),
      res,
      '/callback',
      new URLSearchParams({ code: 'abc', state: 'xyz' }),
      deps
    )

    expect(res.statusCode).toBe(302)
    expect(res.headers.Location).toBe(
      'https://dev.avocado.tech/?contaAzulConnected=store-1'
    )
  })

  it('GivenCodeAndStateWithoutReturnUrl_WhenCallback_ThenFallsBackToSuccessHtml', async () => {
    delete process.env.WEB_DASH_PUBLIC_URL
    mockCompleteConnectFromCallback.mockResolvedValue({
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
    mockCompleteConnectFromCallback.mockResolvedValue({
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
