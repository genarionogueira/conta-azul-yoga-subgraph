import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { JWTPayload } from 'jose'
import { createYoga } from 'graphql-yoga'
import { useServer } from 'graphql-ws/use/ws'
import { WebSocketServer } from 'ws'
import { createYogaMaskError } from './lib/errors/index.js'
import { authenticateRequest, BearerAuthError, extractBearerToken, verifyBearerToken } from './lib/auth/verify-bearer.js'
import { loadAuthSettings, logAuthSettingsOnStartup } from './lib/auth/settings.js'
import { isAllowedCorsOrigin, loadCorsOptions } from './lib/auth/cors.js'
import { checkJwksReachability } from './lib/auth/jwks-health.js'
import { getAuthMetrics, recordAuthFailure } from './lib/auth/metrics.js'
import { runWithRequestAuth } from './lib/auth/request-auth-store.js'
import { buildWsAppContext } from './lib/auth/ws-context.js'
import { buildContext, type AppContext } from './context.js'
import { initMongo, getDb, closeMongo } from './lib/mongo/connection.js'
import { ensureCategoriesIndexes, ensureConnectionsIndexes } from './lib/mongo/indexes.js'
import {
  startWorkerSyncEventSubscriber,
  stopWorkerSyncEventSubscriber,
} from './lib/worker-events/index.js'
import { schemaPromise } from './schema/index.js'
import { handleConnectRequest } from './http/connect-routes.js'
import { authConfig, connectionService } from './schema/auth/oauth-services.js'

const PORT = Number(process.env.PORT ?? 4000)
const authSettings = loadAuthSettings()
const corsOptions = loadCorsOptions()

logAuthSettingsOnStartup(authSettings)

function applyCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  origin: string
): void {
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader(
    'Access-Control-Allow-Headers',
    corsOptions.allowedHeaders.join(', ')
  )
  res.setHeader(
    'Access-Control-Allow-Methods',
    corsOptions.methods.join(', ')
  )
}

function handleCorsPreflight(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): boolean {
  if (req.method !== 'OPTIONS' || pathname !== '/graphql') {
    return false
  }

  const origin = req.headers.origin
  if (!origin || !isAllowedCorsOrigin(origin, corsOptions.origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'CORS origin not allowed' }))
    return true
  }

  applyCorsHeaders(req, res, origin)
  res.writeHead(204)
  res.end()
  return true
}

function sendAuthError(res: ServerResponse, error: BearerAuthError): void {
  recordAuthFailure()
  res.writeHead(error.statusCode, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': error.wwwAuthenticate,
  })
  res.end(JSON.stringify({ error: error.message }))
}

function describeBearer(req: IncomingMessage): string {
  const raw = req.headers['authorization']
  const header = Array.isArray(raw) ? raw[0] : raw
  if (!header) return 'no-authorization-header'
  if (!header.startsWith('Bearer ')) return 'non-bearer-scheme'

  const token = header.slice('Bearer '.length).trim()
  const segments = token.split('.')
  if (segments.length !== 3) return `opaque-token segments=${segments.length}`

  try {
    const payload = JSON.parse(
      Buffer.from(segments[1], 'base64url').toString('utf8')
    ) as { iss?: string; aud?: unknown; exp?: number }
    const aud = Array.isArray(payload.aud)
      ? payload.aud.join(',')
      : String(payload.aud ?? '')
    const expired =
      typeof payload.exp === 'number'
        ? String(payload.exp * 1000 < Date.now())
        : 'unknown'
    return `jwt iss=${payload.iss ?? ''} aud=[${aud}] expired=${expired}`
  } catch {
    return 'jwt-undecodable-payload'
  }
}

function requestToHeaders(req: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers.set(key, value)
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(', '))
    }
  }
  return headers
}

