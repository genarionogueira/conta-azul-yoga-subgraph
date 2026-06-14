import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerRestAdapter,
  getRestAdapter,
  clearRestAdaptersForTest,
} from '../../src/lib/entity/adapters.js'

describe('RestAdapter registry', () => {
  beforeEach(() => {
    clearRestAdaptersForTest()
  })

  it('GivenRegisteredAdapter_WhenGetting_ThenReturnsAdapter', () => {
    const adapter = {
      listConnectedStoreIds: async () => ['store-1'],
      getClientForStore: async () => ({ listItems: async () => [] }),
    }
    registerRestAdapter('test', adapter)
    expect(getRestAdapter('test')).toBe(adapter)
  })

  it('GivenUnregisteredName_WhenGetting_ThenThrows', () => {
    expect(() => getRestAdapter('missing')).toThrow(/not registered/)
  })

  it('GivenAdapterRegisteredTwice_WhenGetting_ThenReturnsLatest', () => {
    registerRestAdapter('test', {
      listConnectedStoreIds: async () => ['a'],
      getClientForStore: async () => undefined,
    })
    const latest = {
      listConnectedStoreIds: async () => ['b'],
      getClientForStore: async () => undefined,
    }
    registerRestAdapter('test', latest)
    expect(getRestAdapter('test')).toBe(latest)
  })
})
