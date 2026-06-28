import { GraphQLError } from 'graphql'
import type { JWTPayload } from 'jose'
import type { AppContext } from '../../context.js'

export const WORKER_JWT_SUBJECT = 'avcd-worker'

export function requireWorkerAuth(context: AppContext): void {
  const sub = context.authClaims?.sub
  if (sub !== WORKER_JWT_SUBJECT) {
    throw new GraphQLError('Forbidden: worker authentication required')
  }
}

export function isWorkerAuth(claims: JWTPayload | undefined): boolean {
  return claims?.sub === WORKER_JWT_SUBJECT
}
