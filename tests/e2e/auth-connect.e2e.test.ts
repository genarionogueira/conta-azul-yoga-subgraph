import { describe, expect, it } from 'vitest'
import { gqlRaw } from './helpers/gql-client.js'
import { countStoreCategories, storeCacheMetaExists } from './helpers/worker-sync.js'

const AUTH_STORE_ID = 'store-oauth'
const CATEGORIES_QUERY = '{ contaAzulCategories { nodes { storeId id nome tipo } } }'

describe('E2E: OAuth connect flow', () => {
  it('GivenRedirectUriInEnv_WhenAuthorizationUrl_ThenReturnsUrlAndState', async () => {
    const res = await gqlRaw(
      `{ authorizationUrl(storeId: "${AUTH_STORE_ID}") { storeId url state } }`
    )
    expect(res.errors).toBeUndefined()
    const data = res.data as {
      authorizationUrl: { storeId: string; url: string; state: string }
    }
    expect(data.authorizationUrl.storeId).toBe(AUTH_STORE_ID)
    expect(data.authorizationUrl.url).toContain('client_id=')
    expect(data.authorizationUrl.url).toContain('redirect_uri=')
    expect(data.authorizationUrl.state).toBeTruthy()
  })

  it('GivenValidCodeAndState_WhenSetupConnection_ThenSucceeds', async () => {
    const authRes = await gqlRaw(
      `{ authorizationUrl(storeId: "${AUTH_STORE_ID}") { state } }`
    )
    expect(authRes.errors).toBeUndefined()
    const { state } = (
      authRes.data as { authorizationUrl: { state: string } }
    ).authorizationUrl

    const setupRes = await gqlRaw(
      `mutation {
        setupConnection(storeId: "${AUTH_STORE_ID}", code: "e2e-auth-code", state: "${state}") {
          success
          storeId
          error
        }
      }`
    )
    expect(setupRes.errors).toBeUndefined()
    const result = (
      setupRes.data as {
        setupConnection: { success: boolean; storeId: string; error: string | null }
      }
    ).setupConnection
    expect(result.success).toBe(true)
    expect(result.storeId).toBe(AUTH_STORE_ID)
    expect(result.error).toBeNull()
  })

  it('GivenConnectedStore_WhenQueryingCategories_ThenReturnsWireMockData', async () => {
    const deadline = Date.now() + 30_000
    let cats: Array<{ storeId: string; id: string; nome: string; tipo: string }> = []

    while (Date.now() < deadline) {
      const res = await gqlRaw(CATEGORIES_QUERY)
      expect(res.errors).toBeUndefined()
      cats = (
        res.data as {
          contaAzulCategories: {
            nodes: Array<{
              storeId: string
              id: string
              nome: string
              tipo: string
            }>
          }
        }
      ).contaAzulCategories.nodes.filter((c) => c.storeId === AUTH_STORE_ID)
      if (cats.length >= 2) break
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    expect(cats).toHaveLength(2)
    expect(cats[0]?.id).toBe('cat-1')
    expect(cats[1]?.id).toBe('cat-2')
  })

  it('GivenMismatchedState_WhenSetupConnection_ThenReturnsError', async () => {
    const res = await gqlRaw(
      `mutation {
        setupConnection(storeId: "${AUTH_STORE_ID}", code: "bad-code", state: "wrong-state") {
          success
          error
        }
      }`
    )
    expect(res.errors).toBeUndefined()
    const result = (
      res.data as { setupConnection: { success: boolean; error: string | null } }
    ).setupConnection
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('GivenConnectedStore_WhenConnectedStoresQuery_ThenIncludesStore', async () => {
    const res = await gqlRaw(`{ connectedStores { storeId isConnected } }`)
    expect(res.errors).toBeUndefined()
    const stores = (res.data as { connectedStores: Array<{ storeId: string; isConnected: boolean }> })
      .connectedStores
    expect(stores.some((s) => s.storeId === AUTH_STORE_ID && s.isConnected)).toBe(true)
  })

})

describe('E2E: connections registry', () => {
  const CONNECTIONS_STORE_ID = 'store-conn-name'
  const DISCONNECT_REGISTRY_STORE_ID = 'store-conn-disconnect'
  const CONNECTIONS_QUERY =
    '{ connections { id name isConnected connectedAt } }'

  it('GivenSetupConnectionWithName_WhenQueryConnections_ThenReturnsIdAndName', async () => {
    const authRes = await gqlRaw(
      `{ authorizationUrl(storeId: "${CONNECTIONS_STORE_ID}") { state } }`
    )
    expect(authRes.errors).toBeUndefined()
    const { state } = (
      authRes.data as { authorizationUrl: { state: string } }
    ).authorizationUrl

    const setupRes = await gqlRaw(
      `mutation {
        setupConnection(
          storeId: "${CONNECTIONS_STORE_ID}"
          code: "e2e-auth-code"
          state: "${state}"
          name: "Butantã"
        ) {
          success
          storeId
          error
        }
      }`
    )
    expect(setupRes.errors).toBeUndefined()
    const setup = (
      setupRes.data as {
        setupConnection: { success: boolean; storeId: string; error: string | null }
      }
    ).setupConnection
    expect(setup.success).toBe(true)
    expect(setup.storeId).toBe(CONNECTIONS_STORE_ID)

    const listRes = await gqlRaw(CONNECTIONS_QUERY)
    expect(listRes.errors).toBeUndefined()
    const connections = (
      listRes.data as {
        connections: Array<{
          id: string
          name: string
          isConnected: boolean
          connectedAt: string | null
        }>
      }
    ).connections
    const match = connections.find((row) => row.id === CONNECTIONS_STORE_ID)
    expect(match).toEqual(
      expect.objectContaining({
        id: CONNECTIONS_STORE_ID,
        name: 'Butantã',
        isConnected: true,
      })
    )
    expect(match?.connectedAt).toBeTruthy()
  })

  it('GivenConnectedStore_WhenUpdateConnection_ThenConnectionsReturnsNewName', async () => {
    const RENAME_STORE_ID = 'store-conn-rename'
    const authRes = await gqlRaw(
      `{ authorizationUrl(storeId: "${RENAME_STORE_ID}") { state } }`
    )
    expect(authRes.errors).toBeUndefined()
    const { state } = (
      authRes.data as { authorizationUrl: { state: string } }
    ).authorizationUrl

    const setupRes = await gqlRaw(
      `mutation {
        setupConnection(
          storeId: "${RENAME_STORE_ID}"
          code: "e2e-auth-code"
          state: "${state}"
          name: "Original"
        ) {
          success
        }
      }`
    )
    expect(setupRes.errors).toBeUndefined()

    const renameRes = await gqlRaw(
      `mutation {
        updateConnection(id: "${RENAME_STORE_ID}", name: "Renamed Store") {
          success
          id
          name
          error
        }
      }`
    )
    expect(renameRes.errors).toBeUndefined()
    const rename = (
      renameRes.data as {
        updateConnection: {
          success: boolean
          id: string
          name: string | null
          error: string | null
        }
      }
    ).updateConnection
    expect(rename.success).toBe(true)
    expect(rename.id).toBe(RENAME_STORE_ID)
    expect(rename.name).toBe('Renamed Store')
    expect(rename.error).toBeNull()

    const listRes = await gqlRaw(CONNECTIONS_QUERY)
    expect(listRes.errors).toBeUndefined()
    const connections = (
      listRes.data as {
        connections: Array<{ id: string; name: string }>
      }
    ).connections
    const match = connections.find((row) => row.id === RENAME_STORE_ID)
    expect(match?.name).toBe('Renamed Store')
  })

  it('GivenDisconnectedStore_WhenQueryConnections_ThenStoreAbsent', async () => {
    const authRes = await gqlRaw(
      `{ authorizationUrl(storeId: "${DISCONNECT_REGISTRY_STORE_ID}") { state } }`
    )
    expect(authRes.errors).toBeUndefined()
    const { state } = (
      authRes.data as { authorizationUrl: { state: string } }
    ).authorizationUrl

    const setupRes = await gqlRaw(
      `mutation {
        setupConnection(
          storeId: "${DISCONNECT_REGISTRY_STORE_ID}"
          code: "e2e-auth-code"
          state: "${state}"
          name: "Temp Store"
        ) {
          success
        }
      }`
    )
    expect(setupRes.errors).toBeUndefined()

    const disconnectRes = await gqlRaw(
      `mutation {
        disconnectStore(storeId: "${DISCONNECT_REGISTRY_STORE_ID}") {
          success
        }
      }`
    )
    expect(disconnectRes.errors).toBeUndefined()
    const disconnect = (
      disconnectRes.data as { disconnectStore: { success: boolean } }
    ).disconnectStore
    expect(disconnect.success).toBe(true)

    const listRes = await gqlRaw(CONNECTIONS_QUERY)
    expect(listRes.errors).toBeUndefined()
    const connections = (
      listRes.data as { connections: Array<{ id: string }> }
    ).connections
    expect(connections.some((row) => row.id === DISCONNECT_REGISTRY_STORE_ID)).toBe(
      false
    )
  })
})

describe('E2E: connection rename', () => {
  it('GivenNotConnected_WhenUpdateConnection_ThenSuccessFalse', async () => {
    const res = await gqlRaw(
      `mutation {
        updateConnection(id: "store-never-connected", name: "Ghost") {
          success
          id
          name
          error
        }
      }`
    )
    expect(res.errors).toBeUndefined()
    const result = (
      res.data as {
        updateConnection: {
          success: boolean
          id: string
          name: string | null
          error: string | null
        }
      }
    ).updateConnection
    expect(result.success).toBe(false)
    expect(result.name).toBeNull()
    expect(result.error).toContain('not connected')
  })
})

describe('E2E: OAuth connect flow (continued)', () => {
  it('GivenConnectedStore_WhenDisconnectStore_ThenRemovesFromConnectedStores', async () => {
    const disconnectRes = await gqlRaw(
      `mutation {
        disconnectStore(storeId: "${AUTH_STORE_ID}") {
          success
          storeId
          error
        }
      }`
    )
    expect(disconnectRes.errors).toBeUndefined()
    const disconnect = (
      disconnectRes.data as {
        disconnectStore: { success: boolean; storeId: string; error: string | null }
      }
    ).disconnectStore
    expect(disconnect.success).toBe(true)
    expect(disconnect.storeId).toBe(AUTH_STORE_ID)

    const listRes = await gqlRaw(`{ connectedStores { storeId isConnected } }`)
    expect(listRes.errors).toBeUndefined()
    const stores = (listRes.data as { connectedStores: Array<{ storeId: string }> }).connectedStores
    expect(stores.some((s) => s.storeId === AUTH_STORE_ID)).toBe(false)

    const statusRes = await gqlRaw(
      `{ connectionStatus(storeId: "${AUTH_STORE_ID}") { isConnected error } }`
    )
    expect(statusRes.errors).toBeUndefined()
    const status = (
      statusRes.data as { connectionStatus: { isConnected: boolean; error: string | null } }
    ).connectionStatus
    expect(status.isConnected).toBe(false)

    expect(await countStoreCategories(AUTH_STORE_ID)).toBe(0)
    expect(await storeCacheMetaExists(AUTH_STORE_ID)).toBe(false)

    const catsRes = await gqlRaw(CATEGORIES_QUERY)
    expect(catsRes.errors).toBeUndefined()
    const remaining = (
      catsRes.data as {
        contaAzulCategories: { nodes: Array<{ storeId: string }> }
      }
    ).contaAzulCategories.nodes.filter((c) => c.storeId === AUTH_STORE_ID)
    expect(remaining).toHaveLength(0)
  })
})
