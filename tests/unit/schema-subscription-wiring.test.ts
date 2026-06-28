import { describe, expect, it } from 'vitest'
import { getSchema } from '../../src/schema/index.js'

describe('assembled schema subscription wiring', () => {
  it('attaches subscribe and resolve for contaAzulWorkerSyncEvents', async () => {
    const schema = await getSchema()
    const field = schema.getSubscriptionType()?.getFields().contaAzulWorkerSyncEvents

    expect(field).toBeDefined()
    expect(field?.subscribe).toBeTypeOf('function')
    expect(field?.resolve).toBeTypeOf('function')
  })
})
