import type { EntityDef, EntityField, ScalarType } from './types.js'
import {
  aggregateQueryName,
  connectionQueryName,
  syncMutationName,
} from './naming.js'

function comparisonExpForScalar(scalar: ScalarType): string {
  switch (scalar) {
    case 'ID':
      return 'IDComparisonExp'
    case 'String':
      return 'StringComparisonExp'
    case 'Int':
      return 'IntComparisonExp'
    case 'Float':
      return 'FloatComparisonExp'
    case 'Boolean':
      return 'BooleanComparisonExp'
    default:
      return 'StringComparisonExp'
  }
}

function fieldGraphQLType(field: EntityField): string {
  return field.nullable ? field.type : `${field.type}!`
}

function buildBoolExp(entity: EntityDef): string {
  const fieldLines = entity.fields
    .map(
      (f) => `  ${f.name}: ${comparisonExpForScalar(f.type)}`
    )
    .join('\n')

  return `input ${entity.name}_bool_exp {
  _and: [${entity.name}_bool_exp!]
  _or: [${entity.name}_bool_exp!]
  _not: ${entity.name}_bool_exp
${fieldLines}
}`
}

function buildSelectColumn(entity: EntityDef): string {
  const values = entity.fields.map((f) => `  ${f.name}`).join('\n')
  return `enum ${entity.name}_select_column {
${values}
}`
}

function buildOrderBy(entity: EntityDef): string {
  const fieldLines = entity.fields
    .map((f) => `  ${f.name}: order_by`)
    .join('\n')
  return `input ${entity.name}_order_by {
${fieldLines}
}`
}

function buildObjectType(entity: EntityDef): string {
  const keyDirective = entity.key ? ` @key(fields: "${entity.key.fields}")` : ''
  const fieldLines = entity.fields
    .map((f) => `  ${f.name}: ${fieldGraphQLType(f)}`)
    .join('\n')
  return `type ${entity.name}${keyDirective} {
${fieldLines}
}`
}

function buildQueryExtensions(entity: EntityDef): string {
  const connectionField = connectionQueryName(entity.name)
  const aggregateField = aggregateQueryName(entity.name)

  return `extend type Query {
  ${connectionField}(
    where: ${entity.name}_bool_exp
    order_by: [${entity.name}_order_by!]
    distinct_on: [${entity.name}_select_column!]
    first: Int
    after: String
    last: Int
    before: String
  ): ${entity.name}Connection!
  ${aggregateField}(
    where: ${entity.name}_bool_exp
    distinct_on: [${entity.name}_select_column!]
  ): ${entity.name}_aggregate!
}`
}

function buildMutationExtension(entity: EntityDef): string | null {
  if (!entity.rest) {
    return null
  }
  const mutationField = syncMutationName(entity.name)
  return `extend type Mutation {
  ${mutationField}(storeId: ID): SyncResult!
}`
}

export function expandEntitySDL(entity: EntityDef): string {
  const parts = [
    buildBoolExp(entity),
    buildSelectColumn(entity),
    buildOrderBy(entity),
    `type ${entity.name}Edge {
  cursor: String!
  node: ${entity.name}!
}`,
    `type ${entity.name}Connection {
  edges: [${entity.name}Edge!]!
  nodes: [${entity.name}!]!
  pageInfo: PageInfo!
  totalCount: Int!
  diagnostics: [CategoryQueryDiagnostic!]!
}`,
    `type ${entity.name}_aggregate_fields {
  count: Int!
}`,
    `type ${entity.name}_aggregate {
  aggregate: ${entity.name}_aggregate_fields
  nodes: [${entity.name}!]!
}`,
    buildObjectType(entity),
    buildQueryExtensions(entity),
  ]

  const mutation = buildMutationExtension(entity)
  if (mutation) {
    parts.push(mutation)
  }

  return parts.join('\n\n')
}
