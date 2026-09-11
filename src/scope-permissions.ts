export type ScopeAsset = {
  id: string
  owningOrganizationId: string
  domainId?: string
  status?: string
}

export type ScopeRecord = {
  id: string
  organizationId: string
  scopeType: 'Organization' | 'Domain' | 'Asset'
  domainId?: string
  assetId?: string
  status: string
  validFrom?: string
  validTo?: string
}

export type ScopeAssignment = {
  id: string
  scopeId: string
  assignmentRole: 'DataOwner' | 'DataSteward' | 'DelegateSteward'
  userId: string
  isPrimary?: boolean
  status: string
  validFrom?: string
  validTo?: string
}

export type UserOrganizationRoleRecord = {
  userId: string
  organizationId: string
  role: 'IntegrationAdmin' | 'DataOwner' | 'DataSteward' | 'DelegateSteward' | 'OrganizationViewer'
  status: string
  validFrom?: string
  validTo?: string
}

type AccessContext = {
  userId: string
  userOrganizationRoles: UserOrganizationRoleRecord[]
  asOf?: string
}

type AssetAccessContext = AccessContext & {
  asset: ScopeAsset
  scopes: ScopeRecord[]
  assignments: ScopeAssignment[]
}

export type ScopeConflict = {
  type: 'PRIMARY_STEWARD_OVERLAP'
  assetId: string
  assignmentIds: [string, string]
}

const datePart = (value?: string) => value?.slice(0, 10)

export const isValidOn = (record: { validFrom?: string; validTo?: string }, asOf = new Date().toISOString().slice(0, 10)) => {
  const day = datePart(asOf) ?? asOf
  const validFrom = datePart(record.validFrom)
  const validTo = datePart(record.validTo)
  return (!validFrom || validFrom <= day) && (!validTo || validTo >= day)
}

export const isScopeActive = (scope: ScopeRecord, asOf?: string) => scope.status === 'Active' && isValidOn(scope, asOf)

export const scopeIncludesAsset = (scope: ScopeRecord, asset: ScopeAsset) => {
  if (scope.organizationId !== asset.owningOrganizationId) return false
  if (scope.scopeType === 'Organization') return true
  if (scope.scopeType === 'Domain') return scope.domainId === asset.domainId
  return scope.assetId === asset.id
}

const activeRoleFor = (context: AccessContext, organizationId: string) => context.userOrganizationRoles.some((role) => (
  role.userId === context.userId
  && role.organizationId === organizationId
  && role.status === 'Active'
  && isValidOn(role, context.asOf)
))

export const canManageScope = (context: AccessContext) => context.userOrganizationRoles.some((role) => (
  role.userId === context.userId
  && role.role === 'IntegrationAdmin'
  && role.status === 'Active'
  && isValidOn(role, context.asOf)
))

const matchingAssignments = (context: AssetAccessContext, acceptedRoles: ScopeAssignment['assignmentRole'][]) => context.assignments.filter((assignment) => {
  if (assignment.userId !== context.userId || assignment.status !== 'Active' || !isValidOn(assignment, context.asOf)) return false
  if (!acceptedRoles.includes(assignment.assignmentRole)) return false
  const scope = context.scopes.find((candidate) => candidate.id === assignment.scopeId)
  return Boolean(scope && isScopeActive(scope, context.asOf) && scopeIncludesAsset(scope, context.asset))
})

export const canViewAsset = (context: AssetAccessContext) => {
  if (canManageScope(context)) return true
  if (!activeRoleFor(context, context.asset.owningOrganizationId)) return false
  return matchingAssignments(context, ['DataOwner', 'DataSteward', 'DelegateSteward']).length > 0
}

export const canMutateAsset = (context: AssetAccessContext) => {
  if (canManageScope(context)) return true
  if (!activeRoleFor(context, context.asset.owningOrganizationId)) return false
  return matchingAssignments(context, ['DataSteward', 'DelegateSteward']).length > 0
}

export const findScopeConflicts = ({ assets, scopes, assignments, asOf }: {
  assets: ScopeAsset[]
  scopes: ScopeRecord[]
  assignments: ScopeAssignment[]
  asOf?: string
}): ScopeConflict[] => {
  const activePrimaryStewards = assignments.filter((assignment) => (
    assignment.assignmentRole === 'DataSteward'
    && assignment.isPrimary
    && assignment.status === 'Active'
    && isValidOn(assignment, asOf)
  ))

  const conflicts: ScopeConflict[] = []
  for (const asset of assets) {
    const candidates = activePrimaryStewards.filter((assignment) => {
      const scope = scopes.find((candidate) => candidate.id === assignment.scopeId)
      return Boolean(scope && isScopeActive(scope, asOf) && scopeIncludesAsset(scope, asset))
    })

    for (let left = 0; left < candidates.length; left += 1) {
      for (let right = left + 1; right < candidates.length; right += 1) {
        if (candidates[left].userId === candidates[right].userId) continue
        const assignmentIds = [candidates[left].id, candidates[right].id].sort() as [string, string]
        conflicts.push({ type: 'PRIMARY_STEWARD_OVERLAP', assetId: asset.id, assignmentIds })
      }
    }
  }
  return conflicts
}
