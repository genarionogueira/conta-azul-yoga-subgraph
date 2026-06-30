import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaRoot = join(__dirname, '../../src/schema')

function collectGraphqlFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...collectGraphqlFiles(fullPath))
    } else if (entry.endsWith('.graphql')) {
      files.push(fullPath)
    }
  }
  return files
}

describe('persist and rest schema SDL', () => {
  it('GivenSchemaFiles_WhenReading_ThenContainsPersistAndRestTypes', () => {
    const files = collectGraphqlFiles(schemaRoot)
    const sdl = files.map((file) => readFileSync(file, 'utf8')).join('\n')

    expect(sdl).toContain('scalar JSON')
    expect(sdl).toContain('enum PersistMode')
    expect(sdl).toContain('type ContaAzulRestFetchResult')
    expect(sdl).toContain('contaAzulRestVendaBusca')
    expect(sdl).toContain('persistSales')
    expect(sdl).toContain('persistSaleItems')
    expect(sdl).toContain('persistVendedores')
    expect(sdl).toContain('type Sale')
    expect(sdl).toContain('@mongo(collection: "sales")')
    expect(sdl).toContain('type SaleItem')
    expect(sdl).toContain('type Vendedor')
    expect(sdl).toContain('collection: "sales"')
    expect(sdl).toContain('collection: "sale_items"')
    expect(sdl).toContain('collection: "vendedores"')
  })
})
