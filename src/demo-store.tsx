import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { seedDemoState } from './seed'
import { canManageScope as hasScopeAdminAccess, canMutateAsset as hasAssetMutationAccess, canViewAsset as hasAssetViewAccess, isScopeActive } from './scope-permissions'
import { supabase, supabaseConfigured } from './supabase'
import type { Approval, AuditLog, BaseEntity, Connector, DemoState, EntityCollection, Pipeline, Role, RuntimeEvent, RuntimeRun, ScopeChangeRequest, ScopeChangeRequestStatus, StewardshipAssignment } from './types'

type Toast = { id: string; tone: 'success' | 'error' | 'info'; title: string; detail?: string }
type UpsertAction = { type: 'upsert'; collection: EntityCollection; entity: BaseEntity }
type RemoveAction = { type: 'remove'; collection: EntityCollection; id: string }
type ResetAction = { type: 'reset'; state: DemoState }
type Action = UpsertAction | RemoveAction | ResetAction

const STORAGE_KEY = 'mobiesb-demo-state-v2'

const tableNames: Record<EntityCollection, string> = {
  organizations: 'organizations', dataDomains: 'data_domains', systems: 'systems', systemEnvironments: 'system_environments', connectors: 'connectors', connectorTests: 'connector_tests', dataAssets: 'data_assets', governanceScopes: 'governance_scopes', stewardshipAssignments: 'stewardship_assignments', scopeChangeRequests: 'scope_change_requests', userOrganizationRoles: 'user_organization_roles', governanceNotifications: 'governance_notifications', assetFields: 'asset_fields', schemaSnapshots: 'schema_snapshots', pipelines: 'pipelines', pipelineMappings: 'pipeline_mappings', dqRules: 'dq_rules', dqRuns: 'dq_runs', policies: 'policies', policyFields: 'policy_fields', approvals: 'approvals', dataProducts: 'data_products', productVersions: 'product_versions', channels: 'channels', consumers: 'consumers', grants: 'grants', runtimeRuns: 'runtime_runs', runtimeEvents: 'runtime_events', alerts: 'alerts', auditLogs: 'audit_logs',
}

const rolePermissions: Record<Role, string[]> = {
  'Admin tích hợp': ['organizations', 'dataDomains', 'systems', 'systemEnvironments', 'connectors', 'dataAssets', 'governanceScopes', 'stewardshipAssignments', 'scopeChangeRequests', 'userOrganizationRoles', 'governanceNotifications', 'pipelines', 'channels', 'consumers', 'grants', 'runtimeRuns'],
  'Data Steward': ['assetFields', 'policies', 'dqRules', 'dqRuns', 'dataProducts', 'productVersions', 'channels', 'grants', 'scopeChangeRequests', 'governanceNotifications'],
  'Data Owner / Reviewer': ['approvals', 'policies', 'dataProducts', 'grants'],
  Ops: ['runtimeRuns', 'runtimeEvents', 'alerts', 'connectors'],
  Auditor: [],
}

const demoActors: Record<Role, { id: string; name: string }> = {
  'Admin tích hợp': { id: '00000000-0000-4000-8000-000000000001', name: 'Nguyễn Minh Anh' },
  'Data Steward': { id: '00000000-0000-4000-8000-000000000007', name: 'Phạm Quốc Minh' },
  'Data Owner / Reviewer': { id: '00000000-0000-4000-8000-000000000002', name: 'Nguyễn Văn A' },
  Ops: { id: '00000000-0000-4000-8000-000000000010', name: 'Ngọc Trần' },
  Auditor: { id: '00000000-0000-4000-8000-000000000011', name: 'Lê Thanh Bình' },
}

const userDirectory: Record<string, string> = {
  '00000000-0000-4000-8000-000000000001': 'Nguyễn Minh Anh',
  '00000000-0000-4000-8000-000000000002': 'Nguyễn Văn A',
  '00000000-0000-4000-8000-000000000003': 'Nguyễn Minh Anh',
  '00000000-0000-4000-8000-000000000004': 'Nguyễn Văn A',
  '00000000-0000-4000-8000-000000000005': 'Lê Thu Hà',
  '00000000-0000-4000-8000-000000000006': 'Nguyễn Văn A',
  '00000000-0000-4000-8000-000000000007': 'Phạm Quốc Minh',
  '00000000-0000-4000-8000-000000000008': 'Nguyễn Văn A',
  '00000000-0000-4000-8000-000000000009': 'Đỗ Việt Long',
  '00000000-0000-4000-8000-000000000010': 'Ngọc Trần',
  '00000000-0000-4000-8000-000000000011': 'Lê Thanh Bình',
}

