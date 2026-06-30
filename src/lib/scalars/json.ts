import { GraphQLScalarType, Kind } from 'graphql'

function parseJsonLiteral(ast: import('graphql').ValueNode): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value)
    case Kind.OBJECT: {
      const value: Record<string, unknown> = {}
      for (const field of ast.fields) {
        value[field.name.value] = parseJsonLiteral(field.value)
      }
      return value
    }
    case Kind.LIST:
      return ast.values.map(parseJsonLiteral)
    case Kind.NULL:
      return null
    default:
      return null
  }
}

export const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value',
  serialize(value) {
    return value
  },
  parseValue(value) {
    return value
  },
  parseLiteral(ast) {
    return parseJsonLiteral(ast)
  },
})
