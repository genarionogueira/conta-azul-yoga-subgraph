import { describe, it, expect } from 'vitest'
import { GraphQLError } from 'graphql'
import { badUserInput, createYogaMaskError } from '../../src/lib/errors/index.js'

describe('GraphQL error infrastructure', () => {
  it('GivenBadUserInput_WhenCreated_ThenHasBadUserInputCode', () => {
    const error = badUserInput('Invalid pagination', { field: 'first' })
    expect(error.extensions?.code).toBe('BAD_USER_INPUT')
    expect(error.message).toBe('Invalid pagination')
    expect(error.extensions?.field).toBe('first')
  })

  it('GivenGraphQLError_WhenMasked_ThenPassesThroughUnchanged', () => {
    const original = badUserInput('Invalid input')
    const mask = createYogaMaskError(false)
    const result = mask(original, 'Unexpected error.', false)
    expect(result).toBe(original)
    expect(result.message).toBe('Invalid input')
  })

  it('GivenPlainError_WhenMaskedInProduction_ThenReturnsGenericMessage', () => {
    const mask = createYogaMaskError(false)
    const result = mask(new Error('secret db failure'), 'Unexpected error.', false)
    expect(result.message).toBe('Unexpected error.')
    expect(result.extensions?.code).toBe('INTERNAL_SERVER_ERROR')
    expect(result.extensions?.originalError).toBeUndefined()
  })

  it('GivenPlainError_WhenMaskedInDevelopment_ThenIncludesOriginalError', () => {
    const mask = createYogaMaskError(true)
    const result = mask(new Error('secret db failure'), 'Unexpected error.', true)
    expect(result.extensions?.originalError).toBeDefined()
  })
})