const loadState = (): DemoState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return seedDemoState()
    const parsed = JSON.parse(saved) as Partial<DemoState>
    return Array.isArray(parsed.governanceScopes)
      && Array.isArray(parsed.stewardshipAssignments)
      && Array.isArray(parsed.userOrganizationRoles)
      ? parsed as DemoState
      : seedDemoState()
  } catch {
    return seedDemoState()
  }
}

const reducer = (state: DemoState, action: Action): DemoState => {
  if (action.type === 'reset') return action.state
  const current = state[action.collection] as BaseEntity[]
  if (action.type === 'remove') {
    return { ...state, [action.collection]: current.filter((item) => item.id !== action.id) } as DemoState
  }
  const exists = current.some((item) => item.id === action.entity.id)
  return {
    ...state,
    [action.collection]: exists ? current.map((item) => item.id === action.entity.id ? action.entity : item) : [action.entity, ...current],
  } as DemoState
}

const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const camelToSnake = (value: string) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
const snakeToCamel = (value: string) => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
const serialize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [camelToSnake(key), serialize(item)]))
  return value
}
const deserialize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(deserialize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [snakeToCamel(key), deserialize(item)]))
  return value
}

type DemoContextValue = {
  state: DemoState
  role: Role
  setRole: (role: Role) => void
  currentUserId: string
  currentUserName: string
  getUserName: (userId?: string) => string
  toasts: Toast[]
  dismissToast: (toastId: string) => void
  notify: (tone: Toast['tone'], title: string, detail?: string) => void
  canMutate: (collection: EntityCollection) => boolean
  canManageScope: () => boolean
  canViewAsset: (assetId: string) => boolean
  canMutateAsset: (assetId: string) => boolean
  create: <T extends BaseEntity = BaseEntity>(collection: EntityCollection, partial: Record<string, any>, label?: string) => Promise<T>
  update: <T extends BaseEntity>(collection: EntityCollection, entity: T, patch: Partial<T>, label?: string) => Promise<T>
  remove: (collection: EntityCollection, entity: BaseEntity, label?: string) => Promise<void>
  resetDemo: () => void
  testConnector: (connector: Connector) => Promise<void>
  runPipeline: (pipeline: Pipeline, parentRunId?: string) => Promise<RuntimeRun>
  runDq: (assetId: string) => Promise<void>
  submitApproval: (approval: Omit<Approval, keyof BaseEntity>) => Promise<void>
  decideApproval: (approval: Approval, decision: 'Approved' | 'Rejected' | 'Changes Requested', comment?: string) => Promise<void>
  acceptStewardship: (assignment: StewardshipAssignment, accepted: boolean, reason?: string) => Promise<void>
  submitScopeChangeRequest: (request: Omit<ScopeChangeRequest, keyof BaseEntity | 'requestedBy' | 'status'>) => Promise<void>
  reviewScopeChangeRequest: (request: ScopeChangeRequest, decision: Exclude<ScopeChangeRequestStatus, 'Draft' | 'Pending Approval' | 'Cancelled'>, comment?: string) => Promise<void>
  simulateConsumerRequest: (dataProductId: string, consumerName: string) => Promise<void>
  supabaseConfigured: boolean
  supabaseStatus: 'local' | 'connecting' | 'connected' | 'auth_required' | 'degraded'
}

