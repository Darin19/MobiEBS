import { describe, expect, it } from 'vitest'
import {
  canManageScope,
  canMutateAsset,
  canViewAsset,
  findScopeConflicts,
} from './scope-permissions'
import type { ScopeAsset, ScopeAssignment, ScopeRecord, UserOrganizationRoleRecord } from './scope-permissions'

const asOf = '2026-09-11'

const taxAsset: ScopeAsset = {
  id: 'asset-tax',
  owningOrganizationId: 'org-tax',
  domainId: 'domain-tax',
  status: 'Active',
}

const customsAsset: ScopeAsset = {
  id: 'asset-customs',
  owningOrganizationId: 'org-customs',
  domainId: 'domain-customs',
  status: 'Active',
}

const taxScope: ScopeRecord = {
  id: 'scope-tax',
  organizationId: 'org-tax',
  scopeType: 'Domain',
  domainId: 'domain-tax',
  status: 'Active',
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
}

const activeStewardAssignment: ScopeAssignment = {
  id: 'assignment-tax',
  scopeId: 'scope-tax',
  assignmentRole: 'DataSteward',
  userId: 'steward-tax',
  isPrimary: true,
  status: 'Active',
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
}

const taxStewardRole: UserOrganizationRoleRecord = {
  userId: 'steward-tax',
  organizationId: 'org-tax',
  role: 'DataSteward',
  status: 'Active',
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
}

describe('scope permission chain', () => {
  it('allows a steward to see only an asset resolved by their active organization-role-scope chain', () => {
    const access = {
      userId: 'steward-tax',
      userOrganizationRoles: [taxStewardRole],
      scopes: [taxScope],
      assignments: [activeStewardAssignment],
      asOf,
    }

    expect(canViewAsset({ ...access, asset: taxAsset })).toBe(true)
    expect(canViewAsset({ ...access, asset: customsAsset })).toBe(false)
  })

  it('blocks metadata, DQ, and policy mutations when the matched scope is paused or expired', () => {
    const baseAccess = {
      userId: 'steward-tax',
      asset: taxAsset,
      userOrganizationRoles: [taxStewardRole],
      assignments: [activeStewardAssignment],
      asOf,
    }

    expect(canMutateAsset({ ...baseAccess, scopes: [{ ...taxScope, status: 'Paused' }] })).toBe(false)
    expect(canMutateAsset({ ...baseAccess, scopes: [{ ...taxScope, validTo: '2026-09-10' }] })).toBe(false)
  })

  it('lets only an active integration admin manage scopes', () => {
    expect(canManageScope({
      userId: 'admin',
      userOrganizationRoles: [{ userId: 'admin', organizationId: 'org-tax', role: 'IntegrationAdmin', status: 'Active', validFrom: '2026-01-01' }],
      asOf,
    })).toBe(true)

    expect(canManageScope({ userId: 'steward-tax', userOrganizationRoles: [taxStewardRole], asOf })).toBe(false)
  })

  it('flags overlapping active primary steward assignments before they can give two stewards the same asset', () => {
    const conflicts = findScopeConflicts({
      assets: [taxAsset],
      scopes: [taxScope],
      assignments: [
        activeStewardAssignment,
        { ...activeStewardAssignment, id: 'assignment-tax-2', userId: 'steward-backup' },
      ],
      asOf,
    })

    expect(conflicts).toEqual([
      expect.objectContaining({
        type: 'PRIMARY_STEWARD_OVERLAP',
        assetId: 'asset-tax',
        assignmentIds: ['assignment-tax', 'assignment-tax-2'],
      }),
    ])
  })
})
