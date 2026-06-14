import { describe, it, expect } from 'vitest'
import type { EntityDef, EntityField } from '../../src/lib/entity/types.js'

describe('EntityDef types', () => {
  it('GivenEntityField_WhenConstructed_ThenHoldsNameTypeAndNullable', () => {
    const field: EntityField = { name: 'id', type: 'ID', nullable: false }
    expect(field.name).toBe('id')
    expect(field.type).toBe('ID')
    expect(field.nullable).toBe(false)
  })

  it('GivenEntityDef_WhenConstructed_ThenHoldsAllDirectives', () => {
    const entity: EntityDef = {
      name: 'ContaAzulCategory',
      fields: [
        { name: 'id', type: 'ID', nullable: false },
        { name: 'nome', type: 'String', nullable: false },
      ],
      mongo: { collection: 'conta_azul_categories' },
      rest: { adapter: 'contaAzul', list: 'listCategorias' },
      tenant: { field: 'storeId' },
      cache: null,
      key: { fields: 'id storeId' },
    }
    expect(entity.name).toBe('ContaAzulCategory')
    expect(entity.mongo.collection).toBe('conta_azul_categories')
    expect(entity.rest?.adapter).toBe('contaAzul')
    expect(entity.key?.fields).toBe('id storeId')
  })
})
