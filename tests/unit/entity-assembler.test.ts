import { describe, it, expect } from 'vitest'
import { buildEntitySchemaFromSdl } from '../../src/lib/entity/assembler.js'

const baseSdl = `
extend schema
  @link(
    url: "https://specs.apollo.dev/federation/v2.0"
    import: ["@key", "@shareable"]
  )

type Query
type Mutation {
  _schemaPlaceholder: Boolean
}

input StringComparisonExp { _eq: String }
input IDComparisonExp { _eq: ID }
enum order_by { asc desc }
type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
type CategoryQueryDiagnostic @shareable {
  code: String!
  message: String!
  hint: String!
  storeId: ID
}
type SyncResult {
  syncedCount: Int!
  syncedAt: String!
  status: String!
  errorMessage: String
}
`

const categorySdl = `
type ContaAzulCategory
  @model
  @mongo(collection: "conta_azul_categories")
  @tenant(field: "storeId")
  @key(fields: "id storeId") {
  id: ID!
  storeId: ID!
  nome: String!
  tipo: String!
}
`

describe('buildEntitySchemaFromSdl', () => {
  it('GivenModelType_WhenAssembled_ThenConnectionQueryFieldExists', () => {
    const schema = buildEntitySchemaFromSdl([baseSdl, categorySdl])
    const queryType = schema.getQueryType()
    expect(queryType?.getFields().contaAzulCategories).toBeDefined()
  })

  it('GivenModelType_WhenAssembled_ThenAggregateQueryFieldExists', () => {
    const schema = buildEntitySchemaFromSdl([baseSdl, categorySdl])
    const queryType = schema.getQueryType()
    expect(queryType?.getFields().contaAzulCategoriesAggregate).toBeDefined()
  })

  it('GivenModelType_WhenAssembled_ThenSyncMutationAbsent', () => {
    const schema = buildEntitySchemaFromSdl([baseSdl, categorySdl])
    const mutationType = schema.getMutationType()
    expect(mutationType?.getFields().syncContaAzulCategories).toBeUndefined()
  })

  it('GivenModelType_WhenAssembled_ThenGenerationDirectivesNotInSDL', () => {
    const schema = buildEntitySchemaFromSdl([baseSdl, categorySdl])
    expect(schema.getDirective('model')).toBeUndefined()
    expect(schema.getDirective('mongo')).toBeUndefined()
    expect(schema.getDirective('rest')).toBeUndefined()
    expect(schema.getDirective('tenant')).toBeUndefined()
  })

  it('GivenModelType_WhenAssembled_ThenFederationKeyFieldsExist', () => {
    const schema = buildEntitySchemaFromSdl([baseSdl, categorySdl])
    const categoryType = schema.getType('ContaAzulCategory')
    expect(categoryType).toBeDefined()
    const fields = categoryType!.getFields()
    expect(fields.id).toBeDefined()
    expect(fields.storeId).toBeDefined()
  })

  it('GivenDuplicateModelNames_WhenAssembling_ThenThrows', () => {
    expect(() => buildEntitySchemaFromSdl([baseSdl, categorySdl, categorySdl])).toThrow(
      /Duplicate @model entity/
    )
  })

  it('GivenMissingMongoDirective_WhenAssembling_ThenThrowsWithEntityName', () => {
    const badSdl = `
      type BadEntity @model { id: ID! }
    `
    expect(() => buildEntitySchemaFromSdl([baseSdl, badSdl])).toThrow(/BadEntity/)
  })
})
