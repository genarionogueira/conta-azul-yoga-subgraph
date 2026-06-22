import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkJwksReachability } from '../../src/lib/auth/jwks-health.js'

describe('checkJwksReachability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('GivenMissingIssuer_WhenChecking_ThenReturnsNotConfigured', async () => {
    await expect(checkJwksReachability(undefined)).resolves.toEqual({
      ok: false,
      reason: 'zitadel issuer not configured',
    })
  })

  it('GivenValidJwksResponse_WhenChecking_ThenReturnsOk', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [{ kid: 'abc' }] }),
    })

    await expect(
      checkJwksReachability('https://zitadel.avcd.ai', fetchImpl)
    ).resolves.toEqual({
      ok: true,
      jwksUrl: 'https://zitadel.avcd.ai/oauth/v2/keys',
    })
  })

  it('GivenFailedJwksResponse_WhenChecking_ThenReturnsFailure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    })

    const result = await checkJwksReachability('https://zitadel.avcd.ai', fetchImpl)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('503')
    }
  })
})
