import { describe, it, expect } from 'vitest'
import { parse } from 'graphql'
import { hello } from '../schema/hello/resolvers/Query/hello.js'
import { getSchema } from '../schema/index.js'

describe('hello resolver', () => {
  it('GivenNoArgs_WhenCallingHello_ThenReturnsHelloWorld', async () => {
    const result = await hello({}, {}, {} as never, {} as never)
    expect(result).toBe('Hello World!')
  })
})

describe('schema', () => {
  it('GivenSchema_WhenInspected_ThenExposesHelloQueryField', async () => {
    const schema = await getSchema()
    const queryType = schema.getQueryType()
    const helloField = queryType?.getFields().hello

    expect(helloField).toBeDefined()
    expect(helloField?.type.toString()).toBe('String!')
  })

  it('GivenSchema_WhenInspected_ThenExposesFederationServiceField', async () => {
    const schema = await getSchema()
    const queryType = schema.getQueryType()
    const serviceField = queryType?.getFields()._service

    expect(serviceField).toBeDefined()
    expect(serviceField?.type.toString()).toBe('_Service!')
  })

  it('GivenSchema_WhenInspected_ThenExposesEntityConnectionQuery', async () => {
    const schema = await getSchema()
    const queryType = schema.getQueryType()
    expect(queryType?.getFields().contaAzulCategories).toBeDefined()
    expect(queryType?.getFields().contaAzulCategoriesAggregate).toBeDefined()
  })

  it('GivenUnknownField_WhenInspectingQueryType_ThenFieldIsUndefined', async () => {
    const schema = await getSchema()
    const queryType = schema.getQueryType()
    expect(queryType?.getFields().unknownField).toBeUndefined()
  })

  it('GivenMalformedQuery_WhenParsing_ThenThrowsSyntaxError', () => {
    expect(() => parse('{ hello')).toThrow()
  })
})
