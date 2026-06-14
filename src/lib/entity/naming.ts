export function pluralizeEntityName(name: string): string {
  const camel = name.charAt(0).toLowerCase() + name.slice(1)
  if (camel.endsWith('y')) {
    return `${camel.slice(0, -1)}ies`
  }
  return `${camel}s`
}

export function connectionQueryName(name: string): string {
  return pluralizeEntityName(name)
}

export function aggregateQueryName(name: string): string {
  return `${pluralizeEntityName(name)}Aggregate`
}

export function syncMutationName(name: string): string {
  const plural = pluralizeEntityName(name)
  return `sync${plural.charAt(0).toUpperCase()}${plural.slice(1)}`
}
