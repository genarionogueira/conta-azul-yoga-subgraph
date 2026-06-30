import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Kind,
  parse,
  print,
  type DocumentNode,
  type GraphQLSchema,
  type ObjectTypeDefinitionNode,
} from 'graphql'
import { buildSubgraphSchema } from '@apollo/subgraph'
import type { GraphQLResolverMap } from '@apollo/subgraph/dist/schema-helper/resolverMap.js'
import { expandEntitySDL } from './expand.js'
import { parseEntityDef } from './parse-entity.js'
import { bindEntityResolvers } from './resolvers.js'
import type { EntityDef } from './types.js'
import { registerContaAzulAdapter } from './contaazul-adapter.js'
import type { GraphQLFieldResolver } from 'graphql'
import type { AppContext } from '../../context.js'

function bindAppContextResolver<TArgs>(
  resolver: (parent: unknown, args: TArgs, context: AppContext) => unknown
): GraphQLFieldResolver<unknown, unknown> {
  return (parent, args, context) => resolver(parent, args as TArgs, context as AppContext)
}

const STRIP_DIRECTIVE_DECLARATIONS = new Set(['model', 'mongo', 'rest', 'cache', 'tenant'])

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..', '..', '..')

function collectGraphqlFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...collectGraphqlFiles(fullPath))
    } else if (entry.endsWith('.graphql')) {
      files.push(fullPath)
    }
  }
  return files
}

function stripDirectiveDeclarations(doc: DocumentNode): DocumentNode {
  return {
    ...doc,
    definitions: doc.definitions.filter((def) => {
      if (def.kind !== Kind.DIRECTIVE_DEFINITION) {
        return true
      }
      return !STRIP_DIRECTIVE_DECLARATIONS.has(def.name.value)
    }),
  }
}

function stripModelObjectTypes(doc: DocumentNode): DocumentNode {
  return {
    ...doc,
    definitions: doc.definitions.filter((def) => {
      if (def.kind !== Kind.OBJECT_TYPE_DEFINITION) {
        return true
      }
      const hasModel = def.directives?.some((d) => d.name.value === 'model') ?? false
      return !hasModel
    }),
  }
}

function parseEntitiesFromDocs(docs: DocumentNode[]): EntityDef[] {
  const entities: EntityDef[] = []
  const seen = new Set<string>()

  for (const doc of docs) {
    for (const def of doc.definitions) {
      if (def.kind !== Kind.OBJECT_TYPE_DEFINITION) {
        continue
      }
      const entity = parseEntityDef(def as ObjectTypeDefinitionNode)
      if (!entity) {
        continue
      }
      if (seen.has(entity.name)) {
        throw new Error(`Duplicate @model entity: ${entity.name}`)
      }
      seen.add(entity.name)
      entities.push(entity)
    }
  }

  return entities
}

function mergeResolvers(
  entityResolvers: GraphQLResolverMap<unknown>[],
  manual: GraphQLResolverMap<unknown>
): GraphQLResolverMap<unknown> {
  const merged: GraphQLResolverMap<unknown> = {
    Query: {},
    Mutation: {},
  }

  for (const block of entityResolvers) {
    if (block.Query) {
      Object.assign(merged.Query as object, block.Query)
    }
    if (block.Mutation) {
      Object.assign(merged.Mutation as object, block.Mutation)
    }
    if (block.Subscription) {
      merged.Subscription ??= {}
      Object.assign(merged.Subscription as object, block.Subscription)
    }
  }

  if (manual.Query) {
    Object.assign(merged.Query as object, manual.Query)
  }
  if (manual.Mutation) {
    Object.assign(merged.Mutation as object, manual.Mutation)
  }
  if (manual.Subscription) {
    merged.Subscription ??= {}
    Object.assign(merged.Subscription as object, manual.Subscription)
  }

  return merged
}

export interface BuildEntitySchemaOptions {
  schemaDirs?: string[]
}

