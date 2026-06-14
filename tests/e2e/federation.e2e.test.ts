import { describe, it, expect } from 'vitest'
import { gqlClient } from './helpers/gql-client.js'

describe('E2E: Apollo Federation SDL', () => {
  it('GivenRunningContainer_WhenQueryService_ThenSDLContainsHelloField', async () => {
    const data = await gqlClient<{ _service: { sdl: string } }>('{ _service { sdl } }')
    expect(data._service.sdl).toContain('hello')
  })

  it('GivenRunningContainer_WhenQueryService_ThenSDLIsNonEmptyString', async () => {
    const data = await gqlClient<{ _service: { sdl: string } }>('{ _service { sdl } }')
    expect(data._service.sdl.length).toBeGreaterThan(0)
  })

  it('GivenRunningContainer_WhenQueryService_ThenSDLContainsQueryType', async () => {
    const data = await gqlClient<{ _service: { sdl: string } }>('{ _service { sdl } }')
    expect(data._service.sdl).toMatch(/type Query/)
  })
})
