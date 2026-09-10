import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { seedDemoState } from './seed'
import { supabase, supabaseConfigured } from './supabase'
import type { Approval, AuditLog, BaseEntity, Connector, DemoState, EntityCollection, Pipeline, Role, RuntimeEvent, RuntimeRun } from './types'

type Toast = { id: string; tone: 'success' | 'error' | 'info'; title: string; detail?: string }
type UpsertAction = { type: 'upsert'; collection: EntityCollection; entity: BaseEntity }
type RemoveAction = { type: 'remove'; collection: EntityCollection; id: string }
type ResetAction = { type: 'reset'; state: DemoState }
type Action = UpsertAction | RemoveAction | ResetAction

const STORAGE_KEY = 'mobiesb-demo-state-v1'

const tableNames: Record<EntityCollection, string> = {
  organizations: 'organizations', systems: 'systems', systemEnvironments: 'system_environments', connectors: 'connectors', connectorTests: 'connector_tests', dataAssets: 'data_assets', assetFields: 'asset_fields', schemaSnapshots: 'schema_snapshots', pipelines: 'pipelines', pipelineMappings: 'pipeline_mappings', dqRules: 'dq_rules', dqRuns: 'dq_runs', policies: 'policies', policyFields: 'policy_fields', approvals: 'approvals', dataProducts: 'data_products', productVersions: 'product_versions', channels: 'channels', consumers: 'consumers', grants: 'grants', runtimeRuns: 'runtime_runs', runtimeEvents: 'runtime_events', alerts: 'alerts', auditLogs: 'audit_logs',
}

const rolePermissions: Record<Role, string[]> = {
  'Admin tích hợp': ['organizations', 'systems', 'systemEnvironments', 'connectors', 'dataAssets', 'pipelines', 'channels', 'consumers', 'grants', 'runtimeRuns'],
  'Data Steward': ['dataAssets', 'assetFields', 'policies', 'dqRules', 'dqRuns', 'dataProducts', 'productVersions', 'channels', 'grants'],
  'Data Owner / Reviewer': ['approvals', 'policies', 'dataProducts', 'grants'],
  Ops: ['runtimeRuns', 'runtimeEvents', 'alerts', 'connectors'],
  Auditor: [],
}

const loadState = (): DemoState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) as DemoState : seedDemoState()
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
  toasts: Toast[]
  dismissToast: (toastId: string) => void
  notify: (tone: Toast['tone'], title: string, detail?: string) => void
  canMutate: (collection: EntityCollection) => boolean
  create: <T extends BaseEntity = BaseEntity>(collection: EntityCollection, partial: Record<string, any>, label?: string) => Promise<T>
  update: <T extends BaseEntity>(collection: EntityCollection, entity: T, patch: Partial<T>, label?: string) => Promise<T>
  remove: (collection: EntityCollection, entity: BaseEntity, label?: string) => Promise<void>
  resetDemo: () => void
  testConnector: (connector: Connector) => Promise<void>
  runPipeline: (pipeline: Pipeline, parentRunId?: string) => Promise<RuntimeRun>
  runDq: (assetId: string) => Promise<void>
  submitApproval: (approval: Omit<Approval, keyof BaseEntity>) => Promise<void>
  decideApproval: (approval: Approval, decision: 'Approved' | 'Rejected' | 'Changes Requested', comment?: string) => Promise<void>
  simulateConsumerRequest: (dataProductId: string, consumerName: string) => Promise<void>
  supabaseConfigured: boolean
  supabaseStatus: 'local' | 'connecting' | 'connected' | 'degraded'
}

