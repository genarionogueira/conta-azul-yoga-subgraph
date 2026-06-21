import { describe, expect, it } from 'vitest'

import {
  isAllowedCorsOrigin,
  loadCorsOptions,
} from '../../src/lib/auth/cors.js'
import { JWT_CLOCK_TOLERANCE_SECONDS } from '../../src/lib/auth/verify-bearer.js'
import { logAuthSettingsOnStartup, loadAuthSettings } from '../../src/lib/auth/settings.js'
import { zitadelJwksUrl } from '../../src/lib/auth/verify-bearer.js'

describe('loadCorsOptions', () => {
  it('GivenDefaultEnv_WhenLoading_ThenIncludesWebDashOrigins', () => {
    const options = loadCorsOptions()

    expect(options.origin).toContain('https://dev.avocado.tech')
    expect(options.origin).toContain('http://localhost:3001')
    expect(options.allowedHeaders).toContain('authorization')
    expect(options.allowedHeaders).toContain('x-store-id')
    expect(options.methods).toContain('OPTIONS')
  })
})

describe('isAllowedCorsOrigin', () => {
  it('GivenAllowedOrigin_WhenChecking_ThenReturnsTrue', () => {
    expect(
      isAllowedCorsOrigin('http://localhost:3001', ['http://localhost:3001'])
    ).toBe(true)
  })

  it('GivenUnknownOrigin_WhenChecking_ThenReturnsFalse', () => {
    expect(
      isAllowedCorsOrigin('https://evil.example', ['http://localhost:3001'])
    ).toBe(false)
  })
})

describe('zitadelJwksUrl', () => {
  it('GivenIssuerWithTrailingSlash_WhenBuilding_ThenNormalizes', () => {
    expect(zitadelJwksUrl('https://zitadel.avcd.ai/')).toBe(
      'https://zitadel.avcd.ai/oauth/v2/keys'
    )
  })
})

describe('JWT_CLOCK_TOLERANCE_SECONDS', () => {
  it('GivenConstant_WhenRead_ThenIsFiveSeconds', () => {
    expect(JWT_CLOCK_TOLERANCE_SECONDS).toBe(5)
  })
})

describe('logAuthSettingsOnStartup', () => {
  it('GivenZitadelSettings_WhenLogging_ThenDoesNotThrow', () => {
    const settings = loadAuthSettings()
    expect(() => logAuthSettingsOnStartup(settings)).not.toThrow()
  })
})
