import { describe, it, expect } from 'vitest'
import { gqlRaw } from './helpers/gql-client.js'

describe('E2E: Entity Framework — directive-driven entity generates full API', () => {
  it('GivenModelDirective_WhenServerBoots_ThenCategoriesConnectionQueryExists', async () => {
    const res = await gqlRaw(
      `{ contaAzulCategories(first: 1) { totalCount nodes { id storeId } } }`
    )
    expect(res.errors).toBeUndefined()
    expect(
      typeof (res.data as { contaAzulCategories: { totalCount: number } }).contaAzulCategories
        .totalCount
    ).toBe('number')
  })

  it('GivenModelDirective_WhenServerBoots_ThenAggregateQueryExists', async () => {
    const res = await gqlRaw(
      `{ contaAzulCategoriesAggregate(where: {}) { aggregate { count } } }`
    )
    expect(res.errors).toBeUndefined()
    expect(
      typeof (
        res.data as { contaAzulCategoriesAggregate: { aggregate: { count: number } } }
      ).contaAzulCategoriesAggregate.aggregate.count
    ).toBe('number')
  })

  it('GivenModelDirective_WhenServerBoots_ThenFederationSDLContainsKeyDirective', async () => {
    const res = await gqlRaw(`{ _service { sdl } }`)
    const sdl = (res.data as { _service: { sdl: string } })._service.sdl
    expect(sdl).toContain('@key(fields: "id storeId")')
    expect(sdl).not.toContain('@model')
    expect(sdl).not.toContain('@mongo')
  })

  it('GivenModelDirective_WhenServerBoots_ThenSyncMutationAbsent', async () => {
    const res = await gqlRaw(`mutation { syncContaAzulCategories { syncedCount status } }`)
    expect(res.errors).toBeDefined()
    expect(res.errors?.[0]?.message).toMatch(/syncContaAzulCategories|Cannot query field/)
  })
})
