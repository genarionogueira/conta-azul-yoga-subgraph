import { GraphQLError } from 'graphql'
import { ErrorCode } from './codes.js'

export function badUserInput(
  message: string,
  details?: Record<string, unknown>
): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: ErrorCode.BAD_USER_INPUT, ...details },
  })
}
