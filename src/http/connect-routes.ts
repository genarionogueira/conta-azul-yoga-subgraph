import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AuthConfigError } from '../lib/auth-config.js'
import {
  completeConnectFromCallback,
  startConnect,
  type ConnectFlowDeps,
} from '../lib/auth/connect-flow.js'

const templatesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')

function loadTemplate(name: string): string {
  return readFileSync(join(templatesDir, name), 'utf8')
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(body)
}

function renderConnectPage(storeId: string): string {
  const shell = loadTemplate('connect.html')
  const content = storeId
    ? `<p class="muted">Connecting store: <strong>${escapeHtml(storeId)}</strong></p>
       <a class="btn" href="/connect/start?store_id=${encodeURIComponent(storeId)}">Connect to Conta Azul</a>`
    : `<form method="get" action="/connect/start">
         <label for="store_id">Store ID</label>
         <input id="store_id" name="store_id" required placeholder="loja-1">
         <button type="submit">Connect</button>
       </form>`
  return shell.replace('{{CONTENT}}', content)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderSuccessPage(storeId: string): string {
  return loadTemplate('callback_success.html')
    .replace('{{STORE_ID}}', escapeHtml(storeId))
    .replace('{{ACCOUNT_LINE}}', '')
}

function renderErrorPage(error: string): string {
  return loadTemplate('callback_error.html').replace('{{ERROR}}', escapeHtml(error))
}

export interface ConnectRoutesDeps {
  connectFlow: ConnectFlowDeps
}

export async function handleConnectRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  searchParams: URLSearchParams,
  deps: ConnectRoutesDeps
): Promise<boolean> {
  if (req.method !== 'GET') {
    return false
  }

  if (pathname === '/connect') {
    const storeId = searchParams.get('store_id')?.trim() ?? ''
    sendHtml(res, 200, renderConnectPage(storeId))
    return true
  }

  if (pathname === '/connect/start') {
    const storeId = searchParams.get('store_id')?.trim() ?? ''
    if (!storeId) {
      sendHtml(res, 400, renderErrorPage('store_id query parameter is required'))
      return true
    }
    try {
      const { url } = await startConnect(storeId, deps.connectFlow)
      res.writeHead(302, { Location: url })
      res.end()
    } catch (err) {
      const message =
        err instanceof AuthConfigError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to start OAuth flow'
      sendHtml(res, 503, renderErrorPage(message))
    }
    return true
  }

  if (pathname === '/callback') {
    const oauthError = searchParams.get('error')
    if (oauthError) {
      sendHtml(res, 200, renderErrorPage(oauthError))
      return true
    }

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    if (!code || !state) {
      sendHtml(res, 200, renderErrorPage('Missing code or state from OAuth callback'))
      return true
    }

    const result = await completeConnectFromCallback(code, state, deps.connectFlow)
    if (!result.success) {
      sendHtml(res, 200, renderErrorPage(result.error))
      return true
    }

    sendHtml(res, 200, renderSuccessPage(result.storeId))
    return true
  }

  return false
}
