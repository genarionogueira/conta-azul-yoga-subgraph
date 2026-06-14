import { createServer } from 'node:http'
import { createYoga } from 'graphql-yoga'
import { createYogaMaskError } from './lib/errors/index.js'
import { buildContext, getContaAzulClientForStore, listConnectedStoreIds } from './context.js'
import { initMongo, getDb, closeMongo } from './lib/mongo/connection.js'
import { ensureCategoriesIndexes } from './lib/mongo/indexes.js'
import { syncToMongo } from './lib/sync/service.js'
import { schemaPromise } from './schema/index.js'

const PORT = Number(process.env.PORT ?? 4000)

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
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }
    yoga(req, res)
  })

  server.listen(PORT, () => {
    console.log(`Yoga subgraph running on http://localhost:${PORT}/graphql`)
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
