import { AsyncLocalStorage } from 'node:async_hooks'
import type { JWTPayload } from 'jose'

export interface RequestAuthStore {
  authClaims?: JWTPayload
}

export const requestAuthStorage = new AsyncLocalStorage<RequestAuthStore>()

export function getRequestAuthClaims(): JWTPayload | undefined {
  return requestAuthStorage.getStore()?.authClaims
}

export function runWithRequestAuth<T>(
  store: RequestAuthStore,
  fn: () => T
): T {
  return requestAuthStorage.run(store, fn)
}
