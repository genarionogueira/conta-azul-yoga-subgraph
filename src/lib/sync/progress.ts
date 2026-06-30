export type SyncResourceName = 'categories' | 'sales' | 'sale_items' | 'vendedores'

export type DisconnectResourceName =
  | 'sale_items'
  | 'sales'
  | 'categories'
  | 'vendedores'
  | 'metadata'
  | 'credentials'

export const RESOURCE_WEIGHTS: Record<SyncResourceName, number> = {
  categories: 5,
  sales: 35,
  sale_items: 50,
  vendedores: 10,
}

export const DISCONNECT_RESOURCE_WEIGHTS: Record<DisconnectResourceName, number> = {
  sale_items: 25,
  sales: 25,
  categories: 20,
  vendedores: 15,
  metadata: 10,
  credentials: 5,
}

export type SyncProgressPhase = 'BACKFILL' | 'INCREMENTAL' | 'DISCONNECT'

export interface ResourceProgressLike {
  resource: string
  total?: number | null
  completed: number
}

function weightsForPhase(phase?: SyncProgressPhase): Record<string, number> {
  return phase === 'DISCONNECT' ? DISCONNECT_RESOURCE_WEIGHTS : RESOURCE_WEIGHTS
}

export function computePercentage(
  resources: ResourceProgressLike[],
  phase?: SyncProgressPhase
): number {
  const weights = weightsForPhase(phase)
  let total = 0
  let activeWeight = 0
  for (const resource of resources) {
    const weight = weights[resource.resource] ?? 0
    activeWeight += weight
    const chunkTotal = resource.total ?? 1
    const ratio =
      chunkTotal > 0
        ? Math.min(Math.max(resource.completed, 0) / chunkTotal, 1)
        : resource.completed > 0
          ? 1
          : 0
    total += weight * ratio
  }
  if (activeWeight <= 0) {
    return resources.length > 0 && resources.every((resource) => resource.completed > 0) ? 100 : 0
  }
  return Math.min(100, Math.round((total / activeWeight) * 100))
}

export function initialBackfillResources(salesChunkTotal: number): ResourceProgressLike[] {
  return [
    { resource: 'categories', total: 1, completed: 0 },
    { resource: 'sales', total: salesChunkTotal, completed: 0 },
    { resource: 'sale_items', total: 0, completed: 0 },
    { resource: 'vendedores', total: 1, completed: 0 },
  ]
}

export function initialDisconnectResources(): ResourceProgressLike[] {
  return [
    { resource: 'metadata', total: 1, completed: 0 },
    { resource: 'credentials', total: 1, completed: 0 },
  ]
}