async function authenticateIncomingRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<JWTPayload | undefined> {
  const authHeader = req.headers.authorization
  const hasBearer =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')

  if (!authSettings.jwtRequired) {
    if (!hasBearer) {
      return undefined
    }
    try {
      const token = extractBearerToken(authHeader)
      return await verifyBearerToken(token, authSettings)
    } catch {
      return undefined
    }
  }

  try {
    const payload = await authenticateRequest(
      new Request('http://localhost/graphql', { headers: requestToHeaders(req) }),
      authSettings
    )
    return payload
  } catch (error) {
    if (error instanceof BearerAuthError) {
      console.warn(
        `[auth] 401 reason="${error.message}" token=${describeBearer(req)} metrics=${JSON.stringify(getAuthMetrics())}`
      )
      sendAuthError(res, error)
      return undefined
    }

    console.error('Authentication error:', error)
    sendAuthError(res, new BearerAuthError('Authentication failed'))
    return undefined
  }
}

async function buildWsAppContextForServer(
  connectionParams: Record<string, unknown> | null | undefined
): Promise<AppContext> {
  return buildWsAppContext(connectionParams, authSettings)
}

const connectRoutesDeps = {
  connectionService,
  authConfig,
  authenticateIncomingRequest,
  jwtRequired: authSettings.jwtRequired,
}

async function main(): Promise<void> {
  await initMongo()
  await ensureCategoriesIndexes(getDb())
  await ensureConnectionsIndexes(getDb())
  await startWorkerSyncEventSubscriber()

  const schema = await schemaPromise
  const isDev = process.env.NODE_ENV !== 'production'
  const yoga = createYoga({
    schema,
    graphqlEndpoint: '/graphql',
    context: buildContext,
    graphiql: isDev,
    cors: corsOptions,
    maskedErrors: {
      maskError: createYogaMaskError(isDev),
    },
  })

  const server = createServer((req, res) => {
    if (req.headers.upgrade?.toLowerCase() === 'websocket') {
      return
    }

    void (async () => {
      const origin = req.headers.origin
      if (
        origin &&
        isAllowedCorsOrigin(origin, corsOptions.origin) &&
        req.method !== 'OPTIONS'
      ) {
        applyCorsHeaders(req, res, origin)
      }

      if (req.method === 'OPTIONS') {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
        if (handleCorsPreflight(req, res, url.pathname)) {
          return
        }
      }

      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            status: 'ok',
            auth: getAuthMetrics(),
          })
        )
        return
      }

      if (req.url === '/ready' && req.method === 'GET') {
        const jwks = await checkJwksReachability(authSettings.zitadelIssuer)
        const ready = !authSettings.jwtRequired || jwks.ok
        res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            status: ready ? 'ready' : 'not_ready',
            jwks,
            auth: getAuthMetrics(),
          })
        )
        return
      }

      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

      const handled = await handleConnectRequest(
        req,
        res,
        url.pathname,
        url.searchParams,
        connectRoutesDeps
      )
      if (handled) {
        return
      }

      let authClaims: JWTPayload | undefined
      if (url.pathname === '/graphql' && req.method !== 'OPTIONS') {
        authClaims = await authenticateIncomingRequest(req, res)
        if (authSettings.jwtRequired && authClaims === undefined) {
          return
        }
      }

      await runWithRequestAuth({ authClaims }, () => yoga(req, res))
    })().catch((err) => {
      console.error('Request handler error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Internal Server Error')
      }
    })
  })

  const wsServer = new WebSocketServer({ server, path: '/graphql' })
  useServer(
    {
      schema,
      context: async (ctx) =>
        buildWsAppContextForServer(
          ctx.connectionParams as Record<string, unknown> | null | undefined
        ),
    },
    wsServer
  )

  server.listen(PORT, () => {
    console.log(`Yoga subgraph running on http://localhost:${PORT}/graphql`)
    console.log(`Conta Azul connect UI: http://localhost:${PORT}/connect`)
  })

  const shutdown = async () => {
    server.close()
    await stopWorkerSyncEventSubscriber()
    await closeMongo()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
