export function extractStoreId(request: Request): string | undefined {
  return request.headers.get('x-store-id') ?? undefined
}
