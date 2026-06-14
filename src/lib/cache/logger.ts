export type CacheLogEvent =
  | 'skip_no_cache_directive'
  | 'skip_no_rest_adapter'
  | 'resolve_store_ids'
  | 'skip_no_stores'
  | 'fresh_hit'
  | 'stale_refresh_start'
  | 'singleflight_wait'
  | 'fresh_hit_after_lock'
  | 'api_fetch_ok'
  | 'mongo_sync_ok'
  | 'meta_written'
  | 'skip_no_token'
  | 'skip_no_fetcher'
  | 'api_fetch_failed'
  | 'sync_failed'
  | 'resolver_ensure_fresh'

const WARN_EVENTS = new Set<CacheLogEvent>([
  'skip_no_token',
  'skip_no_fetcher',
  'api_fetch_failed',
  'sync_failed',
])

export function logCache(
  event: CacheLogEvent,
  fields: Record<string, string | number | boolean | null | undefined>
): void {
  const parts = [`[cache] event=${event}`]
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    parts.push(`${key}=${value}`)
  }
  const line = parts.join(' ')
  if (WARN_EVENTS.has(event)) {
    console.warn(line)
  } else {
    console.info(line)
  }
}
