const STORE_ID_PATTERN = /^[a-zA-Z0-9._-]+$/

export class InvalidStoreIdError extends Error {
  constructor(storeId: string) {
    super(`Invalid storeId: ${storeId}`)
    this.name = 'InvalidStoreIdError'
  }
}

export function validateStoreId(storeId: string): string {
  const trimmed = storeId.trim()
  if (!trimmed || !STORE_ID_PATTERN.test(trimmed)) {
    throw new InvalidStoreIdError(storeId)
  }
  return trimmed
}
