export interface RestAdapterClient {
  [method: string]: () => Promise<Record<string, unknown>[]>
}

export interface RestAdapter {
  listConnectedStoreIds(): Promise<string[]>
  getClientForStore(storeId: string): Promise<RestAdapterClient | undefined>
}

const adapters = new Map<string, RestAdapter>()

export function registerRestAdapter(name: string, adapter: RestAdapter): void {
  adapters.set(name, adapter)
}

export function getRestAdapter(name: string): RestAdapter {
  const adapter = adapters.get(name)
  if (!adapter) {
    throw new Error(`REST adapter "${name}" is not registered`)
  }
  return adapter
}

export function clearRestAdaptersForTest(): void {
  adapters.clear()
}
