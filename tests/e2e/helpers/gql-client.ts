interface GqlResponse<T> {
  data?: T
  errors?: Array<{
    message: string
    locations?: unknown
    path?: unknown
    extensions?: Record<string, unknown>
  }>
}

function getBaseUrl(): string {
  const url = process.env.E2E_BASE_URL
  if (!url) throw new Error('E2E_BASE_URL not set — globalSetup may not have run')
  return url
}

export async function gqlRaw(
  query: string,
  variables?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<GqlResponse<unknown>> {
  const res = await fetch(`${getBaseUrl()}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  })
  return res.json() as Promise<GqlResponse<unknown>>
}

export async function gqlClient<T>(
  query: string,
  variables?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<T> {
  const result = (await gqlRaw(query, variables, headers)) as GqlResponse<T>
  if (result.errors?.length) {
    throw new Error(`GraphQL errors: ${result.errors.map((error) => error.message).join(', ')}`)
  }
  if (!result.data) throw new Error('No data in GraphQL response')
  return result.data
}
