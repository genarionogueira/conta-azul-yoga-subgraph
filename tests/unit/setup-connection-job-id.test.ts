import { describe, expect, it, vi } from 'vitest'
import { setupConnection } from '../../src/schema/auth/resolvers/Mutation/setupConnection.js'
import { completeOAuthCallback } from '../../src/schema/auth/resolvers/Mutation/completeOAuthCallback.js'
import { createTestContext } from '../helpers/test-context.js'

const mockCompleteConnect = vi.fn()
const mockCompleteConnectFromCallback = vi.fn()

vi.mock('../../src/schema/auth/oauth-services.js', () => ({
  connectionService: {
    completeConnect: (...args: unknown[]) => mockCompleteConnect(...args),
    completeConnectFromCallback: (...args: unknown[]) =>
      mockCompleteConnectFromCallback(...args),
  },
}))

describe('SetupResult jobId exposure', () => {
  it('GivenSuccessfulSetupConnection_WhenResolved_ThenIncludesJobId', async () => {
    mockCompleteConnect.mockResolvedValue({
      success: true,
      storeId: 'store-1',
      jobId: 'job-connect-1',
    })

    const result = await setupConnection(
      null,
      { storeId: 'store-1', code: 'code', state: 'state' },
      createTestContext()
    )

    expect(result).toEqual({
      success: true,
      storeId: 'store-1',
      jobId: 'job-connect-1',
      error: null,
    })
  })

  it('GivenSuccessfulCompleteOAuthCallback_WhenResolved_ThenIncludesJobId', async () => {
    mockCompleteConnectFromCallback.mockResolvedValue({
      success: true,
      storeId: 'store-cb',
      jobId: 'job-cb-1',
    })

    const result = await completeOAuthCallback(
      null,
      { code: 'code', state: 'state' },
      createTestContext()
    )

    expect(result).toEqual({
      success: true,
      storeId: 'store-cb',
      jobId: 'job-cb-1',
      error: null,
    })
  })
})