const DemoContext = createContext<DemoContextValue | null>(null)

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  const [role, setRole] = useState<Role>('Admin tích hợp')
  const [toasts, setToasts] = useState<Toast[]>([])

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
  const [supabaseStatus, setSupabaseStatus] = useState<'local' | 'connecting' | 'connected' | 'degraded'>(supabaseConfigured ? 'connecting' : 'local')

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
        setSupabaseStatus('degraded')
        notify('info', 'Đang dùng dữ liệu demo cục bộ', 'Supabase chưa có schema/seed hoặc Data API chưa expose bảng. Chạy migration và seed rồi refresh.')
        return
      }
      const total = result.reduce((sum, item) => sum + (item.response.data?.length ?? 0), 0)
      const remote = Object.fromEntries(result.map(({ collection, response }) => [collection, (response.data ?? []).map(deserialize)])) as unknown as DemoState
      dispatch({ type: 'reset', state: remote })
      setSupabaseStatus('connected')
      notify('success', 'Đã nạp dữ liệu từ Supabase', `${total} bản ghi được đồng bộ vào demo.`)
      } catch {
        if (!active) return
        setSupabaseStatus('degraded')
        notify('info', 'Đang dùng dữ liệu demo cục bộ', 'Không thể kết nối Data API. Chạy migration/seed và kiểm tra Data API exposure rồi refresh.')
      }
    }
    void hydrate()
    return () => { active = false }
  }, [notify])

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

  const audit = useCallback(async (action: string, entityType: string, entityId: string, before?: Record<string, unknown>, after?: Record<string, unknown>) => {
    const entry: AuditLog = { id: id(), createdAt: now(), updatedAt: now(), actor: 'Nguyễn Minh Anh', role, action, entityType, entityId, before, after }
    dispatch({ type: 'upsert', collection: 'auditLogs', entity: entry })
    try { await sync('auditLogs', entry, 'upsert') } catch { /* The primary mutation remains usable in local mode. */ }
  }, [role, sync])

  const create = useCallback(async <T extends BaseEntity = BaseEntity>(collection: EntityCollection, partial: Record<string, any>, label = 'Tạo bản ghi') => {
    const entity = { ...partial, id: partial.id ?? id(), createdAt: partial.createdAt ?? now(), updatedAt: now() } as T
    dispatch({ type: 'upsert', collection, entity })
    try { await sync(collection, entity, 'upsert'); notify('success', `${label} thành công`, supabaseConfigured ? 'Đã đồng bộ Supabase.' : 'Đang lưu trong demo cục bộ.') } catch (error) { notify('error', `${label} đã lưu cục bộ`, error instanceof Error ? error.message : 'Không thể đồng bộ Supabase.') }
    if (collection !== 'auditLogs') void audit(label, collection, entity.id, undefined, entity as unknown as Record<string, unknown>)
    return entity
  }, [audit, notify, sync])

  const update = useCallback(async <T extends BaseEntity>(collection: EntityCollection, entity: T, patch: Partial<T>, label = 'Cập nhật bản ghi') => {
    const next = { ...entity, ...patch, updatedAt: now() } as T
    dispatch({ type: 'upsert', collection, entity: next })
    try { await sync(collection, next, 'upsert'); notify('success', `${label} thành công`, supabaseConfigured ? 'Đã đồng bộ Supabase.' : 'Đang lưu trong demo cục bộ.') } catch (error) { notify('error', `${label} đã lưu cục bộ`, error instanceof Error ? error.message : 'Không thể đồng bộ Supabase.') }
    if (collection !== 'auditLogs') void audit(label, collection, entity.id, entity as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>)
    return next
  }, [audit, notify, sync])

  const remove = useCallback(async (collection: EntityCollection, entity: BaseEntity, label = 'Xóa bản ghi') => {
    dispatch({ type: 'remove', collection, id: entity.id })
    try { await sync(collection, entity, 'delete'); notify('success', `${label} thành công`, supabaseConfigured ? 'Đã đồng bộ Supabase.' : 'Đang lưu trong demo cục bộ.') } catch (error) { notify('error', `${label} đã xóa cục bộ`, error instanceof Error ? error.message : 'Không thể đồng bộ Supabase.') }
    if (collection !== 'auditLogs') void audit(label, collection, entity.id, entity as unknown as Record<string, unknown>)
  }, [audit, notify, sync])

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

  const simulateConsumerRequest = useCallback(async (dataProductId: string, consumerName: string) => {
    const product = state.dataProducts.find((item) => item.id === dataProductId)
    if (!product) return
    const run = await create<RuntimeRun>('runtimeRuns', { dataProductId, type: 'API', name: `${product.code} · Sandbox request`, correlationId: `CORR-API-${Date.now().toString().slice(-7)}`, source: consumerName, target: product.code, status: 'Success', startedAt: now(), endedAt: now(), latencyMs: 80 + Math.floor(Math.random() * 180), recordsRead: 1, recordsWritten: 1, recordsRejected: 0 }, 'Mô phỏng consumer request')
    await create('runtimeEvents', { runtimeRunId: run.id, step: 'Policy enforcement', status: 'Success', startedAt: now(), endedAt: now(), message: 'Allowlist, row filter và masking đã được áp dụng.', recordCount: 1 }, 'Ghi event API')
  }, [create, state.dataProducts])

  const value = useMemo<DemoContextValue>(() => ({
    state, role, setRole, toasts, dismissToast, notify,
    canMutate: (collection) => rolePermissions[role].includes(collection),
    create, update, remove, resetDemo: () => { const fresh = seedDemoState(); dispatch({ type: 'reset', state: fresh }); notify('info', 'Đã khôi phục dữ liệu demo', 'Các thay đổi local đã được thay thế bởi seed data.') },
    testConnector, runPipeline, runDq, submitApproval, decideApproval, simulateConsumerRequest, supabaseConfigured, supabaseStatus,
  }), [create, decideApproval, dismissToast, notify, remove, role, runDq, runPipeline, simulateConsumerRequest, state, submitApproval, supabaseStatus, testConnector, toasts, update])

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export const useDemo = () => {
  const context = useContext(DemoContext)
  if (!context) throw new Error('useDemo must be used within DemoProvider')
  return context
}
