import { describe, it, expect } from 'vitest'
import { parse, Kind, type ObjectTypeDefinitionNode } from 'graphql'
import { parseEntityDef } from '../../src/lib/entity/parse-entity.js'
import { expandEntitySDL } from '../../src/lib/entity/expand.js'
import type { EntityDef } from '../../src/lib/entity/types.js'

const categoryEntity: EntityDef = {
  name: 'ContaAzulCategory',
  fields: [
    { name: 'id', type: 'ID', nullable: false },
    { name: 'storeId', type: 'ID', nullable: false },
    { name: 'nome', type: 'String', nullable: false },
    { name: 'tipo', type: 'String', nullable: false },
  ],
  mongo: { collection: 'conta_azul_categories' },
  rest: { adapter: 'contaAzul', list: 'listCategorias' },
  tenant: { field: 'storeId' },
  cache: null,
  key: { fields: 'id storeId' },
}

const annotatedSdl = `
type ContaAzulCategory
  @model
  @mongo(collection: "conta_azul_categories")
  @rest(adapter: "contaAzul", list: "listCategorias")
  @tenant(field: "storeId")
  @key(fields: "id storeId") {
  id: ID!
  storeId: ID!
  nome: String!
  tipo: String!
}
`

function getObjectType(sdl: string): ObjectTypeDefinitionNode {
  const doc = parse(sdl)
  const node = doc.definitions.find((d) => d.kind === Kind.OBJECT_TYPE_DEFINITION)
  if (!node || node.kind !== Kind.OBJECT_TYPE_DEFINITION) {
    throw new Error('expected object type')
  }
  return node
}

describe('parseEntityDef', () => {
  it('GivenAllDirectives_WhenParsing_ThenReturnsEntityDef', () => {
    const entity = parseEntityDef(getObjectType(annotatedSdl))
    expect(entity?.name).toBe('ContaAzulCategory')
    expect(entity?.mongo.collection).toBe('conta_azul_categories')
    expect(entity?.rest?.list).toBe('listCategorias')
    expect(entity?.key?.fields).toBe('id storeId')
  })

  it('GivenNoModelDirective_WhenParsing_ThenReturnsNull', () => {
    const sdl = `type Book { id: ID! name: String! }`
    expect(parseEntityDef(getObjectType(sdl))).toBeNull()
  })

  it('GivenMissingMongoArg_WhenParsing_ThenThrowsWithFieldName', () => {
    const sdl = `type Book @model { id: ID! }`
    expect(() => parseEntityDef(getObjectType(sdl))).toThrow(/@mongo/)
  })
})

describe('expandEntitySDL', () => {
  it('GivenAllDirectives_WhenExpanding_ThenEmitsBoolExp', () => {
    const sdl = expandEntitySDL(categoryEntity)
    expect(sdl).toContain('input ContaAzulCategory_bool_exp')
    expect(sdl).toContain('id: IDComparisonExp')
    expect(sdl).toContain('nome: StringComparisonExp')
  })

  it('GivenAllDirectives_WhenExpanding_ThenEmitsConnectionType', () => {
    const sdl = expandEntitySDL(categoryEntity)
    expect(sdl).toContain('type ContaAzulCategoryConnection')
    expect(sdl).toContain('diagnostics: [CategoryQueryDiagnostic!]!')
  })

  it('GivenAllDirectives_WhenExpanding_ThenEmitsAggregateType', () => {
    const sdl = expandEntitySDL(categoryEntity)
    expect(sdl).toContain('type ContaAzulCategory_aggregate')
    expect(sdl).toContain('contaAzulCategoriesAggregate')
  })

  it('GivenAllDirectives_WhenExpanding_ThenEmitsQueryFields', () => {
    const sdl = expandEntitySDL(categoryEntity)
    expect(sdl).toContain('contaAzulCategories(')
    expect(sdl).toContain('distinct_on: [ContaAzulCategory_select_column!]')
  })

  it('GivenRestDirective_WhenExpanding_ThenEmitsSyncMutation', () => {
    const sdl = expandEntitySDL(categoryEntity)
    expect(sdl).toContain('syncContaAzulCategories(storeId: ID): SyncResult!')
  })

  it('GivenNoRestDirective_WhenExpanding_ThenNoSyncMutation', () => {
    const sdl = expandEntitySDL({ ...categoryEntity, rest: null })
    expect(sdl).not.toContain('extend type Mutation')
    expect(sdl).not.toContain('syncContaAzulCategories')
  })

  it('GivenKeyDirective_WhenExpanding_ThenKeyPreservedOnObjectType', () => {
    const sdl = expandEntitySDL(categoryEntity)
    expect(sdl).toContain('@key(fields: "id storeId")')
  })

  it('GivenModelDirective_WhenExpanding_ThenModelDirectiveAbsentFromOutput', () => {
    const sdl = expandEntitySDL(categoryEntity)
    expect(sdl).not.toContain('@model')
    expect(sdl).not.toContain('@mongo')
    expect(sdl).not.toContain('@rest')
  })

  it('GivenIntField_WhenExpanding_ThenUsesIntComparisonExp', () => {
    const entity: EntityDef = {
      ...categoryEntity,
      name: 'CountEntity',
      fields: [{ name: 'amount', type: 'Int', nullable: false }],
    }
    const sdl = expandEntitySDL(entity)
    expect(sdl).toContain('amount: IntComparisonExp')
  })

  it('GivenBooleanField_WhenExpanding_ThenUsesBooleanComparisonExp', () => {
    const entity: EntityDef = {
      ...categoryEntity,
      name: 'FlagEntity',
      fields: [{ name: 'active', type: 'Boolean', nullable: true }],
    }
    const sdl = expandEntitySDL(entity)
    expect(sdl).toContain('active: BooleanComparisonExp')
    expect(sdl).toContain('active: Boolean')
  })

  it('GivenNullableField_WhenExpanding_ThenFieldTypeIsNullable', () => {
    const entity: EntityDef = {
      ...categoryEntity,
      name: 'OptionalEntity',
      fields: [{ name: 'label', type: 'String', nullable: true }],
    }
    const sdl = expandEntitySDL(entity)
    expect(sdl).toMatch(/label: String\n/)
    expect(sdl).not.toMatch(/label: String!/)
  })

  it('GivenNoKeyDirective_WhenExpanding_ThenObjectTypeHasNoKeyDirective', () => {
    const sdl = expandEntitySDL({ ...categoryEntity, key: null })
    expect(sdl).not.toContain('@key')
  })
})
