import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createYoga } from 'graphql-yoga'
import { createYogaMaskError } from './lib/errors/index.js'
import { authenticateRequest, BearerAuthError } from './lib/auth/verify-bearer.js'
import { loadAuthSettings } from './lib/auth/settings.js'
import { buildContext, getContaAzulClientForStore, listConnectedStoreIds } from './context.js'
import { initMongo, getDb, closeMongo } from './lib/mongo/connection.js'
import { ensureCategoriesIndexes } from './lib/mongo/indexes.js'
import { syncToMongo } from './lib/sync/service.js'
import { schemaPromise } from './schema/index.js'
import { handleConnectRequest } from './http/connect-routes.js'
import { authConfig, authTokenResolver, oauthStateStore } from './schema/auth/oauth-services.js'

const PORT = Number(process.env.PORT ?? 4000)
const authSettings = loadAuthSettings()

function sendAuthError(res: ServerResponse, error: BearerAuthError): void {
  res.writeHead(error.statusCode, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': error.wwwAuthenticate,
  })
  res.end(JSON.stringify({ error: error.message }))
}

// Diagnostic only: describe the inbound bearer token shape WITHOUT verifying it,
// so a 401 reveals whether the request had no token, an opaque token, or a JWT
// whose iss/aud/exp explains the rejection. iss/aud are not secrets.
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

async function ensureAuthenticated(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (!authSettings.jwtRequired) {
    return true
  }

  try {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers.set(key, value)
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(', '))
      }
    }

    await authenticateRequest(new Request('http://localhost/graphql', { headers }), authSettings)
    return true
  } catch (error) {
    if (error instanceof BearerAuthError) {
      console.warn(
        `[auth] 401 reason="${error.message}" token=${describeBearer(req)}`
      )
      sendAuthError(res, error)
      return false
    }

    console.error('Authentication error:', error)
    sendAuthError(res, new BearerAuthError('Authentication failed'))
    return false
  }
}

const connectRoutesDeps = {
  connectFlow: {
    authConfig,
    oauthStateStore,
    tokenResolver: authTokenResolver,
  },
}

async function startupSyncCategories(): Promise<void> {
  try {
    const ids = await listConnectedStoreIds()
    for (const sid of ids) {
      const client = await getContaAzulClientForStore(sid)
      if (!client) continue
      await syncToMongo(getDb(), {
        collectionName: 'conta_azul_categories',
        storeId: sid,
        fetcher: () =>
          client
            .listCategorias()
            .then((items) => items as unknown as Record<string, unknown>[]),
      }).catch((e) => console.error(`Startup sync categories ${sid}:`, e))
    }
  } catch (e) {
    console.error('Startup sync store list failed:', e)
  }
}

async function main(): Promise<void> {
  await initMongo()
  await ensureCategoriesIndexes(getDb())

  const schema = await schemaPromise
  const isDev = process.env.NODE_ENV !== 'production'
  const yoga = createYoga({
    schema,
    graphqlEndpoint: '/graphql',
    context: buildContext,
    graphiql: isDev,
    maskedErrors: {
      maskError: createYogaMaskError(isDev),
    },
  })

  const server = createServer((req, res) => {
    void (async () => {
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
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

      if (url.pathname === '/graphql') {
        const allowed = await ensureAuthenticated(req, res)
        if (!allowed) {
          return
        }
      }

      yoga(req, res)
    })().catch((err) => {
      console.error('Request handler error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Internal Server Error')
      }
    })
  })

  server.listen(PORT, () => {
    console.log(`Yoga subgraph running on http://localhost:${PORT}/graphql`)
    console.log(`Conta Azul connect UI: http://localhost:${PORT}/connect`)
    void startupSyncCategories()
  })

  const shutdown = async () => {
    server.close()
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
