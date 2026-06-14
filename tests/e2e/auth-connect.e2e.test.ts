import { describe, expect, it } from 'vitest'
import { gqlRaw } from './helpers/gql-client.js'

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
    const syncRes = await gqlRaw(
      `mutation { syncContaAzulCategories(storeId: "${AUTH_STORE_ID}") { syncedCount status } }`
    )
    expect(syncRes.errors).toBeUndefined()
    expect(
      (syncRes.data as { syncContaAzulCategories: { status: string } }).syncContaAzulCategories
        .status
    ).toBe('success')

    const res = await gqlRaw(CATEGORIES_QUERY)
    expect(res.errors).toBeUndefined()
    const cats = (
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
})
