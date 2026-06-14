import { printSchema } from 'graphql'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEntitySchema } from '../src/lib/entity/assembler.js'
import { getTokenResolver } from '../src/context.js'
import { disconnectAuthRedis } from '../src/schema/auth/oauth-services.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputPath = join(__dirname, '..', 'schema.generated.graphql')

const schema = await buildEntitySchema()
const sdl = printSchema(schema)
writeFileSync(outputPath, sdl, 'utf8')
console.log(`Schema written to ${outputPath}`)
await getTokenResolver().disconnect()
await disconnectAuthRedis()
