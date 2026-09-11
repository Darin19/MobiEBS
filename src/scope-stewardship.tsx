import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileClock,
  FolderTree,
  Landmark,
  LayoutDashboard,
  ListFilter,
  PauseCircle,
  Plus,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
  UsersRound,
  X,
} from 'lucide-react'
import { useDemo } from './demo-store'
import { findScopeConflicts, isScopeActive, scopeIncludesAsset } from './scope-permissions'
import type { DataAsset, DemoState, GovernanceScope, ScopeChangeRequest, ScopeChangeRequestType, StewardshipAssignmentRole } from './types'

type ScopeTab = 'overview' | 'organization' | 'domain' | 'steward' | 'requests' | 'history' | 'my-scope' | 'coverage' | 'my-requests'

const requestLabels: Record<ScopeChangeRequestType, string> = {
  ADD_ASSET: 'Thêm asset',
  REMOVE_ASSET: 'Bỏ asset',
  TRANSFER_STEWARD: 'Chuyển Steward',
  CHANGE_OWNER: 'Thay Data Owner',
  EXPAND_DOMAIN: 'Mở rộng Domain',
  REDUCE_DOMAIN: 'Thu hẹp Domain',
  PAUSE_SCOPE: 'Tạm dừng scope',
  REACTIVATE_SCOPE: 'Kích hoạt lại scope',
}

const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(value)) : 'Không giới hạn'
const today = () => new Date().toISOString().slice(0, 10)

const badgeTone = (status?: string) => {
  if (['Active', 'Approved', 'Complete', 'Accepted'].includes(status ?? '')) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (['Paused', 'Pending Approval', 'Awaiting Acceptance', 'Changes Requested', 'Review Required'].includes(status ?? '')) return 'bg-amber-50 text-amber-800 ring-amber-200'
  if (['Revoked', 'Expired', 'Rejected', 'Incomplete'].includes(status ?? '')) return 'bg-red-50 text-red-700 ring-red-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

function Badge({ children }: { children?: ReactNode }) {
  return <span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ' + badgeTone(String(children ?? ''))}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{children}</span>
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-label={title} className={'max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl ' + (wide ? 'max-w-5xl' : 'max-w-xl')} onMouseDown={(event) => event.stopPropagation()}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4"><div><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="mt-0.5 text-sm text-slate-500">Các thay đổi được ghi audit trail.</p></div><button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800" aria-label="Đóng" onClick={onClose}><X className="h-5 w-5" /></button></header>
      {children}
    </section>
  </div>
}

function Metric({ label, value, detail, tone = 'teal', icon: Icon }: { label: string; value: ReactNode; detail: string; tone?: 'teal' | 'blue' | 'amber' | 'red'; icon: typeof ShieldCheck }) {
  const color = tone === 'blue' ? 'bg-blue-50 text-blue-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-teal/10 text-teal'
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.06em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></div><span className={'grid h-10 w-10 place-items-center rounded-xl ' + color}><Icon className="h-5 w-5" /></span></div></section>
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="grid place-items-center px-6 py-12 text-center"><FileClock className="h-7 w-7 text-slate-400" /><p className="mt-3 font-semibold text-slate-800">{title}</p><p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p></div>
}

const scopeAssets = (state: DemoState, scope: GovernanceScope) => state.dataAssets.filter((asset) => scopeIncludesAsset(scope, asset))
const assignmentsForScope = (state: DemoState, scopeId: string) => state.stewardshipAssignments.filter((assignment) => assignment.scopeId === scopeId)
const primaryAssignment = (state: DemoState, scopeId: string, role: StewardshipAssignmentRole) => assignmentsForScope(state, scopeId).find((assignment) => assignment.assignmentRole === role && assignment.status === 'Active' && assignment.isPrimary)

const coverage = (state: DemoState, asset: DataAsset) => {
  const assignments = state.stewardshipAssignments.filter((assignment) => {
    const scope = state.governanceScopes.find((item) => item.id === assignment.scopeId)
    return Boolean(scope && assignment.status === 'Active' && isScopeActive(scope) && scopeIncludesAsset(scope, asset))
  })
  return {
    owner: assignments.some((assignment) => assignment.assignmentRole === 'DataOwner'),
    steward: assignments.some((assignment) => assignment.assignmentRole === 'DataSteward' && assignment.isPrimary),
    fields: state.assetFields.filter((field) => field.assetId === asset.id).length,
    policies: state.policies.filter((policy) => policy.assetId === asset.id).length,
    products: state.dataProducts.filter((product) => product.assetId === asset.id).length,
    schemas: state.schemaSnapshots.filter((snapshot) => snapshot.assetId === asset.id).length,
  }
}

const expiringSoon = (scope: GovernanceScope) => {
  if (!scope.validTo || !isScopeActive(scope)) return false
  const days = Math.ceil((new Date(scope.validTo + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)
  return days >= 0 && days <= 30
}

function ScopeCreateModal({ onClose }: { onClose: () => void }) {
  const { state, create, currentUserId, getUserName, notify } = useDemo()
  const [organizationId, setOrganizationId] = useState(state.organizations[0]?.id ?? '')
  const [scopeType, setScopeType] = useState<GovernanceScope['scopeType']>('Domain')
  const [domainId, setDomainId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [stewardId, setStewardId] = useState('')
  const [validFrom, setValidFrom] = useState(today())
  const [validTo, setValidTo] = useState('')
  const domains = state.dataDomains.filter((domain) => domain.organizationId === organizationId)
  const assets = state.dataAssets.filter((asset) => asset.owningOrganizationId === organizationId)
  const users = state.userOrganizationRoles.filter((role) => role.organizationId === organizationId && role.status === 'Active')

  const submit = async () => {
    if (!organizationId || !ownerId || !stewardId || (scopeType === 'Domain' && !domainId) || (scopeType === 'Asset' && !assetId)) {
      notify('error', 'Thiếu thông tin bắt buộc', 'Chọn Organization, phạm vi, Owner và Primary Steward.')
      return
    }
    if (validTo && validTo < validFrom) {
      notify('error', 'Ngày hiệu lực không hợp lệ', 'Valid To phải sau Valid From.')
      return
    }
    const scope = await create<GovernanceScope>('governanceScopes', {
      organizationId,
      scopeType,
      domainId: scopeType === 'Domain' ? domainId : undefined,
      assetId: scopeType === 'Asset' ? assetId : undefined,
      status: 'Active',
      validFrom,
      validTo: validTo || undefined,
      createdBy: currentUserId,
    }, 'Tạo Governance Scope')
    await Promise.all([
      create('stewardshipAssignments', { scopeId: scope.id, assignmentRole: 'DataOwner', userId: ownerId, assignedBy: currentUserId, assignedAt: new Date().toISOString(), acceptedAt: new Date().toISOString(), validFrom, validTo: validTo || undefined, status: 'Active', isPrimary: true }, 'Gán Data Owner'),
      create('stewardshipAssignments', { scopeId: scope.id, assignmentRole: 'DataSteward', userId: stewardId, assignedBy: currentUserId, assignedAt: new Date().toISOString(), validFrom, validTo: validTo || undefined, status: 'Awaiting Acceptance', isPrimary: true }, 'Gán Data Steward'),
    ])
    onClose()
  }

  return <Modal title="Tạo Governance Scope" onClose={onClose}><div className="space-y-4 p-5">
    <label><span className="label">Organization *</span><select className="field" value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setDomainId(''); setAssetId('') }}><option value="">Chọn Organization</option>{state.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
    <label><span className="label">Scope type *</span><select className="field" value={scopeType} onChange={(event) => setScopeType(event.target.value as GovernanceScope['scopeType'])}><option value="Organization">Organization Scope</option><option value="Domain">Domain Scope</option><option value="Asset">Asset Scope</option></select></label>
    {scopeType === 'Domain' && <label><span className="label">Data Domain *</span><select className="field" value={domainId} onChange={(event) => setDomainId(event.target.value)}><option value="">Chọn Domain</option>{domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.code} · {domain.name}</option>)}</select></label>}
    {scopeType === 'Asset' && <label><span className="label">Data Asset *</span><select className="field" value={assetId} onChange={(event) => setAssetId(event.target.value)}><option value="">Chọn Asset</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.code} · {asset.name}</option>)}</select></label>}
    <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Data Owner *</span><select className="field" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="">Chọn Owner</option>{users.filter((role) => role.role === 'DataOwner').map((role) => <option key={role.id} value={role.userId}>{getUserName(role.userId)}</option>)}</select></label><label><span className="label">Primary Data Steward *</span><select className="field" value={stewardId} onChange={(event) => setStewardId(event.target.value)}><option value="">Chọn Steward</option>{users.filter((role) => role.role === 'DataSteward' || role.role === 'DelegateSteward').map((role) => <option key={role.id} value={role.userId}>{getUserName(role.userId)}</option>)}</select></label><label><span className="label">Valid From *</span><input className="field" type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} /></label><label><span className="label">Valid To</span><input className="field" type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} /></label></div>
    <p className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm leading-6 text-sky-900">Primary Steward được gán trạng thái Awaiting Acceptance; chỉ sau khi accept mới có quyền mutate metadata, DQ và policy trong scope.</p>
    <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Hủy</button><button className="btn-primary" onClick={() => void submit()}><Plus className="h-4 w-4" />Tạo scope</button></div>
  </div></Modal>
}