export async function buildEntitySchema(
  options: BuildEntitySchemaOptions = {}
): Promise<GraphQLSchema> {
  registerContaAzulAdapter()

  const schemaDirs = options.schemaDirs ?? [join(projectRoot, 'src', 'schema')]
  const graphqlFiles = schemaDirs.flatMap((dir) => collectGraphqlFiles(dir))
  const entityDirectivesPath = join(projectRoot, 'src', 'lib', 'entity', 'directives.graphql')
  if (!graphqlFiles.includes(entityDirectivesPath)) {
    graphqlFiles.push(entityDirectivesPath)
  }

  const rawDocs = graphqlFiles.map((file) => parse(readFileSync(file, 'utf8')))
  const entities = parseEntitiesFromDocs(rawDocs)

  const expandedSdl = entities.map((entity) => expandEntitySDL(entity)).join('\n\n')
  const baseDocs = rawDocs.map(stripModelObjectTypes).map(stripDirectiveDeclarations)

  const mergedSdl = [...baseDocs.map((doc) => print(doc)), expandedSdl].join('\n\n')
  const typeDefs = parse(mergedSdl)

  const entityResolverBlocks = entities.map((entity) =>
    bindEntityResolvers(entity) as GraphQLResolverMap<unknown>
  )

  const { authorizationUrl } = await import('../../schema/auth/resolvers/Query/authorizationUrl.js')
  const { contaAzulAuthConfig } = await import('../../schema/auth/resolvers/Query/contaAzulAuthConfig.js')
  const { connectionStatus } = await import('../../schema/auth/resolvers/Query/connectionStatus.js')
  const { connectedStores } = await import('../../schema/auth/resolvers/Query/connectedStores.js')
  const { connections } = await import('../../schema/auth/resolvers/Query/connections.js')
  const { hello } = await import('../../schema/hello/resolvers/Query/hello.js')
  const { contaAzulWorkerSyncEvents } = await import(
    '../../schema/worker-events/resolvers/Query/contaAzulWorkerSyncEvents.js'
  )
  const {
    contaAzulWorkerSyncEventsSubscription,
    contaAzulWorkerSyncEventsSubscriptionResolve,
  } = await import(
    '../../schema/worker-events/resolvers/Subscription/contaAzulWorkerSyncEvents.js'
  )
  const { setupConnection } = await import('../../schema/auth/resolvers/Mutation/setupConnection.js')
  const { completeOAuthCallback } = await import('../../schema/auth/resolvers/Mutation/completeOAuthCallback.js')
  const { disconnectStore } = await import('../../schema/auth/resolvers/Mutation/disconnectStore.js')
  const { updateConnection } = await import('../../schema/auth/resolvers/Mutation/updateConnection.js')
  const { updateStoreId } = await import('../../schema/auth/resolvers/Mutation/updateStoreId.js')
  const { syncContaAzulCategories } = await import(
    '../../schema/categories/resolvers/Mutation/syncContaAzulCategories.js'
  )
  const { syncContaAzulSales } = await import(
    '../../schema/sales/resolvers/Mutation/syncContaAzulSales.js'
  )
  const { syncContaAzulSaleItems } = await import(
    '../../schema/sale-items/resolvers/Mutation/syncContaAzulSaleItems.js'
  )
  const {
    reconcileStore,
    reconcileAll,
    disconnectStoreData,
  } = await import('../../schema/sync/resolvers/Mutation/syncMutations.js')
  const {
    deleteStoreSaleItemsPhase,
    deleteStoreSalesPhase,
    deleteStoreCategoriesPhase,
    deleteStoreVendedoresPhase,
    cleanupStoreDisconnectMetadataMutation,
    finalizeStoreDisconnect,
  } = await import('../../schema/sync/resolvers/Mutation/disconnectMutations.js')
  const {
    syncConnectedStores,
    syncCategories,
    syncSales,
    syncSaleItems,
    enqueueReconcileStore,
  } = await import('../../schema/sync/resolvers/Mutation/granularSyncMutations.js')
  const { reportStoreSyncProgress } = await import(
    '../../schema/sync/resolvers/Mutation/reportStoreSyncProgress.js'
  )
  const {
    storeSyncJob,
    activeStoreSyncJob,
    contaAzulSalesWatermark,
    contaAzulActiveBackfill,
  } = await import('../../schema/sync/resolvers/Query/storeSyncProgressQueries.js')
  const {
    storeSyncProgressSubscription,
    storeSyncProgressSubscriptionResolve,
  } = await import('../../schema/sync/resolvers/Subscription/storeSyncProgress.js')
  const {
    storeSyncProgressByStoreSubscription,
    storeSyncProgressByStoreSubscriptionResolve,
  } = await import('../../schema/sync/resolvers/Subscription/storeSyncProgressByStore.js')
  const {
    contaAzulRestVendaBusca,
    contaAzulRestVendaItens,
    contaAzulRestVendaVendedores,
  } = await import('../../schema/rest/resolvers/Query/restFetchQueries.js')
  const {
    persistSales,
    persistSaleItems,
    persistVendedores,
    fetchAndPersistSaleItems,
  } = await import('../../schema/persist/resolvers/Mutation/persistMutations.js')
  const { JSONScalar } = await import('../scalars/json.js')

  const manualResolvers: GraphQLResolverMap<unknown> = {
    JSON: JSONScalar,
    Query: {
      authorizationUrl: bindAppContextResolver(authorizationUrl),
      contaAzulAuthConfig: bindAppContextResolver(contaAzulAuthConfig),
      connectionStatus: bindAppContextResolver(connectionStatus),
      connectedStores: bindAppContextResolver(connectedStores),
      syncConnectedStores: bindAppContextResolver(syncConnectedStores),
      connections: bindAppContextResolver(connections),
      contaAzulWorkerSyncEvents: bindAppContextResolver(contaAzulWorkerSyncEvents),
      storeSyncJob: bindAppContextResolver(storeSyncJob),
      activeStoreSyncJob: bindAppContextResolver(activeStoreSyncJob),
      contaAzulSalesWatermark: bindAppContextResolver(contaAzulSalesWatermark),
      contaAzulActiveBackfill: bindAppContextResolver(contaAzulActiveBackfill),
      contaAzulRestVendaBusca: bindAppContextResolver(contaAzulRestVendaBusca),
      contaAzulRestVendaItens: bindAppContextResolver(contaAzulRestVendaItens),
      contaAzulRestVendaVendedores: bindAppContextResolver(contaAzulRestVendaVendedores),
      hello,
    },
    Mutation: {
      setupConnection: bindAppContextResolver(setupConnection),
      completeOAuthCallback: bindAppContextResolver(completeOAuthCallback),
      disconnectStore: bindAppContextResolver(disconnectStore),
      updateConnection: bindAppContextResolver(updateConnection),
      updateStoreId: bindAppContextResolver(updateStoreId),
      syncContaAzulCategories: bindAppContextResolver(syncContaAzulCategories),
      syncContaAzulSales: bindAppContextResolver(syncContaAzulSales),
      syncContaAzulSaleItems: bindAppContextResolver(syncContaAzulSaleItems),
      reconcileStore: bindAppContextResolver(reconcileStore),
      reconcileAll: bindAppContextResolver(reconcileAll),
      disconnectStoreData: bindAppContextResolver(disconnectStoreData),
      deleteStoreSaleItemsPhase: bindAppContextResolver(deleteStoreSaleItemsPhase),
      deleteStoreSalesPhase: bindAppContextResolver(deleteStoreSalesPhase),
      deleteStoreCategoriesPhase: bindAppContextResolver(deleteStoreCategoriesPhase),
      deleteStoreVendedoresPhase: bindAppContextResolver(deleteStoreVendedoresPhase),
      cleanupStoreDisconnectMetadata: bindAppContextResolver(
        cleanupStoreDisconnectMetadataMutation
      ),
      finalizeStoreDisconnect: bindAppContextResolver(finalizeStoreDisconnect),
      syncCategories: bindAppContextResolver(syncCategories),
      syncSales: bindAppContextResolver(syncSales),
      syncSaleItems: bindAppContextResolver(syncSaleItems),
      enqueueReconcileStore: bindAppContextResolver(enqueueReconcileStore),
      reportStoreSyncProgress: bindAppContextResolver(reportStoreSyncProgress),
      persistSales: bindAppContextResolver(persistSales),
      persistSaleItems: bindAppContextResolver(persistSaleItems),
      persistVendedores: bindAppContextResolver(persistVendedores),
      fetchAndPersistSaleItems: bindAppContextResolver(fetchAndPersistSaleItems),
    },
    Subscription: {
      contaAzulWorkerSyncEvents: {
        subscribe: bindAppContextResolver(contaAzulWorkerSyncEventsSubscription),
        resolve: (event: unknown) =>
          contaAzulWorkerSyncEventsSubscriptionResolve(
            event as Parameters<typeof contaAzulWorkerSyncEventsSubscriptionResolve>[0]
          ),
      },
      storeSyncProgress: {
        subscribe: bindAppContextResolver(storeSyncProgressSubscription),
        resolve: (event: unknown) => storeSyncProgressSubscriptionResolve(event),
      },
      storeSyncProgressByStore: {
        subscribe: bindAppContextResolver(storeSyncProgressByStoreSubscription),
        resolve: (event: unknown) => storeSyncProgressByStoreSubscriptionResolve(event),
      },
    },
  }

  const resolvers = mergeResolvers(entityResolverBlocks, manualResolvers)

  return buildSubgraphSchema({
    typeDefs,
    resolvers,
  })
}

export function buildEntitySchemaFromSdl(
  sdlParts: string[],
  manualResolvers: GraphQLResolverMap<unknown> = {}
): GraphQLSchema {
  const rawDocs = sdlParts.map((sdl) => parse(sdl))
  const entities = parseEntitiesFromDocs(rawDocs)
  const expandedSdl = entities.map((entity) => expandEntitySDL(entity)).join('\n\n')
  const baseDocs = rawDocs.map(stripModelObjectTypes).map(stripDirectiveDeclarations)
  const mergedSdl = [...baseDocs.map((doc) => print(doc)), expandedSdl].join('\n\n')
  const typeDefs = parse(mergedSdl)

  const entityResolverBlocks = entities.map((entity) =>
    bindEntityResolvers(entity) as GraphQLResolverMap<unknown>
  )
  const resolvers = mergeResolvers(entityResolverBlocks, manualResolvers)

  return buildSubgraphSchema({ typeDefs, resolvers })
}