const DemoContext = createContext<DemoContextValue | null>(null)

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  const [role, setRole] = useState<Role>('Admin tích hợp')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [authUser, setAuthUser] = useState<{ id: string; email?: string }>()
  const currentUser = useMemo(() => authUser ? { id: authUser.id, name: authUser.email ?? `Supabase user ${authUser.id.slice(0, 8)}` } : demoActors[role], [authUser, role])

  const getUserName = useCallback((userId?: string) => {
    if (!userId) return 'Chưa gán'
    return userDirectory[userId] ?? `Người dùng ${userId.slice(0, 8)}`
  }, [])

  const canManageScope = useCallback(() => hasScopeAdminAccess({
    userId: currentUser.id,
    userOrganizationRoles: state.userOrganizationRoles,
  }), [currentUser.id, state.userOrganizationRoles])

  const canViewAsset = useCallback((assetId: string) => {
    const asset = state.dataAssets.find((item) => item.id === assetId)
    return Boolean(asset && hasAssetViewAccess({
      userId: currentUser.id,
      asset,
      userOrganizationRoles: state.userOrganizationRoles,
      scopes: state.governanceScopes,
      assignments: state.stewardshipAssignments,
    }))
  }, [currentUser.id, state.dataAssets, state.governanceScopes, state.stewardshipAssignments, state.userOrganizationRoles])

  const canMutateAsset = useCallback((assetId: string) => {
    const asset = state.dataAssets.find((item) => item.id === assetId)
    return Boolean(asset && hasAssetMutationAccess({
      userId: currentUser.id,
      asset,
      userOrganizationRoles: state.userOrganizationRoles,
      scopes: state.governanceScopes,
      assignments: state.stewardshipAssignments,
    }))
  }, [currentUser.id, state.dataAssets, state.governanceScopes, state.stewardshipAssignments, state.userOrganizationRoles])

  const supabaseProbe = useQuery({
    queryKey: ['mobiesb', 'supabase-probe'],
    enabled: Boolean(supabase),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!supabase) return []
      const response = await supabase.from('organizations').select('id').limit(1)
      if (response.error) throw response.error
      return response.data
    },
  })
  const [supabaseStatus, setSupabaseStatus] = useState<'local' | 'connecting' | 'connected' | 'auth_required' | 'degraded'>(supabaseConfigured ? 'connecting' : 'local')

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const user = data.session?.user
      setAuthUser(user ? { id: user.id, email: user.email } : undefined)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      setAuthUser(user ? { id: user.id, email: user.email } : undefined)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }, [state])

  const dismissToast = useCallback((toastId: string) => setToasts((items) => items.filter((item) => item.id !== toastId)), [])
  const notify = useCallback((tone: Toast['tone'], title: string, detail?: string) => {
    const toast = { id: id(), tone, title, detail }
    setToasts((items) => [...items, toast])
    window.setTimeout(() => dismissToast(toast.id), 4600)
  }, [dismissToast])

  useEffect(() => {
    if (!supabase || !supabaseProbe.isError) return
    setSupabaseStatus('degraded')
  }, [supabaseProbe.isError])

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    const hydrate = async () => {
      try {
      const entries = Object.entries(tableNames) as Array<[EntityCollection, string]>
      const root = await client.from('organizations').select('*')
      if (!active) return
      if (root.error) {
        setSupabaseStatus('degraded')
        notify('info', 'Đang dùng dữ liệu demo cục bộ', 'Supabase chưa có schema/seed hoặc Data API chưa expose bảng. Chạy migration và seed rồi refresh.')
        return
      }
      if (!(root.data?.length ?? 0)) {
        setSupabaseStatus('connected')
        notify('info', 'Supabase chưa có seed data', 'Ứng dụng giữ dữ liệu demo cục bộ cho đến khi bạn chạy supabase/seed.sql.')
        return
      }
      const result = await Promise.all(entries.map(async ([collection, table]) => {
        const response = collection === 'organizations' ? root : await client.from(table).select('*')
        return { collection, response }
      }))
      if (!active) return
      const failures = result.filter(({ response }) => response.error)
      if (failures.length) {
        const scopeError = failures.some(({ response }) => response.error?.code === '42501' || response.error?.message.includes('permission denied'))
        setSupabaseStatus(scopeError ? 'auth_required' : 'degraded')
        notify('info', 'Đang dùng dữ liệu demo cục bộ', scopeError ? 'Supabase yêu cầu phiên Auth đã được gán Organization Role và Governance Scope.' : 'Không thể đọc đầy đủ dữ liệu Supabase. Kiểm tra schema, Data API và kết nối.')
        return
      }
      const total = result.reduce((sum, item) => sum + (item.response.data?.length ?? 0), 0)
      const remote = Object.fromEntries(result.map(({ collection, response }) => [collection, (response.data ?? []).map(deserialize)])) as unknown as DemoState
      dispatch({ type: 'reset', state: remote })
      setSupabaseStatus('connected')
      notify('success', 'Đã nạp dữ liệu từ Supabase', `${total} bản ghi được đồng bộ vào demo.`)
      } catch (error) {
        if (!active) return
        const scopeError = error instanceof Error && error.message.includes('permission denied')
        setSupabaseStatus(scopeError ? 'auth_required' : 'degraded')
        notify('info', 'Đang dùng dữ liệu demo cục bộ', scopeError ? 'Supabase yêu cầu phiên Auth đã được gán Scope.' : 'Không thể kết nối Data API. Kiểm tra kết nối và cấu hình Supabase.')
      }
    }
    void hydrate()
    return () => { active = false }
  }, [authUser?.id, notify])

  const sync = useCallback(async (collection: EntityCollection, entity: BaseEntity, operation: 'upsert' | 'delete') => {
    if (!supabase) return
    const table = tableNames[collection]
    const result = operation === 'delete'
      ? await supabase.from(table).delete().eq('id', entity.id)
      : await supabase.from(table).upsert(serialize(entity) as Record<string, unknown>)
    if (result.error) {
      setSupabaseStatus('degraded')
      throw result.error
    }
    setSupabaseStatus('connected')
  }, [])

  const assetIdForMutation = useCallback((collection: EntityCollection, entity: Record<string, unknown>) => {
    if (collection === 'dataAssets') return String(entity.id ?? '') || undefined
    if (collection === 'assetFields' || collection === 'dqRules' || collection === 'dqRuns' || collection === 'policies' || collection === 'dataProducts') return typeof entity.assetId === 'string' ? entity.assetId : undefined
    if (collection === 'policyFields') {
      const policy = state.policies.find((item) => item.id === entity.policyId)
      return policy?.assetId
    }
    return undefined
  }, [state.policies])

  const assertMutationAllowed = useCallback((collection: EntityCollection, entity: Record<string, unknown>, operation: 'create' | 'update' | 'remove') => {
    if (collection === 'auditLogs' || collection === 'governanceNotifications') return

    if (collection === 'governanceScopes' || collection === 'userOrganizationRoles') {
      if (!canManageScope()) throw new Error('Chỉ Admin tích hợp được phép thay đổi cấu trúc Governance Scope.')
      return
    }

    if (collection === 'stewardshipAssignments') {
      const isOwnAcceptance = entity.userId === currentUser.id
        && ['Active', 'Accepted', 'Rejected'].includes(String(entity.status))
      if (!canManageScope() && !(operation === 'update' && isOwnAcceptance)) throw new Error('Chỉ Admin tích hợp có thể gán hoặc chuyển Stewardship.')
      return
    }

    if (collection === 'scopeChangeRequests') {
      const scope = state.governanceScopes.find((item) => item.id === entity.scopeId)
      const ownsActiveScope = Boolean(scope && state.stewardshipAssignments.some((assignment) => assignment.scopeId === scope.id && assignment.userId === currentUser.id && assignment.status === 'Active' && isScopeActive(scope)))
      const isOwnRequest = entity.requestedBy === currentUser.id && ['Draft', 'Pending Approval', 'Cancelled'].includes(String(entity.status))
      if (!canManageScope() && !(ownsActiveScope && (operation === 'create' || isOwnRequest))) throw new Error('Bạn chỉ có thể tạo hoặc cập nhật request cho scope Active của mình.')
      return
    }

    const assetId = assetIdForMutation(collection, entity)
    if (assetId) {
      const existingAsset = state.dataAssets.find((asset) => asset.id === assetId)
      if (!existingAsset && collection === 'dataAssets' && canManageScope()) return
      if (!canMutateAsset(assetId)) throw new Error('Bạn không có quyền thay đổi dữ liệu governance của Asset ngoài scope Active.')
      const changesAssetStructure = collection === 'dataAssets' && existingAsset !== undefined && (
        existingAsset.owningOrganizationId !== entity.owningOrganizationId
        || existingAsset.custodianOrganizationId !== entity.custodianOrganizationId
        || existingAsset.domainId !== entity.domainId
      )
      if (changesAssetStructure && !canManageScope()) {
        throw new Error('Chỉ Admin tích hợp có thể đổi Organization hoặc Data Domain của Asset.')
      }
      return
    }

    if (!rolePermissions[role].includes(collection) && !canManageScope()) throw new Error('Vai trò hiện tại không có quyền thay đổi dữ liệu này.')
  }, [assetIdForMutation, canManageScope, canMutateAsset, currentUser.id, role, state.dataAssets, state.governanceScopes, state.stewardshipAssignments])

  const audit = useCallback(async (action: string, entityType: string, entityId: string, before?: Record<string, unknown>, after?: Record<string, unknown>) => {
    const organizationId = String(after?.organizationId ?? after?.owningOrganizationId ?? before?.organizationId ?? before?.owningOrganizationId ?? '') || undefined
    const entry: AuditLog = { id: id(), createdAt: now(), updatedAt: now(), actor: currentUser.name, actorUserId: currentUser.id, role, organizationId, action, entityType, entityId, before, after }
    dispatch({ type: 'upsert', collection: 'auditLogs', entity: entry })
    try { await sync('auditLogs', entry, 'upsert') } catch { /* The primary mutation remains usable in local mode. */ }
  }, [currentUser, role, sync])

  const create = useCallback(async <T extends BaseEntity = BaseEntity>(collection: EntityCollection, partial: Record<string, any>, label = 'Tạo bản ghi') => {
    const entity = { ...partial, id: partial.id ?? id(), createdAt: partial.createdAt ?? now(), updatedAt: now() } as T
    assertMutationAllowed(collection, entity as unknown as Record<string, unknown>, 'create')
    dispatch({ type: 'upsert', collection, entity })
    try { await sync(collection, entity, 'upsert'); notify('success', `${label} thành công`, supabaseConfigured ? 'Đã đồng bộ Supabase.' : 'Đang lưu trong demo cục bộ.') } catch (error) { notify('error', `${label} đã lưu cục bộ`, error instanceof Error ? error.message : 'Không thể đồng bộ Supabase.') }
    if (collection !== 'auditLogs') void audit(label, collection, entity.id, undefined, entity as unknown as Record<string, unknown>)
    return entity
  }, [assertMutationAllowed, audit, notify, sync])

  const update = useCallback(async <T extends BaseEntity>(collection: EntityCollection, entity: T, patch: Partial<T>, label = 'Cập nhật bản ghi') => {
    const next = { ...entity, ...patch, updatedAt: now() } as T
    assertMutationAllowed(collection, next as unknown as Record<string, unknown>, 'update')
    dispatch({ type: 'upsert', collection, entity: next })
    try { await sync(collection, next, 'upsert'); notify('success', `${label} thành công`, supabaseConfigured ? 'Đã đồng bộ Supabase.' : 'Đang lưu trong demo cục bộ.') } catch (error) { notify('error', `${label} đã lưu cục bộ`, error instanceof Error ? error.message : 'Không thể đồng bộ Supabase.') }
    if (collection !== 'auditLogs') void audit(label, collection, entity.id, entity as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>)
    return next
  }, [assertMutationAllowed, audit, notify, sync])

  const remove = useCallback(async (collection: EntityCollection, entity: BaseEntity, label = 'Xóa bản ghi') => {
    assertMutationAllowed(collection, entity as unknown as Record<string, unknown>, 'remove')
    dispatch({ type: 'remove', collection, id: entity.id })
    try { await sync(collection, entity, 'delete'); notify('success', `${label} thành công`, supabaseConfigured ? 'Đã đồng bộ Supabase.' : 'Đang lưu trong demo cục bộ.') } catch (error) { notify('error', `${label} đã xóa cục bộ`, error instanceof Error ? error.message : 'Không thể đồng bộ Supabase.') }
    if (collection !== 'auditLogs') void audit(label, collection, entity.id, entity as unknown as Record<string, unknown>)
  }, [assertMutationAllowed, audit, notify, sync])

  const testConnector = useCallback(async (connector: Connector) => {
    const successful = Math.random() < 0.87
    const latencyMs = Math.floor(45 + Math.random() * 620)
    const checkedAt = now()
    await create('connectorTests', { connectorId: connector.id, result: successful ? 'Success' : 'Failed', latencyMs, checkedAt, responseSample: successful ? '{"status":"ok","mock":true}' : '{"status":"timeout","mock":true}' }, 'Test kết nối')
    await update('connectors', connector, { healthStatus: successful ? (latencyMs > 500 ? 'Warning' : 'Healthy') : 'Failed', lastLatencyMs: latencyMs, lastCheckedAt: checkedAt }, 'Cập nhật health connector')
  }, [create, update])

  const runPipeline = useCallback(async (pipeline: Pipeline, parentRunId?: string) => {
    const correlationId = `CORR-${pipeline.code}-${Date.now().toString().slice(-6)}`
    const run = await create<RuntimeRun>('runtimeRuns', { pipelineId: pipeline.id, type: 'Pipeline', name: `${pipeline.code} · ${pipeline.name}`, correlationId, source: state.dataAssets.find((asset) => asset.id === pipeline.sourceAssetId)?.code ?? 'Source', target: state.dataAssets.find((asset) => asset.id === pipeline.targetAssetId)?.code ?? 'Target', status: 'Processing', startedAt: now(), recordsRead: 0, recordsWritten: 0, recordsRejected: 0, parentRunId }, parentRunId ? 'Reprocess pipeline' : 'Chạy pipeline')
    const steps = ['Receive', 'Map', 'Validate', 'Load', 'Reconcile']
    const events = await Promise.all(steps.map((step, index) => create<RuntimeEvent>('runtimeEvents', { runtimeRunId: run.id, step, status: index === 0 ? 'Processing' : 'Draft', startedAt: now(), message: index === 0 ? 'Đang khởi tạo runtime simulation.' : 'Đang chờ bước trước.', recordCount: 0 }, `Khởi tạo bước ${step}`)))
    window.setTimeout(() => {
      const successful = Math.random() < 0.84
      const recordCount = 180 + Math.floor(Math.random() * 980)
      void update('runtimeRuns', run, { status: successful ? 'Success' : 'Failed', endedAt: now(), latencyMs: 1300 + Math.floor(Math.random() * 900), recordsRead: recordCount, recordsWritten: successful ? recordCount : Math.floor(recordCount * 0.46), recordsRejected: successful ? 0 : Math.max(1, Math.floor(recordCount * 0.08)) }, successful ? 'Hoàn tất pipeline' : 'Pipeline dừng lỗi')
      events.forEach((event, index) => void update('runtimeEvents', event, { status: successful || index < 3 ? 'Success' : 'Failed', endedAt: now(), recordCount: index === 4 ? recordCount : 0, message: successful ? `${event.step} hoàn tất bằng dữ liệu mô phỏng.` : index === 3 ? 'Runtime simulation tạo lỗi có kiểm soát.' : `${event.step} hoàn tất.` }, `Cập nhật bước ${event.step}`))
    }, 1450)
    return run
  }, [create, state.dataAssets, update])

  const runDq = useCallback(async (assetId: string) => {
    const asset = state.dataAssets.find((item) => item.id === assetId)
    if (!asset) return
    const score = Math.min(100, Math.max(74, asset.dqScore + Math.floor(Math.random() * 7) - 3))
    await create('dqRuns', { assetId, score, dimensionScores: { Completeness: Math.min(100, score + 2), Validity: score, Uniqueness: Math.max(70, score - 1), Consistency: Math.max(70, score - 2) }, violations: Math.max(0, 100 - score), runAt: now() }, 'Chạy DQ profile')
    await update('dataAssets', asset, { dqScore: score }, 'Cập nhật DQ score')
  }, [create, state.dataAssets, update])

  const submitApproval = useCallback(async (approval: Omit<Approval, keyof BaseEntity>) => { await create('approvals', approval, 'Gửi phê duyệt') }, [create])
  const decideApproval = useCallback(async (approval: Approval, decision: 'Approved' | 'Rejected' | 'Changes Requested', comment?: string) => {
    await update('approvals', approval, { status: decision, reviewer: 'Nguyễn Minh Anh', comment }, decision === 'Approved' ? 'Phê duyệt yêu cầu' : 'Cập nhật yêu cầu')
    if (approval.entityType === 'Policy') {
      const policy = state.policies.find((item) => item.id === approval.entityId)
      if (policy) await update('policies', policy, { status: decision === 'Approved' ? 'Approved' : decision === 'Rejected' ? 'Revoked' : 'Draft' }, decision === 'Approved' ? 'Kích hoạt policy' : 'Cập nhật policy')
    }
  }, [state.policies, update])

  const acceptStewardship = useCallback(async (assignment: StewardshipAssignment, accepted: boolean, reason?: string) => {
    if (assignment.userId !== currentUser.id) {
      notify('error', 'Không thể xác nhận assignment', 'Chỉ Data Steward được chỉ định mới có thể nhận hoặc từ chối stewardship.')
      return
    }
    const status = accepted ? 'Active' : 'Rejected'
    await update('stewardshipAssignments', assignment, { status, acceptedAt: accepted ? now() : undefined, reason: reason ?? assignment.reason }, accepted ? 'Xác nhận nhận stewardship' : 'Từ chối stewardship')
    const scope = state.governanceScopes.find((item) => item.id === assignment.scopeId)
    await create('governanceNotifications', {
      userId: assignment.assignedBy,
      organizationId: scope?.organizationId,
      type: 'REQUEST_DECIDED',
      title: accepted ? 'Steward đã nhận phạm vi' : 'Steward từ chối phạm vi',
      detail: `${currentUser.name} ${accepted ? 'đã xác nhận' : 'đã từ chối'} stewardship.`,
      entityType: 'StewardshipAssignment',
      entityId: assignment.id,
    }, 'Gửi thông báo stewardship')
  }, [create, currentUser, notify, state.governanceScopes, update])

  const submitScopeChangeRequest = useCallback(async (request: Omit<ScopeChangeRequest, keyof BaseEntity | 'requestedBy' | 'status'>) => {
    const scope = request.scopeId ? state.governanceScopes.find((item) => item.id === request.scopeId) : undefined
    const ownsScope = Boolean(scope && state.stewardshipAssignments.some((assignment) => assignment.scopeId === scope.id && assignment.userId === currentUser.id && assignment.status === 'Active' && isScopeActive(scope)))
    if (!canManageScope() && !ownsScope) {
      notify('error', 'Không thể gửi yêu cầu', 'Bạn chỉ có thể đề xuất thay đổi cho scope Active của mình.')
      return
    }
    await create('scopeChangeRequests', { ...request, requestedBy: currentUser.id, status: 'Pending Approval' }, 'Gửi yêu cầu thay đổi scope')
  }, [canManageScope, create, currentUser.id, notify, state.governanceScopes, state.stewardshipAssignments])

  const reviewScopeChangeRequest = useCallback(async (request: ScopeChangeRequest, decision: Exclude<ScopeChangeRequestStatus, 'Draft' | 'Pending Approval' | 'Cancelled'>, comment?: string) => {
    if (!canManageScope()) {
      notify('error', 'Không có quyền duyệt', 'Chỉ Admin tích hợp có thể duyệt Scope Change Request.')
      return
    }
    await update('scopeChangeRequests', request, { status: decision, reviewerId: currentUser.id, reviewerComment: comment, reviewedAt: now() }, decision === 'Approved' ? 'Phê duyệt Scope Change Request' : 'Cập nhật Scope Change Request')
    if (decision !== 'Approved' || !request.scopeId) return

    const scope = state.governanceScopes.find((item) => item.id === request.scopeId)
    if (!scope) return
    if (request.requestType === 'PAUSE_SCOPE') await update('governanceScopes', scope, { status: 'Paused' }, 'Tạm dừng scope')
    if (request.requestType === 'REACTIVATE_SCOPE') await update('governanceScopes', scope, { status: 'Active' }, 'Kích hoạt lại scope')
    if (request.requestType === 'REMOVE_ASSET' && scope.scopeType === 'Asset') await update('governanceScopes', scope, { status: 'Revoked' }, 'Thu hồi asset khỏi scope')

    if (request.requestType === 'TRANSFER_STEWARD' && request.targetUserId) {
      const currentPrimary = state.stewardshipAssignments.find((assignment) => assignment.scopeId === scope.id && assignment.assignmentRole === 'DataSteward' && assignment.isPrimary && assignment.status === 'Active')
      if (currentPrimary) await update('stewardshipAssignments', currentPrimary, { status: 'Ended', validTo: new Date().toISOString().slice(0, 10) }, 'Kết thúc stewardship cũ')
      await create('stewardshipAssignments', {
        scopeId: scope.id,
        assignmentRole: 'DataSteward',
        userId: request.targetUserId,
        assignedBy: currentUser.id,
        assignedAt: now(),
        validFrom: new Date().toISOString().slice(0, 10),
        validTo: scope.validTo,
        status: 'Awaiting Acceptance',
        isPrimary: true,
        reason: request.reason,
      }, 'Chuyển giao stewardship')
    }

    if ((request.requestType === 'ADD_ASSET' || request.requestType === 'EXPAND_DOMAIN') && request.targetAssetId) {
      const asset = state.dataAssets.find((item) => item.id === request.targetAssetId)
      if (asset && !state.governanceScopes.some((item) => item.scopeType === 'Asset' && item.assetId === asset.id && item.status !== 'Revoked')) {
        const newScope = await create('governanceScopes', {
          organizationId: asset.owningOrganizationId,
          scopeType: 'Asset',
          assetId: asset.id,
          status: 'Active',
          validFrom: new Date().toISOString().slice(0, 10),
          validTo: scope.validTo,
          createdBy: currentUser.id,
        }, 'Thêm asset vào scope')
        const currentSteward = state.stewardshipAssignments.find((assignment) => assignment.scopeId === scope.id && assignment.assignmentRole === 'DataSteward' && assignment.status === 'Active')
        if (currentSteward) await create('stewardshipAssignments', { ...currentSteward, id: undefined, scopeId: newScope.id, assignedBy: currentUser.id, assignedAt: now() }, 'Gán Steward cho asset mới')
      }
    }
  }, [canManageScope, create, currentUser.id, notify, state.dataAssets, state.governanceScopes, state.stewardshipAssignments, update])

  const simulateConsumerRequest = useCallback(async (dataProductId: string, consumerName: string) => {
    const product = state.dataProducts.find((item) => item.id === dataProductId)
    if (!product) return
    const run = await create<RuntimeRun>('runtimeRuns', { dataProductId, type: 'API', name: `${product.code} · Sandbox request`, correlationId: `CORR-API-${Date.now().toString().slice(-7)}`, source: consumerName, target: product.code, status: 'Success', startedAt: now(), endedAt: now(), latencyMs: 80 + Math.floor(Math.random() * 180), recordsRead: 1, recordsWritten: 1, recordsRejected: 0 }, 'Mô phỏng consumer request')
    await create('runtimeEvents', { runtimeRunId: run.id, step: 'Policy enforcement', status: 'Success', startedAt: now(), endedAt: now(), message: 'Allowlist, row filter và masking đã được áp dụng.', recordCount: 1 }, 'Ghi event API')
  }, [create, state.dataProducts])

  const value = useMemo<DemoContextValue>(() => ({
    state, role, setRole, currentUserId: currentUser.id, currentUserName: currentUser.name, getUserName, toasts, dismissToast, notify,
    canMutate: (collection) => rolePermissions[role].includes(collection),
    canManageScope, canViewAsset, canMutateAsset,
    create, update, remove, resetDemo: () => { const fresh = seedDemoState(); dispatch({ type: 'reset', state: fresh }); notify('info', 'Đã khôi phục dữ liệu demo', 'Các thay đổi local đã được thay thế bởi seed data.') },
    testConnector, runPipeline, runDq, submitApproval, decideApproval, acceptStewardship, submitScopeChangeRequest, reviewScopeChangeRequest, simulateConsumerRequest, supabaseConfigured, supabaseStatus,
  }), [acceptStewardship, canManageScope, canMutateAsset, canViewAsset, create, currentUser, decideApproval, dismissToast, getUserName, notify, remove, reviewScopeChangeRequest, role, runDq, runPipeline, simulateConsumerRequest, state, submitApproval, submitScopeChangeRequest, supabaseStatus, testConnector, toasts, update])

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export const useDemo = () => {
  const context = useContext(DemoContext)
  if (!context) throw new Error('useDemo must be used within DemoProvider')
  return context
}