function ScopeRequestModal({ onClose }: { onClose: () => void }) {
  const { state, currentUserId, submitScopeChangeRequest, getUserName, notify } = useDemo()
  const ownScopes = state.governanceScopes.filter((scope) => state.stewardshipAssignments.some((assignment) => assignment.scopeId === scope.id && assignment.userId === currentUserId && assignment.status === 'Active'))
  const [scopeId, setScopeId] = useState(ownScopes[0]?.id ?? '')
  const [requestType, setRequestType] = useState<ScopeChangeRequestType>('ADD_ASSET')
  const [assetId, setAssetId] = useState('')
  const [userId, setUserId] = useState('')
  const [reason, setReason] = useState('')
  const scope = state.governanceScopes.find((item) => item.id === scopeId)
  const users = state.userOrganizationRoles.filter((role) => role.organizationId === scope?.organizationId && role.status === 'Active' && (role.role === 'DataOwner' || role.role === 'DataSteward'))
  const needsAsset = ['ADD_ASSET', 'REMOVE_ASSET', 'EXPAND_DOMAIN', 'REDUCE_DOMAIN'].includes(requestType)
  const needsUser = ['TRANSFER_STEWARD', 'CHANGE_OWNER'].includes(requestType)

  const submit = async () => {
    if (!scopeId || !reason.trim()) {
      notify('error', 'Thiếu thông tin yêu cầu', 'Chọn scope và điền lý do trước khi gửi.')
      return
    }
    await submitScopeChangeRequest({ scopeId, requestType, targetAssetId: assetId || undefined, targetUserId: userId || undefined, reason: reason.trim() })
    onClose()
  }

  return <Modal title="Tạo yêu cầu thay đổi scope" onClose={onClose}><div className="space-y-4 p-5">
    <label><span className="label">Scope của tôi *</span><select className="field" value={scopeId} onChange={(event) => setScopeId(event.target.value)}><option value="">Chọn Scope</option>{ownScopes.map((item) => <option key={item.id} value={item.id}>{item.scopeType} · {state.dataDomains.find((domain) => domain.id === item.domainId)?.name ?? state.dataAssets.find((asset) => asset.id === item.assetId)?.code ?? 'Organization'}</option>)}</select></label>
    <label><span className="label">Loại yêu cầu *</span><select className="field" value={requestType} onChange={(event) => setRequestType(event.target.value as ScopeChangeRequestType)}>{Object.entries(requestLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {needsAsset && <label><span className="label">Data Asset liên quan</span><select className="field" value={assetId} onChange={(event) => setAssetId(event.target.value)}><option value="">Chọn Asset</option>{state.dataAssets.filter((asset) => !scope || asset.owningOrganizationId === scope.organizationId).map((asset) => <option key={asset.id} value={asset.id}>{asset.code} · {asset.name}</option>)}</select></label>}
    {needsUser && <label><span className="label">Người nhận đề xuất</span><select className="field" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Chọn người dùng</option>{users.map((role) => <option key={role.id} value={role.userId}>{getUserName(role.userId)} · {role.role}</option>)}</select></label>}
    <label><span className="label">Lý do *</span><textarea className="field min-h-28" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Mục đích quản trị, ảnh hưởng, ngày hiệu lực đề xuất…" /></label>
    <p className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm leading-6 text-amber-900">Request chỉ được gửi để Admin / Owner duyệt; không tự thay đổi scope hoặc assignment.</p>
    <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Hủy</button><button className="btn-primary" onClick={() => void submit()}><Send className="h-4 w-4" />Gửi request</button></div>
  </div></Modal>
}

function RequestReviewModal({ request, decision, onClose }: { request: ScopeChangeRequest; decision: 'Approved' | 'Rejected' | 'Changes Requested'; onClose: () => void }) {
  const { reviewScopeChangeRequest } = useDemo()
  const [comment, setComment] = useState('')
  const required = decision === 'Rejected' || decision === 'Changes Requested'
  return <Modal title={decision === 'Approved' ? 'Phê duyệt Scope Request' : decision === 'Rejected' ? 'Từ chối Scope Request' : 'Yêu cầu bổ sung'} onClose={onClose}><div className="p-5"><p className="text-sm leading-6 text-slate-600">{requestLabels[request.requestType]} · {request.reason}</p><label className="mt-4 block"><span className="label">Nhận xét {required && '*'}</span><textarea className="field min-h-28" value={comment} onChange={(event) => setComment(event.target.value)} /></label><div className="mt-6 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Hủy</button><button className={decision === 'Rejected' ? 'btn-danger' : 'btn-primary'} disabled={required && !comment.trim()} onClick={() => { void reviewScopeChangeRequest(request, decision, comment || undefined); onClose() }}>{decision === 'Approved' ? 'Approve' : decision === 'Rejected' ? 'Reject' : 'Request changes'}</button></div></div></Modal>
}

function ScopeDetailModal({ scope, onClose }: { scope: GovernanceScope; onClose: () => void }) {
  const { state, currentUserId, getUserName, canManageScope, canMutateAsset, acceptStewardship, update, create, notify } = useDemo()
  const navigate = useNavigate()
  const [view, setView] = useState<'info' | 'stewardship' | 'coverage' | 'policies' | 'history'>('info')
  const [assignRole, setAssignRole] = useState<StewardshipAssignmentRole>('DataSteward')
  const [assignee, setAssignee] = useState('')
  const assets = scopeAssets(state, scope)
  const assignments = assignmentsForScope(state, scope.id)
  const organization = state.organizations.find((item) => item.id === scope.organizationId)
  const domain = state.dataDomains.find((item) => item.id === scope.domainId)
  const isAdmin = canManageScope()
  const candidates = state.userOrganizationRoles.filter((role) => role.organizationId === scope.organizationId && role.status === 'Active' && (assignRole === 'DataOwner' ? role.role === 'DataOwner' : role.role === 'DataSteward' || role.role === 'DelegateSteward'))

  const assign = async () => {
    if (!assignee) {
      notify('error', 'Chọn người nhận', 'Cần chọn Owner hoặc Steward trước khi gán.')
      return
    }
    if (assignRole === 'DataSteward') {
      const current = assignments.find((assignment) => assignment.assignmentRole === 'DataSteward' && assignment.isPrimary && assignment.status === 'Active')
      if (current) await update('stewardshipAssignments', current, { status: 'Ended', validTo: today() }, 'Kết thúc stewardship cũ')
    }
    await create('stewardshipAssignments', { scopeId: scope.id, assignmentRole: assignRole, userId: assignee, assignedBy: currentUserId, assignedAt: new Date().toISOString(), acceptedAt: assignRole === 'DataOwner' ? new Date().toISOString() : undefined, validFrom: today(), validTo: scope.validTo, status: assignRole === 'DataOwner' ? 'Active' : 'Awaiting Acceptance', isPrimary: true }, assignRole === 'DataOwner' ? 'Gán Data Owner' : 'Chuyển Data Steward')
    setAssignee('')
  }

  const audit = state.auditLogs.filter((entry) => entry.entityId === scope.id || assignments.some((assignment) => assignment.id === entry.entityId) || assets.some((asset) => asset.id === entry.entityId))
  const policies = state.policies.filter((policy) => assets.some((asset) => asset.id === policy.assetId))
  const tabs: Array<{ id: typeof view; label: string }> = [{ id: 'info', label: 'Scope info' }, { id: 'stewardship', label: 'Stewardship' }, { id: 'coverage', label: 'Governance coverage' }, { id: 'policies', label: 'Related policies' }, { id: 'history', label: 'History' }]

  return <Modal title="Scope detail" onClose={onClose} wide><div className="border-b border-slate-200 px-5 py-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-semibold text-teal">{scope.scopeType} Scope</p><h3 className="mt-1 text-xl font-bold text-slate-900">{organization?.name}</h3><p className="mt-1 text-sm text-slate-600">{domain?.name ?? state.dataAssets.find((asset) => asset.id === scope.assetId)?.code ?? 'Toàn Organization'} · {assets.length} asset</p></div><div className="flex gap-2"><Badge>{scope.status}</Badge>{isAdmin && <button className="btn-secondary min-h-8 px-2.5 py-1" onClick={() => void update('governanceScopes', scope, { status: scope.status === 'Paused' ? 'Active' : 'Paused' }, scope.status === 'Paused' ? 'Kích hoạt lại scope' : 'Tạm dừng scope')}><PauseCircle className="h-4 w-4" />{scope.status === 'Paused' ? 'Reactivate' : 'Pause'}</button>}</div></div></div>
    <div className="flex overflow-x-auto border-b border-slate-200 px-3" role="tablist">{tabs.map((tab) => <button key={tab.id} role="tab" aria-selected={view === tab.id} className={'relative whitespace-nowrap px-3 py-3 text-sm font-semibold ' + (view === tab.id ? 'text-teal' : 'text-slate-500 hover:text-slate-800')} onClick={() => setView(tab.id)}>{tab.label}{view === tab.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-teal" />}</button>)}</div>
    <div className="p-5">
      {view === 'info' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Fact label="Organization">{organization?.name}</Fact><Fact label="Scope type">{scope.scopeType}</Fact><Fact label="Valid From">{dateLabel(scope.validFrom)}</Fact><Fact label="Valid To">{dateLabel(scope.validTo)}</Fact><div className="md:col-span-2 xl:col-span-4 rounded-xl border border-slate-200"><div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0"><Fact label="Domain / Asset">{domain?.name ?? state.dataAssets.find((asset) => asset.id === scope.assetId)?.code ?? 'Toàn Organization'}</Fact><Fact label="Status"><Badge>{scope.status}</Badge></Fact><Fact label="Created by">{getUserName(scope.createdBy)}</Fact></div></div></div>}
      {view === 'stewardship' && <div className="space-y-4">{assignments.map((assignment) => <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between" key={assignment.id}><div><p className="font-semibold text-slate-900">{getUserName(assignment.userId)} <span className="ml-2 text-sm font-medium text-slate-500">{assignment.assignmentRole}{assignment.isPrimary ? ' · Primary' : ''}</span></p><p className="mt-1 text-sm text-slate-500">{dateLabel(assignment.validFrom)} → {dateLabel(assignment.validTo)} · Gán bởi {getUserName(assignment.assignedBy)}</p>{assignment.reason && <p className="mt-1 text-sm text-amber-800">{assignment.reason}</p>}</div><div className="flex items-center gap-2"><Badge>{assignment.status}</Badge>{assignment.userId === currentUserId && assignment.status === 'Awaiting Acceptance' && <><button className="btn-secondary min-h-8 px-2 py-1 text-red-700" onClick={() => void acceptStewardship(assignment, false, 'Không thể nhận stewardship trong thời điểm hiện tại.')}>Từ chối</button><button className="btn-primary min-h-8 px-2 py-1" onClick={() => void acceptStewardship(assignment, true)}>Accept</button></>}</div></div>)}{isAdmin && <div className="grid gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 md:grid-cols-[1fr_1fr_auto]"><select className="field" value={assignRole} onChange={(event) => setAssignRole(event.target.value as StewardshipAssignmentRole)}><option value="DataOwner">Data Owner</option><option value="DataSteward">Primary Data Steward</option><option value="DelegateSteward">Delegate Steward</option></select><select className="field" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Chọn người nhận</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.userId}>{getUserName(candidate.userId)}</option>)}</select><button className="btn-primary" onClick={() => void assign()}><UserCheck className="h-4 w-4" />Gán</button></div>}</div>}
      {view === 'coverage' && <div className="overflow-x-auto"><table className="w-full min-w-[870px] text-left"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-[.06em] text-slate-500"><tr><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Metadata</th><th className="px-4 py-3">DQ</th><th className="px-4 py-3">Policy</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead><tbody>{assets.map((asset) => { const value = coverage(state, asset); return <tr className="border-t border-slate-100" key={asset.id}><td className="px-4 py-3"><p className="font-semibold text-slate-900">{asset.name}</p><p className="font-mono text-xs text-slate-500">{asset.code}</p></td><td className="px-4 py-3">{value.fields} field · {value.schemas} schema</td><td className="px-4 py-3"><span className={asset.dqScore < 90 ? 'font-bold text-amber-700' : 'font-bold text-emerald-700'}>{asset.dqScore}</span></td><td className="px-4 py-3">{value.policies}</td><td className="px-4 py-3">{value.products}</td><td className="px-4 py-3">{value.owner && value.steward ? <Badge>Complete</Badge> : <Badge>Incomplete</Badge>}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-1"><button className="rounded-lg p-2 text-teal hover:bg-teal/10" aria-label={'Mở Data Catalog ' + asset.name} onClick={() => navigate('/catalog?asset=' + asset.id)}><Archive className="h-4 w-4" /></button><button className="rounded-lg p-2 text-violet-700 hover:bg-violet-50" aria-label={'Mở DQ ' + asset.name} onClick={() => navigate('/governance/dq?asset=' + asset.id)}><ClipboardCheck className="h-4 w-4" /></button>{canMutateAsset(asset.id) && <button className="rounded-lg p-2 text-slate-700 hover:bg-slate-100" aria-label={'Mở Asset ' + asset.name} onClick={() => navigate('/assets/' + asset.id)}><ChevronRight className="h-4 w-4" /></button>}</div></td></tr> })}</tbody></table></div>}
      {view === 'policies' && <div className="space-y-2">{policies.map((policy) => <button className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 text-left hover:border-teal/30 hover:bg-teal/[.02]" key={policy.id} onClick={() => navigate('/governance/policies/' + policy.id)}><div><p className="font-semibold text-slate-900">{policy.name}</p><p className="mt-1 text-sm text-slate-500">{policy.code}</p></div><Badge>{policy.status}</Badge></button>)}{!policies.length && <Empty title="Chưa có policy liên quan" description="Tạo Policy từ asset thuộc scope để bổ sung governance coverage." />}</div>}
      {view === 'history' && <AuditRows rows={audit} getUserName={getUserName} />}
    </div>
  </Modal>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="p-4"><p className="text-[11px] font-bold uppercase tracking-[.06em] text-slate-500">{label}</p><div className="mt-1.5 text-sm text-slate-800">{children}</div></div>
}

function AuditRows({ rows, getUserName }: { rows: DemoState['auditLogs']; getUserName: (userId?: string) => string }) {
  if (!rows.length) return <Empty title="Chưa có audit record" description="Thay đổi Scope, Assignment và Scope Request sẽ xuất hiện ở đây." />
  return <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">{rows.map((row) => <div className="grid gap-3 p-4 md:grid-cols-[150px_1fr_auto]" key={row.id}><p className="text-sm text-slate-500">{dateLabel(row.createdAt)}</p><div><p className="font-semibold text-slate-800">{row.action}</p><p className="mt-1 text-sm text-slate-500">{getUserName(row.actorUserId)} · {row.role}{row.reason ? ' · ' + row.reason : ''}</p></div><span className="font-mono text-xs text-slate-400">{row.entityType}</span></div>)}</div>
}

function ScopeStewardshipPage() {
  const { state, currentUserId, getUserName, canManageScope, canViewAsset } = useDemo()
  const navigate = useNavigate()
  const isAdmin = canManageScope()
  const [tab, setTab] = useState<ScopeTab>('overview')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [selectedScopeId, setSelectedScopeId] = useState<string>()
  const [review, setReview] = useState<{ request: ScopeChangeRequest; decision: 'Approved' | 'Rejected' | 'Changes Requested' }>()
  const tabs = isAdmin
    ? [{ id: 'overview' as ScopeTab, label: 'Tổng quan', icon: LayoutDashboard }, { id: 'organization' as ScopeTab, label: 'Theo đơn vị', icon: Landmark }, { id: 'domain' as ScopeTab, label: 'Theo Data Domain', icon: FolderTree }, { id: 'steward' as ScopeTab, label: 'Theo Steward', icon: UsersRound }, { id: 'requests' as ScopeTab, label: 'Yêu cầu Scope', icon: ClipboardCheck }, { id: 'history' as ScopeTab, label: 'Lịch sử & Audit', icon: FileClock }]
    : [{ id: 'my-scope' as ScopeTab, label: 'Phạm vi của tôi', icon: UsersRound }, { id: 'coverage' as ScopeTab, label: 'Governance Coverage', icon: ShieldCheck }, { id: 'my-requests' as ScopeTab, label: 'Yêu cầu của tôi', icon: ClipboardCheck }, { id: 'history' as ScopeTab, label: 'Lịch sử phạm vi', icon: FileClock }]
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id
  const visibleAssets = useMemo(() => isAdmin ? state.dataAssets : state.dataAssets.filter((asset) => canViewAsset(asset.id)), [canViewAsset, isAdmin, state.dataAssets])
  const visibleScopes = useMemo(() => isAdmin ? state.governanceScopes : state.governanceScopes.filter((scope) => state.stewardshipAssignments.some((assignment) => assignment.scopeId === scope.id && assignment.userId === currentUserId)), [currentUserId, isAdmin, state.governanceScopes, state.stewardshipAssignments])
  const filteredScopes = useMemo(() => visibleScopes.filter((scope) => {
    const organization = state.organizations.find((item) => item.id === scope.organizationId)
    const domain = state.dataDomains.find((item) => item.id === scope.domainId)
    const asset = state.dataAssets.find((item) => item.id === scope.assetId)
    const found = (organization?.name ?? '') + ' ' + (domain?.name ?? '') + ' ' + (asset?.code ?? '')
    return found.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || scope.status === status)
  }), [query, state.dataAssets, state.dataDomains, state.organizations, status, visibleScopes])
  const selectedScope = state.governanceScopes.find((scope) => scope.id === selectedScopeId)
  const gaps = visibleAssets.filter((asset) => { const value = coverage(state, asset); return !value.owner || !value.steward || asset.governanceStatus !== 'Complete' })
  const conflicts = useMemo(() => findScopeConflicts({ assets: visibleAssets, scopes: state.governanceScopes, assignments: state.stewardshipAssignments }), [state.governanceScopes, state.stewardshipAssignments, visibleAssets])
  const pending = state.scopeChangeRequests.filter((request) => request.status === 'Pending Approval')
  const mine = state.scopeChangeRequests.filter((request) => request.requestedBy === currentUserId)
  const audit = state.auditLogs.filter((row) => isAdmin || row.actorUserId === currentUserId || visibleScopes.some((scope) => scope.id === row.entityId))

  const exportCsv = () => {
    const rows = [['Organization', 'Domain', 'Asset', 'Data Owner', 'Data Steward', 'Scope Status', 'Valid To']]
    filteredScopes.forEach((scope) => {
      const organization = state.organizations.find((item) => item.id === scope.organizationId)?.name ?? ''
      const domain = state.dataDomains.find((item) => item.id === scope.domainId)?.name ?? ''
      const asset = state.dataAssets.find((item) => item.id === scope.assetId)?.code ?? ''
      const owner = primaryAssignment(state, scope.id, 'DataOwner')
      const steward = primaryAssignment(state, scope.id, 'DataSteward')
      rows.push([organization, domain, asset, owner ? getUserName(owner.userId) : '', steward ? getUserName(steward.userId) : '', scope.status, scope.validTo ?? ''])
    })
    const output = '\uFEFF' + rows.map((row) => row.map((value) => '"' + value.replace(/"/g, '""') + '"').join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([output], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'scope-stewardship-' + today() + '.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return <div className="fade-in">
    <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="mb-2 flex items-center gap-2 text-sm text-slate-500"><span>Governance</span><ChevronRight className="h-3.5 w-3.5" /><span>Scope & stewardship</span></div><h1 className="page-heading">Scope & stewardship</h1><p className="mt-1.5 max-w-4xl text-[16px] text-slate-600">Quản lý phạm vi dữ liệu và trách nhiệm Data Owner / Data Steward theo chuỗi <strong className="font-semibold text-slate-800">User → Organization → Role → Scope → Domain / Asset</strong>.</p></div><div className="flex flex-wrap gap-2">{isAdmin ? <><button className="btn-secondary" onClick={exportCsv}><Download className="h-4 w-4" />Export scope</button><button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Tạo Governance Scope</button></> : <button className="btn-primary" onClick={() => setRequestOpen(true)}><Send className="h-4 w-4" />Request change</button>}</div></div>
    <div className="mb-5 flex overflow-x-auto border-b border-slate-200" role="tablist">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} role="tab" aria-selected={activeTab === item.id} className={'relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold ' + (activeTab === item.id ? 'text-teal' : 'text-slate-500 hover:text-slate-800')} onClick={() => setTab(item.id)}><Icon className="h-4 w-4" />{item.label}{activeTab === item.id && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-teal" />}</button> })}</div>

    {(activeTab === 'overview' || activeTab === 'my-scope') && <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label={isAdmin ? 'Organizations' : 'Scope Active'} value={isAdmin ? state.organizations.length : visibleScopes.filter((scope) => isScopeActive(scope)).length} detail={isAdmin ? 'trong governance catalog' : 'được giao cho tôi'} icon={Landmark} /><Metric label="Data Domains" value={isAdmin ? state.dataDomains.length : new Set(visibleAssets.map((asset) => asset.domainId)).size} detail={isAdmin ? 'domain đã khai báo' : 'domain trong scope'} icon={FolderTree} tone="blue" /><Metric label="Governance gaps" value={gaps.length} detail="owner/steward/coverage cần xử lý" icon={AlertTriangle} tone="amber" /><Metric label={isAdmin ? 'Pending requests' : 'Sắp hết hạn'} value={isAdmin ? pending.length : visibleScopes.filter(expiringSoon).length} detail={isAdmin ? 'chờ Admin review' : 'scope trong 30 ngày'} icon={ClipboardCheck} tone="teal" /></div>
      <section className="panel mt-5 overflow-hidden"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="field pl-9" placeholder="Tìm Organization, Domain hoặc Asset…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select aria-label="Lọc trạng thái Scope" className="field w-auto" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tất cả trạng thái</option>{['Draft', 'Active', 'Paused', 'Expired', 'Revoked'].map((item) => <option key={item}>{item}</option>)}</select><span className="whitespace-nowrap text-sm text-slate-500">{filteredScopes.length} scope</span></div><ScopeTable scopes={filteredScopes} state={state} getUserName={getUserName} onSelect={setSelectedScopeId} /></section></>}

    {activeTab === 'organization' && <OrganizationView state={state} onAsset={(assetId) => navigate('/assets/' + assetId)} />}
    {activeTab === 'domain' && <DomainView state={state} getUserName={getUserName} />}
    {activeTab === 'steward' && <StewardView state={state} getUserName={getUserName} conflicts={conflicts} />}
    {(activeTab === 'requests' || activeTab === 'my-requests') && <RequestView requests={isAdmin ? state.scopeChangeRequests : mine} isAdmin={isAdmin} getUserName={getUserName} onReview={setReview} onCreate={() => setRequestOpen(true)} />}
    {activeTab === 'coverage' && <CoverageView assets={visibleAssets} state={state} onAsset={(assetId) => navigate('/assets/' + assetId)} />}
    {activeTab === 'history' && <section className="panel overflow-hidden"><div className="panel-heading"><div><h2 className="font-bold text-slate-900">{isAdmin ? 'Lịch sử & Audit toàn hệ thống' : 'Lịch sử phạm vi của tôi'}</h2><p className="mt-1 text-sm text-slate-500">Before / after, actor, vai trò, lý do và timestamp cho governance mutation.</p></div></div><AuditRows rows={audit} getUserName={getUserName} /></section>}

    {createOpen && <ScopeCreateModal onClose={() => setCreateOpen(false)} />}
    {requestOpen && <ScopeRequestModal onClose={() => setRequestOpen(false)} />}
    {review && <RequestReviewModal request={review.request} decision={review.decision} onClose={() => setReview(undefined)} />}
    {selectedScope && <ScopeDetailModal scope={selectedScope} onClose={() => setSelectedScopeId(undefined)} />}
  </div>
}

function ScopeTable({ scopes, state, getUserName, onSelect }: { scopes: GovernanceScope[]; state: DemoState; getUserName: (userId?: string) => string; onSelect: (scopeId: string) => void }) {
  if (!scopes.length) return <Empty title="Không tìm thấy Scope" description="Đổi bộ lọc hoặc tạo Scope đầu tiên." />
  return <div className="overflow-x-auto"><table className="w-full min-w-[1020px] text-left"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-[.06em] text-slate-500"><tr><th className="px-4 py-3">Organization / scope</th><th className="px-4 py-3">Data Owner</th><th className="px-4 py-3">Primary Steward</th><th className="px-4 py-3">Assets</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Valid To</th><th className="px-4 py-3" /></tr></thead><tbody>{scopes.map((scope) => { const organization = state.organizations.find((item) => item.id === scope.organizationId); const domain = state.dataDomains.find((item) => item.id === scope.domainId); const asset = state.dataAssets.find((item) => item.id === scope.assetId); const owner = primaryAssignment(state, scope.id, 'DataOwner'); const steward = primaryAssignment(state, scope.id, 'DataSteward'); return <tr className="border-t border-slate-100 hover:bg-teal/[.025]" key={scope.id}><td className="px-4 py-3.5"><p className="font-semibold text-slate-900">{organization?.name}</p><p className="mt-1 text-sm text-slate-500">{scope.scopeType} · {domain?.name ?? asset?.code ?? 'Toàn đơn vị'}</p></td><td className="px-4 py-3.5 text-sm">{owner ? getUserName(owner.userId) : <span className="font-semibold text-red-700">Chưa gán</span>}</td><td className="px-4 py-3.5 text-sm">{steward ? getUserName(steward.userId) : <span className="font-semibold text-red-700">Chưa gán</span>}</td><td className="px-4 py-3.5 text-sm font-semibold">{scopeAssets(state, scope).length}</td><td className="px-4 py-3.5"><Badge>{scope.status}</Badge></td><td className="px-4 py-3.5 text-sm"><span className={expiringSoon(scope) ? 'font-semibold text-amber-700' : ''}>{dateLabel(scope.validTo)}</span></td><td className="px-4 py-3.5 text-right"><button className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-teal hover:bg-teal/10" onClick={() => onSelect(scope.id)}>Chi tiết<ChevronRight className="h-4 w-4" /></button></td></tr> })}</tbody></table></div>
}

function OrganizationView({ state, onAsset }: { state: DemoState; onAsset: (assetId: string) => void }) {
  return <section className="panel overflow-hidden"><div className="panel-heading"><div><h2 className="font-bold text-slate-900">Organization → Data Domain → Data Asset</h2><p className="mt-1 text-sm text-slate-500">Drill-down ownership, steward và governance gap theo đơn vị.</p></div></div><div className="divide-y divide-slate-100">{state.organizations.map((organization) => { const domains = state.dataDomains.filter((domain) => domain.organizationId === organization.id); return <details className="group" key={organization.id}><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"><div><p className="font-semibold text-slate-900">{organization.name}</p><p className="mt-1 text-sm text-slate-500">{domains.length} domain · {state.dataAssets.filter((asset) => asset.owningOrganizationId === organization.id).length} asset</p></div><ChevronRight className="h-5 w-5 text-slate-400 transition group-open:rotate-90" /></summary><div className="grid gap-3 border-t border-slate-100 bg-slate-50/70 p-4 lg:grid-cols-2">{domains.map((domain) => <div className="rounded-xl border border-slate-200 bg-white p-4" key={domain.id}><p className="font-semibold text-slate-900">{domain.name}</p><p className="mt-1 font-mono text-xs text-slate-500">{domain.code}</p><div className="mt-3 space-y-1">{state.dataAssets.filter((asset) => asset.domainId === domain.id).map((asset) => <button className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-teal/[.04]" key={asset.id} onClick={() => onAsset(asset.id)}><span><span className="block text-sm font-semibold text-slate-800">{asset.name}</span><span className="font-mono text-xs text-slate-500">{asset.code}</span></span><Badge>{asset.governanceStatus}</Badge></button>)}</div></div>)}</div></details> })}</div></section>
}

function DomainView({ state, getUserName }: { state: DemoState; getUserName: (userId?: string) => string }) {
  return <section className="panel overflow-hidden"><div className="panel-heading"><div><h2 className="font-bold text-slate-900">Data Domain coverage</h2><p className="mt-1 text-sm text-slate-500">Domain có thể lặp giữa nhiều Organization; scope, owner và steward được kiểm soát riêng.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-[.06em] text-slate-500"><tr><th className="px-4 py-3">Domain</th><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Assets</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Steward</th><th className="px-4 py-3">Gap</th></tr></thead><tbody>{state.dataDomains.map((domain) => { const scopes = state.governanceScopes.filter((scope) => scope.domainId === domain.id); const assets = state.dataAssets.filter((asset) => asset.domainId === domain.id); const scope = scopes[0]; const steward = scope ? primaryAssignment(state, scope.id, 'DataSteward') : undefined; return <tr className="border-t border-slate-100" key={domain.id}><td className="px-4 py-3"><p className="font-semibold text-slate-900">{domain.name}</p><p className="font-mono text-xs text-slate-500">{domain.code}</p></td><td className="px-4 py-3 text-sm">{state.organizations.find((organization) => organization.id === domain.organizationId)?.name}</td><td className="px-4 py-3">{assets.length}</td><td className="px-4 py-3">{scope ? <Badge>{scope.status}</Badge> : <Badge>Incomplete</Badge>}</td><td className="px-4 py-3 text-sm">{steward ? getUserName(steward.userId) : <span className="font-semibold text-red-700">Chưa gán</span>}</td><td className="px-4 py-3 text-sm">{assets.some((asset) => asset.governanceStatus !== 'Complete') ? <span className="font-semibold text-amber-700">Cần review</span> : <span className="font-semibold text-emerald-700">Đầy đủ</span>}</td></tr> })}</tbody></table></div></section>
}

function StewardView({ state, getUserName, conflicts }: { state: DemoState; getUserName: (userId?: string) => string; conflicts: ReturnType<typeof findScopeConflicts> }) {
  return <section className="panel overflow-hidden"><div className="panel-heading"><div><h2 className="font-bold text-slate-900">Steward workload & overlap</h2><p className="mt-1 text-sm text-slate-500">Theo dõi số asset, scope chờ accept và conflict Primary Steward.</p></div></div><div className="grid gap-4 p-5 lg:grid-cols-2">{state.userOrganizationRoles.filter((role) => role.role === 'DataSteward' && role.status === 'Active').map((role) => { const assignments = state.stewardshipAssignments.filter((assignment) => assignment.userId === role.userId && assignment.assignmentRole === 'DataSteward'); const assets = state.dataAssets.filter((asset) => assignments.some((assignment) => { const scope = state.governanceScopes.find((item) => item.id === assignment.scopeId); return Boolean(scope && scopeIncludesAsset(scope, asset)) })); return <div className="rounded-xl border border-slate-200 p-4" key={role.id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{getUserName(role.userId)}</p><p className="mt-1 text-sm text-slate-500">{state.organizations.find((organization) => organization.id === role.organizationId)?.name}</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-sm font-bold text-blue-700">{assets.length} asset</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-lg bg-slate-50 p-2"><strong className="block text-slate-900">{assignments.length}</strong><span className="text-slate-500">Scope</span></div><div className="rounded-lg bg-slate-50 p-2"><strong className="block text-slate-900">{assignments.filter((assignment) => assignment.status === 'Awaiting Acceptance').length}</strong><span className="text-slate-500">Awaiting</span></div><div className="rounded-lg bg-slate-50 p-2"><strong className="block text-slate-900">{assignments.filter((assignment) => { const scope = state.governanceScopes.find((item) => item.id === assignment.scopeId); return Boolean(scope && expiringSoon(scope)) }).length}</strong><span className="text-slate-500">Expiring</span></div></div></div> })}</div>{conflicts.length > 0 && <div className="border-t border-red-100 bg-red-50 p-5"><p className="font-semibold text-red-800">Scope conflict phát hiện ({conflicts.length})</p>{conflicts.map((conflict) => <p className="mt-2 text-sm text-red-700" key={conflict.assetId + conflict.assignmentIds.join('-')}>{state.dataAssets.find((asset) => asset.id === conflict.assetId)?.code}: {conflict.assignmentIds.join(' và ')} cùng Primary Steward.</p>)}</div>}</section>
}

function RequestView({ requests, isAdmin, getUserName, onReview, onCreate }: { requests: ScopeChangeRequest[]; isAdmin: boolean; getUserName: (userId?: string) => string; onReview: (value: { request: ScopeChangeRequest; decision: 'Approved' | 'Rejected' | 'Changes Requested' }) => void; onCreate: () => void }) {
  return <section className="panel overflow-hidden"><div className="panel-heading"><div><h2 className="font-bold text-slate-900">{isAdmin ? 'Yêu cầu thay đổi Scope' : 'Yêu cầu của tôi'}</h2><p className="mt-1 text-sm text-slate-500">Draft, Pending Approval, Approved, Rejected, Changes Requested và Cancelled.</p></div>{!isAdmin && <button className="btn-primary" onClick={onCreate}><Plus className="h-4 w-4" />Tạo request</button>}</div>{requests.length ? <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-[.06em] text-slate-500"><tr><th className="px-4 py-3">Request</th><th className="px-4 py-3">Requester</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Comment</th>{isAdmin && <th className="px-4 py-3" />}</tr></thead><tbody>{requests.map((request) => <tr className="border-t border-slate-100" key={request.id}><td className="px-4 py-3"><p className="font-semibold text-slate-900">{requestLabels[request.requestType]}</p><p className="mt-1 max-w-lg text-sm text-slate-500">{request.reason}</p></td><td className="px-4 py-3 text-sm">{getUserName(request.requestedBy)}</td><td className="px-4 py-3 text-sm">{dateLabel(request.createdAt)}</td><td className="px-4 py-3"><Badge>{request.status}</Badge></td><td className="px-4 py-3 text-sm text-slate-600">{request.reviewerComment ?? '—'}</td>{isAdmin && <td className="px-4 py-3 text-right">{request.status === 'Pending Approval' && <div className="flex justify-end gap-1"><button className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50" aria-label="Approve request" title="Approve" onClick={() => onReview({ request, decision: 'Approved' })}><Check className="h-4 w-4" /></button><button className="rounded-lg p-2 text-amber-700 hover:bg-amber-50" aria-label="Request changes" title="Request changes" onClick={() => onReview({ request, decision: 'Changes Requested' })}><ListFilter className="h-4 w-4" /></button><button className="rounded-lg p-2 text-red-700 hover:bg-red-50" aria-label="Reject request" title="Reject" onClick={() => onReview({ request, decision: 'Rejected' })}><X className="h-4 w-4" /></button></div>}</td>}</tr>)}</tbody></table></div> : <Empty title="Chưa có Scope Request" description="Yêu cầu scope mới sẽ xuất hiện trong danh sách này." />}</section>
}

function CoverageView({ assets, state, onAsset }: { assets: DataAsset[]; state: DemoState; onAsset: (assetId: string) => void }) {
  return <section className="panel overflow-hidden"><div className="panel-heading"><div><h2 className="font-bold text-slate-900">Governance Coverage trong scope</h2><p className="mt-1 text-sm text-slate-500">Metadata, DQ, policy, Data Product, schema và stewardship của mỗi Asset được giao.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-[.06em] text-slate-500"><tr><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Metadata</th><th className="px-4 py-3">DQ</th><th className="px-4 py-3">Policies</th><th className="px-4 py-3">Products</th><th className="px-4 py-3">Governance</th><th className="px-4 py-3" /></tr></thead><tbody>{assets.map((asset) => { const value = coverage(state, asset); return <tr className="border-t border-slate-100" key={asset.id}><td className="px-4 py-3"><p className="font-semibold text-slate-900">{asset.name}</p><p className="font-mono text-xs text-slate-500">{asset.code}</p></td><td className="px-4 py-3">{value.fields} field</td><td className="px-4 py-3"><span className={asset.dqScore < 90 ? 'font-bold text-amber-700' : 'font-bold text-emerald-700'}>{asset.dqScore}</span></td><td className="px-4 py-3">{value.policies}</td><td className="px-4 py-3">{value.products}</td><td className="px-4 py-3">{value.owner && value.steward ? <Badge>Complete</Badge> : <Badge>Incomplete</Badge>}</td><td className="px-4 py-3 text-right"><button className="rounded-lg p-2 text-teal hover:bg-teal/10" aria-label={'Mở Asset ' + asset.name} onClick={() => onAsset(asset.id)}><ChevronRight className="h-4 w-4" /></button></td></tr> })}</tbody></table></div></section>
}

export default ScopeStewardshipPage
