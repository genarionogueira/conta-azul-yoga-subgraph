import { GraphQLError } from 'graphql'
import { maskError } from 'graphql-yoga'

export function createYogaMaskError(isDev = false) {
  return (error: unknown, message: string, devFlag?: boolean) => {
    const development = devFlag ?? isDev
    if (error instanceof GraphQLError) {
      return error
    }
    return maskError(error, message, development)
  }
}
