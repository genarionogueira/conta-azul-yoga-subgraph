import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_DEV_TENANT_ID,
  extractTenantId,
  requireTenant,
  resolveTenantId,
  TenantRequiredError,
  WORKER_CONTEXT_TENANT_ID,
  ZITADEL_ORG_CLAIM,
  ZITADEL_RESOURCE_OWNER_CLAIM,
} from '../../src/lib/auth/tenant-context.js'
import { WORKER_JWT_SUBJECT } from '../../src/lib/auth/worker-auth.js'
import { createTestContext, TEST_TENANT_ID } from '../helpers/test-context.js'

describe('tenant-context', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.TENANT_ID_CLAIM
    delete process.env.ALLOW_SUB_AS_TENANT
    delete process.env.DEFAULT_DEV_TENANT_ID
    delete process.env.JWT_REQUIRED
  })

  afterEach(() => {
    process.env = env
  })

  it('GivenZitadelOrgClaim_WhenExtractingTenant_ThenReturnsOrgId', () => {
    expect(
      extractTenantId({
        [ZITADEL_ORG_CLAIM]: 'org-123',
      })
    ).toBe('org-123')
  })

  it('GivenZitadelResourceOwnerClaim_WhenExtractingTenant_ThenReturnsResourceOwnerId', () => {
    expect(
      extractTenantId({
        [ZITADEL_RESOURCE_OWNER_CLAIM]: 'org-456',
      })
    ).toBe('org-456')
  })

  it('GivenOrgAndResourceOwnerClaims_WhenExtractingTenant_ThenPrefersOrgClaim', () => {
    expect(
      extractTenantId({
        [ZITADEL_ORG_CLAIM]: 'requested-org',
        [ZITADEL_RESOURCE_OWNER_CLAIM]: 'home-org',
      })
    ).toBe('requested-org')
  })

  it('GivenCustomTenantClaim_WhenExtractingTenant_ThenReturnsClaimValue', () => {
    process.env.TENANT_ID_CLAIM = 'tenant_id'
    expect(extractTenantId({ tenant_id: 'custom-tenant' })).toBe('custom-tenant')
  })

  it('GivenSubWithAllowSubAsTenant_WhenExtractingTenant_ThenReturnsSub', () => {
    process.env.ALLOW_SUB_AS_TENANT = 'true'
    expect(extractTenantId({ sub: 'user-abc' })).toBe('user-abc')
  })

  it('GivenNoJwtRequired_WhenResolvingTenantWithoutClaims_ThenUsesDevTenant', () => {
    process.env.JWT_REQUIRED = 'false'
    expect(resolveTenantId(undefined, false)).toBe(DEFAULT_DEV_TENANT_ID)
  })

  it('GivenJwtRequiredAndNoClaims_WhenResolvingTenant_ThenThrows', () => {
    expect(() => resolveTenantId(undefined, true)).toThrow(TenantRequiredError)
  })

  it('GivenWorkerSub_WhenResolvingTenantWithJwtRequired_ThenReturnsWorkerPlaceholder', () => {
    expect(resolveTenantId({ sub: WORKER_JWT_SUBJECT }, true)).toBe(WORKER_CONTEXT_TENANT_ID)
  })

  it('GivenWorkerSub_WhenResolvingTenant_ThenDoesNotThrow', () => {
    expect(() => resolveTenantId({ sub: WORKER_JWT_SUBJECT }, true)).not.toThrow()
  })

  it('GivenWorkerSubAndZitadelOrgClaim_WhenResolvingTenant_ThenReturnsWorkerPlaceholder', () => {
    expect(
      resolveTenantId(
        {
          sub: WORKER_JWT_SUBJECT,
          [ZITADEL_ORG_CLAIM]: 'org-123',
        },
        true
      )
    ).toBe(WORKER_CONTEXT_TENANT_ID)
  })

  it('GivenZitadelOrgClaim_WhenResolvingTenant_ThenStillReturnsOrgId', () => {
    expect(
      resolveTenantId({
        [ZITADEL_ORG_CLAIM]: 'org-123',
      }, true)
    ).toBe('org-123')
  })

  it('GivenContextWithTenantId_WhenRequireTenant_ThenReturnsTenantId', () => {
    expect(requireTenant(createTestContext())).toBe(TEST_TENANT_ID)
  })

  it('GivenMissingTenantInContext_WhenRequireTenant_ThenThrows', () => {
    expect(() => requireTenant(undefined)).toThrow(TenantRequiredError)
  })
})
