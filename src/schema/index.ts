import { buildEntitySchema } from '../lib/entity/assembler.js'

export const schemaPromise = buildEntitySchema()

export async function getSchema() {
  return schemaPromise
}
