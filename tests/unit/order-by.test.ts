import { describe, it, expect } from 'vitest'
import { buildMongoSort } from '../../src/lib/order-by/index.js'

describe('buildMongoSort', () => {
  it('GivenSingleAscField_WhenBuilding_ThenReturnsMongo1', () => {
    expect(buildMongoSort([{ nome: 'asc' }])).toEqual({ nome: 1 })
  })

  it('GivenSingleDescField_WhenBuilding_ThenReturnsMongoneg1', () => {
    expect(buildMongoSort([{ tipo: 'desc' }])).toEqual({ tipo: -1 })
  })

  it('GivenMultipleFields_WhenBuilding_ThenReturnsMultiKeySort', () => {
    expect(buildMongoSort([{ nome: 'asc' }, { tipo: 'desc' }])).toEqual({
      nome: 1,
      tipo: -1,
    })
  })

  it('GivenAscNullsFirst_WhenBuilding_ThenTreatsAsAscending', () => {
    expect(buildMongoSort([{ nome: 'asc_nulls_first' }])).toEqual({ nome: 1 })
  })

  it('GivenDescNullsLast_WhenBuilding_ThenTreatsAsDescending', () => {
    expect(buildMongoSort([{ tipo: 'desc_nulls_last' }])).toEqual({ tipo: -1 })
  })

  it('GivenNullFieldValue_WhenBuilding_ThenSkipsThatField', () => {
    expect(buildMongoSort([{ nome: null, tipo: 'asc' }])).toEqual({ tipo: 1 })
  })

  it('GivenNullInput_WhenBuilding_ThenReturnsUndefined', () => {
    expect(buildMongoSort(null)).toBeUndefined()
  })

  it('GivenEmptyArray_WhenBuilding_ThenReturnsUndefined', () => {
    expect(buildMongoSort([])).toBeUndefined()
  })
})
