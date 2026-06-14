import {
  Kind,
  type ObjectTypeDefinitionNode,
  type TypeNode,
} from 'graphql'
import type {
  EntityDef,
  EntityField,
  ScalarType,
} from './types.js'

const SCALAR_TYPES = new Set<ScalarType>(['ID', 'String', 'Int', 'Float', 'Boolean'])

function getDirectiveArg(
  node: ObjectTypeDefinitionNode,
  directiveName: string,
  argName: string
): string | undefined {
  const directive = node.directives?.find((d) => d.name.value === directiveName)
  const arg = directive?.arguments?.find((a) => a.name.value === argName)
  if (!arg || arg.value.kind !== Kind.STRING) {
    return undefined
  }
  return arg.value.value
}

function hasDirective(node: ObjectTypeDefinitionNode, name: string): boolean {
  return node.directives?.some((d) => d.name.value === name) ?? false
}

function parseFieldType(
  typeNode: TypeNode
): { scalar: ScalarType; nullable: boolean } | null {
  if (typeNode.kind === Kind.NON_NULL_TYPE) {
    const inner = typeNode.type
    if (inner.kind !== Kind.NAMED_TYPE) {
      return null
    }
    const name = inner.name.value
    if (!SCALAR_TYPES.has(name as ScalarType)) {
      return null
    }
    return { scalar: name as ScalarType, nullable: false }
  }

  if (typeNode.kind === Kind.NAMED_TYPE) {
    const name = typeNode.name.value
    if (!SCALAR_TYPES.has(name as ScalarType)) {
      return null
    }
    return { scalar: name as ScalarType, nullable: true }
  }

  return null
}

function parseFields(node: ObjectTypeDefinitionNode): EntityField[] {
  const fields: EntityField[] = []
  for (const field of node.fields ?? []) {
    const parsed = parseFieldType(field.type)
    if (!parsed) {
      throw new Error(`Entity ${node.name.value}: field ${field.name.value} must be a scalar type`)
    }
    fields.push({
      name: field.name.value,
      type: parsed.scalar,
      nullable: parsed.nullable,
    })
  }
  return fields
}

export function parseEntityDef(node: ObjectTypeDefinitionNode): EntityDef | null {
  if (!hasDirective(node, 'model')) {
    return null
  }

  const collection = getDirectiveArg(node, 'mongo', 'collection')
  if (!collection) {
    throw new Error(`Entity ${node.name.value}: @mongo(collection) is required`)
  }

  const restAdapter = getDirectiveArg(node, 'rest', 'adapter')
  const restList = getDirectiveArg(node, 'rest', 'list')
  const tenantField = getDirectiveArg(node, 'tenant', 'field')
  const cacheTtl = getDirectiveArg(node, 'cache', 'ttl')
  const keyFields = getDirectiveArg(node, 'key', 'fields')

  if (hasDirective(node, 'rest') && (!restAdapter || !restList)) {
    throw new Error(`Entity ${node.name.value}: @rest(adapter, list) requires both arguments`)
  }

  return {
    name: node.name.value,
    fields: parseFields(node),
    mongo: { collection },
    rest:
      restAdapter && restList
        ? { adapter: restAdapter, list: restList }
        : null,
    tenant: tenantField ? { field: tenantField } : null,
    cache: cacheTtl ? { ttl: cacheTtl } : null,
    key: keyFields ? { fields: keyFields } : null,
  }
}
