import { describe, it, expect } from 'vitest'
import { GraphQLError } from 'graphql'
import { validateConnectionArgs } from '../../src/lib/pagination/validate-args.js'

describe('validateConnectionArgs', () => {
  it('GivenFirstNegative_WhenValidated_ThenThrowsBadUserInput', () => {
    expect(() => validateConnectionArgs({ first: -1 })).toThrow(GraphQLError)
    try {
      validateConnectionArgs({ first: -1 })
    } catch (err) {
      expect(err).toBeInstanceOf(GraphQLError)
      expect((err as GraphQLError).extensions?.code).toBe('BAD_USER_INPUT')
      expect((err as GraphQLError).extensions?.field).toBe('first')
    }
  })

  it('GivenLastZero_WhenValidated_ThenThrowsBadUserInput', () => {
    expect(() => validateConnectionArgs({ last: 0 })).toThrow(GraphQLError)
  })

  it('GivenFirstAndLast_WhenValidated_ThenThrowsBadUserInput', () => {
    expect(() => validateConnectionArgs({ first: 5, last: 5 })).toThrow(GraphQLError)
  })

  it('GivenValidFirst_WhenValidated_ThenDoesNotThrow', () => {
    expect(() => validateConnectionArgs({ first: 10 })).not.toThrow()
  })

  it('GivenNoPaginationArgs_WhenValidated_ThenDoesNotThrow', () => {
    expect(() => validateConnectionArgs({})).not.toThrow()
  })
})
