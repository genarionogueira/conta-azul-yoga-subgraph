import { describe, it, expect } from 'vitest'
import { gqlClient, gqlRaw } from './helpers/gql-client.js'

describe('E2E: hello query', () => {
  it('GivenRunningContainer_WhenQueryHello_ThenReturnsHelloWorld', async () => {
    const data = await gqlClient<{ hello: string }>('{ hello }')
    expect(data.hello).toBe('Hello World!')
  })

  it('GivenRunningContainer_WhenQueryHello_ThenNoErrors', async () => {
    const res = await gqlRaw('{ hello }')
    expect(res.errors).toBeUndefined()
  })

  it('GivenRunningContainer_WhenQueryHello_ThenResponseHasDataKey', async () => {
    const res = await gqlRaw('{ hello }')
    expect(res.data).toBeDefined()
    expect(res.data).toHaveProperty('hello')
  })

  it('GivenRunningContainer_WhenQueryWithVariables_ThenVariablesAccepted', async () => {
    const res = await gqlRaw('{ hello }', {})
    expect(res.errors).toBeUndefined()
    expect(res.data).toEqual({ hello: 'Hello World!' })
  })
})
