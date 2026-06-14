import { describe, it, expect } from 'vitest'
import { gqlRaw } from './helpers/gql-client.js'

describe('E2E: GraphQL error handling', () => {
  it('GivenUnknownField_WhenQueried_ThenResponseContainsErrors', async () => {
    const res = await gqlRaw('{ notAField }')
    expect(res.errors).toBeDefined()
    expect(res.errors!.length).toBeGreaterThan(0)
  })

  it('GivenUnknownField_WhenQueried_ThenErrorMessageMentionsField', async () => {
    const res = await gqlRaw('{ notAField }')
    const messages = (res.errors ?? []).map((error) => error.message).join(' ')
    expect(messages.toLowerCase()).toContain('notafield')
  })

  it('GivenEmptyQuery_WhenPosted_ThenResponseContainsErrors', async () => {
    const res = await gqlRaw('')
    expect(res.errors).toBeDefined()
    expect(res.errors!.length).toBeGreaterThan(0)
  })
})
