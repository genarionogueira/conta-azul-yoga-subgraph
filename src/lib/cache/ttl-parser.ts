export function parseTtl(ttl: string): number {
  if (ttl.length === 0) {
    throw new Error(`Unrecognized TTL format: ${ttl}`)
  }

  if (ttl.endsWith('h')) {
    const raw = ttl.slice(0, -1)
    if (!/^\d+$/.test(raw)) throw new Error(`Unrecognized TTL format: ${ttl}`)
    return parseInt(raw, 10) * 3_600_000
  }
  if (ttl.endsWith('m')) {
    const raw = ttl.slice(0, -1)
    if (!/^\d+$/.test(raw)) throw new Error(`Unrecognized TTL format: ${ttl}`)
    return parseInt(raw, 10) * 60_000
  }
  if (ttl.endsWith('s')) {
    const raw = ttl.slice(0, -1)
    if (!/^\d+$/.test(raw)) throw new Error(`Unrecognized TTL format: ${ttl}`)
    return parseInt(raw, 10) * 1_000
  }

  if (!/^\d+$/.test(ttl)) {
    throw new Error(`Unrecognized TTL format: ${ttl}`)
  }
  return parseInt(ttl, 10) * 1_000
}
