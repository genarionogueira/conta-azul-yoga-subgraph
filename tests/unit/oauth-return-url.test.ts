import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildPostConnectRedirect,
  validateReturnUrl,
} from '../../src/lib/oauth-return-url.js'

describe('oauth-return-url', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    process.env.WEB_DASH_PUBLIC_URL = 'https://dev.avocado.tech'
  })

  afterEach(() => {
    process.env = env
  })

  it('GivenAllowedOrigin_WhenValidateReturnUrl_ThenAcceptsUrl', () => {
    expect(validateReturnUrl('https://dev.avocado.tech/dashboard')).toBe(
      'https://dev.avocado.tech/dashboard'
    )
  })

  it('GivenForeignOrigin_WhenValidateReturnUrl_ThenRejectsUrl', () => {
    expect(validateReturnUrl('https://evil.example/')).toBeNull()
  })

  it('GivenStoreId_WhenBuildPostConnectRedirect_ThenAppendsQueryParam', () => {
    expect(
      buildPostConnectRedirect('store-1', 'https://dev.avocado.tech/')
    ).toBe('https://dev.avocado.tech/?contaAzulConnected=store-1')
  })
})
