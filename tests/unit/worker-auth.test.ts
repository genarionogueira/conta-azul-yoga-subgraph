import { describe, expect, it } from 'vitest'
import { GraphQLError } from 'graphql'
import { requireWorkerAuth, WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import type { AppContext } from '../../src/context.js'

describe('requireWorkerAuth', () => {
  it('GivenWorkerSub_WhenRequireWorkerAuth_ThenPasses', () => {
    const context = {
      authClaims: { sub: WORKER_JWT_SUBJECT },
    } as AppContext

    expect(() => requireWorkerAuth(context)).not.toThrow()
  })

  it('GivenOtherSub_WhenRequireWorkerAuth_ThenThrowsForbidden', () => {
    const context = {
      authClaims: { sub: 'other-client' },
    } as AppContext

    expect(() => requireWorkerAuth(context)).toThrow(GraphQLError)
    expect(() => requireWorkerAuth(context)).toThrow(/worker authentication required/)
  })

  it('GivenMissingClaims_WhenRequireWorkerAuth_ThenThrowsForbidden', () => {
    const context = {} as AppContext

    expect(() => requireWorkerAuth(context)).toThrow(GraphQLError)
  })
})
