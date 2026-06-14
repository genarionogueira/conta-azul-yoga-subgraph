import { describe, it, expect } from 'vitest'
import { buildMongoFilter } from '../../src/lib/filter/translator.js'

describe('buildMongoFilter', () => {
  it('GivenEqFilter_WhenBuilding_ThenReturnsMongoEqOperator', () => {
    expect(buildMongoFilter({ nome: { _eq: 'Receitas' } })).toEqual({
      nome: { $eq: 'Receitas' },
    })
  })

  it('GivenNeqFilter_WhenBuilding_ThenReturnsMongoNeOperator', () => {
    expect(buildMongoFilter({ tipo: { _neq: 'DESPESA' } })).toEqual({
      tipo: { $ne: 'DESPESA' },
    })
  })

  it('GivenLikeFilter_WhenBuilding_ThenReturnsMongoRegexCaseInsensitive', () => {
    expect(buildMongoFilter({ nome: { _like: '%foo%' } })).toEqual({
      nome: { $regex: '.*foo.*', $options: 'i' },
    })
  })

  it('GivenIlikeFilter_WhenBuilding_ThenSameAsLike', () => {
    expect(buildMongoFilter({ nome: { _ilike: '%bar%' } })).toEqual({
      nome: { $regex: '.*bar.*', $options: 'i' },
    })
  })

  it('GivenInFilter_WhenBuilding_ThenReturnsMongoInOperator', () => {
    expect(buildMongoFilter({ tipo: { _in: ['RECEITA', 'DESPESA'] } })).toEqual({
      tipo: { $in: ['RECEITA', 'DESPESA'] },
    })
  })

  it('GivenGtGteFilter_WhenBuilding_ThenReturnsMongoGtGte', () => {
    expect(buildMongoFilter({ count: { _gt: 5, _gte: 10 } })).toEqual({
      count: { $gt: 5, $gte: 10 },
    })
  })

  it('GivenAndLogical_WhenBuilding_ThenReturnsMongoAndArray', () => {
    expect(
      buildMongoFilter({
        _and: [{ tipo: { _eq: 'RECEITA' } }, { nome: { _eq: 'Foo' } }],
      })
    ).toEqual({
      $and: [{ tipo: { $eq: 'RECEITA' } }, { nome: { $eq: 'Foo' } }],
    })
  })

  it('GivenOrLogical_WhenBuilding_ThenReturnsMongoOrArray', () => {
    expect(
      buildMongoFilter({
        _or: [{ tipo: { _eq: 'RECEITA' } }, { tipo: { _eq: 'DESPESA' } }],
      })
    ).toEqual({
      $or: [{ tipo: { $eq: 'RECEITA' } }, { tipo: { $eq: 'DESPESA' } }],
    })
  })

  it('GivenNotLogical_WhenBuilding_ThenReturnsMongoNorArray', () => {
    expect(buildMongoFilter({ _not: { tipo: { _eq: 'RECEITA' } } })).toEqual({
      $nor: [{ tipo: { $eq: 'RECEITA' } }],
    })
  })

  it('GivenNestedAndOr_WhenBuilding_ThenReturnsCorrectNestedStructure', () => {
    expect(
      buildMongoFilter({
        _and: [
          { tipo: { _eq: 'RECEITA' } },
          { _or: [{ nome: { _like: '%A%' } }, { nome: { _like: '%B%' } }] },
        ],
      })
    ).toEqual({
      $and: [
        { tipo: { $eq: 'RECEITA' } },
        { $or: [{ nome: { $regex: '.*A.*', $options: 'i' } }, { nome: { $regex: '.*B.*', $options: 'i' } }] },
      ],
    })
  })

  it('GivenNullWhere_WhenBuilding_ThenReturnsEmptyObject', () => {
    expect(buildMongoFilter(null)).toEqual({})
  })

  it('GivenUndefinedWhere_WhenBuilding_ThenReturnsEmptyObject', () => {
    expect(buildMongoFilter(undefined)).toEqual({})
  })

  it('GivenLikePatternWithDotAndParen_WhenBuilding_ThenEscapesSpecialRegexChars', () => {
    expect(buildMongoFilter({ nome: { _like: '%1.0(x)%' } })).toEqual({
      nome: { $regex: '.*1\\.0\\(x\\).*', $options: 'i' },
    })
  })

  it('GivenUnknownOperatorKey_WhenBuilding_ThenIgnoresItWithNoThrow', () => {
    expect(buildMongoFilter({ nome: { _unknown: 'x', _eq: 'ok' } })).toEqual({
      nome: { $eq: 'ok' },
    })
  })

  it('GivenEmptyFieldComparison_WhenBuilding_ThenOmitsFieldFromFilter', () => {
    expect(buildMongoFilter({ storeId: {} })).toEqual({})
  })

  it('GivenEmptyFieldAlongsideRealFilter_WhenBuilding_ThenOnlyAppliesRealConstraints', () => {
    expect(buildMongoFilter({ storeId: {}, tipo: { _eq: 'RECEITA' } })).toEqual({
      tipo: { $eq: 'RECEITA' },
    })
  })
})
