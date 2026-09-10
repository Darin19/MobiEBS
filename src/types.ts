export type Role = 'Admin tích hợp' | 'Data Steward' | 'Data Owner / Reviewer' | 'Ops' | 'Auditor'

export type EntityStatus =
  | 'Draft'
  | 'Active'
  | 'Paused'
  | 'Deprecated'
  | 'Pending Approval'
  | 'Approved'
  | 'Published'
  | 'Failed'
  | 'Success'
  | 'Processing'
  | 'Warning'
  | 'Healthy'
  | 'New'
  | 'Acknowledged'
  | 'In Progress'
  | 'Resolved'
  | 'Revoked'
  | 'Expired'

export interface BaseEntity {
  id: string
  createdAt: string
  updatedAt: string
}

export interface Organization extends BaseEntity {
  code: string
  name: string
  shortName: string
  organizationType: string
  contactPerson: string
  contactEmail: string
  ownerTeam: string
  status: EntityStatus
  note?: string
}

export interface IntegrationSystem extends BaseEntity {
  organizationId: string
  code: string
  name: string
  technology: string
  status: EntityStatus
  description?: string
}

export interface SystemEnvironment extends BaseEntity {
  systemId: string
  name: 'DEV' | 'UAT' | 'PROD'
  baseUrl: string
  networkZone: string
  status: EntityStatus
}

export interface Connector extends BaseEntity {
  systemEnvironmentId: string
  code: string
  name: string
  type: 'REST API' | 'SOAP' | 'Database' | 'SFTP/File' | 'Event' | 'OAuth2/OIDC'
  direction: 'Inbound' | 'Outbound' | 'Bidirectional'
  endpoint: string
  protocol: string
  timeout: number
  status: EntityStatus
  healthStatus: 'Healthy' | 'Warning' | 'Failed' | 'Unknown'
  lastLatencyMs?: number
  lastCheckedAt?: string
  secretRef: string
  maskedHint: string
  expiresAt?: string
}

export interface ConnectorTest extends BaseEntity {
  connectorId: string
  result: 'Success' | 'Failed'
  latencyMs: number
  checkedAt: string
  responseSample: string
}

export interface DataAsset extends BaseEntity {
  connectorId?: string
  code: string
  name: string
  role: 'Source' | 'Target' | 'Both'
  technology: string
  domain: string
  owner: string
  steward: string
  classification: 'Public' | 'Internal' | 'Restricted' | 'Sensitive' | 'Personal Data'
  status: EntityStatus
  dqScore: number
  description?: string
}

export interface AssetField extends BaseEntity {
  assetId: string
  technicalName: string
  businessName: string
  dataType: string
  nullable: boolean
  isPrimaryKey?: boolean
  classification: string
  definition: string
  dqScore: number
}

export interface SchemaSnapshot extends BaseEntity {
  assetId: string
  version: string
  changes: Array<{ kind: 'Added' | 'Removed' | 'Changed'; field: string; detail: string }>
}

export interface Pipeline extends BaseEntity {
  code: string
  name: string
  sourceAssetId: string
  targetAssetId: string
  syncMode: 'Full' | 'Incremental' | 'CDC'
  trigger: 'Manual' | 'Schedule' | 'Webhook' | 'Event' | 'File arrival'
  schedule?: string
  status: EntityStatus
  dqGate: boolean
  runtimeConfig: Record<string, unknown>
}

export interface PipelineMapping extends BaseEntity {
  pipelineId: string
  sourceField: string
  targetField: string
  dataType: string
  transformType: 'Direct' | 'Cast' | 'Lookup' | 'Default' | 'Expression' | 'Ignore'
  transformExpression?: string
  required: boolean
}

export interface DqRule extends BaseEntity {
  assetId: string
  name: string
  type: 'Required' | 'Unique' | 'Range' | 'Regex' | 'Reference' | 'Custom Label'
  threshold: number
  actionOnFail: 'Reject' | 'Quarantine' | 'Warn'
  status: EntityStatus
}

export interface DqRun extends BaseEntity {
  assetId: string
  score: number
  dimensionScores: Record<string, number>
  violations: number
  runAt: string
}

export interface Policy extends BaseEntity {
  code: string
  name: string
  assetId: string
  status: EntityStatus
  dataSteward: string
  owner: string
  purpose: string
  allowedOrganizations: string[]
  fieldAllowlist: string[]
  rowFilter: string
  masking: Record<string, 'None' | 'Partial' | 'Hash' | 'Redact'>
  minDqScore: number
  validFrom: string
  validTo?: string
  version: string
}

export interface PolicyField extends BaseEntity {
  policyId: string
  assetFieldId: string
  masking: 'None' | 'Partial' | 'Hash' | 'Redact'
}

export interface Approval extends BaseEntity {
  entityType: 'Policy' | 'Data Product' | 'Schema change' | 'Grant'
  entityId: string
  title: string
  status: 'Pending Approval' | 'Approved' | 'Rejected' | 'Changes Requested'
  requester: string
  reviewer?: string
  comment?: string
}

export interface DataProduct extends BaseEntity {
  code: string
  name: string
  assetId: string
  policyId: string
  owner: string
  steward: string
  description: string
  status: EntityStatus
}

export interface ProductVersion extends BaseEntity {
  dataProductId: string
  version: string
  compatibility: 'Compatible' | 'Breaking'
  contractSnapshot: Array<{ name: string; type: string; required: boolean; description: string }>
  status: EntityStatus
}

export interface Channel extends BaseEntity {
  dataProductId: string
  type: 'API Pull' | 'Push' | 'Event' | 'File' | 'DB View'
  name: string
  path: string
  environment: 'DEV' | 'UAT' | 'PROD'
  status: EntityStatus
  schedule?: string
}

export interface Consumer extends BaseEntity {
  organizationId: string
  systemId?: string
  name: string
  clientId: string
  credentialType: string
  secretRef: string
  maskedHint: string
  status: EntityStatus
}

export interface Grant extends BaseEntity {
  consumerId: string
  dataProductId: string
  productVersionId: string
  channelId: string
  purpose: string
  validFrom: string
  validTo: string
  quotaPerDay: number
  rateLimitPerMinute: number
  status: EntityStatus
}

export interface RuntimeRun extends BaseEntity {
  pipelineId?: string
  dataProductId?: string
  type: 'Pipeline' | 'API' | 'Push' | 'File' | 'Event'
  name: string
  correlationId: string
  source: string
  target: string
  status: EntityStatus
  startedAt: string
  endedAt?: string
  latencyMs?: number
  recordsRead: number
  recordsWritten: number
  recordsRejected: number
  parentRunId?: string
}

export interface RuntimeEvent extends BaseEntity {
  runtimeRunId: string
  step: string
  status: EntityStatus
  startedAt: string
  endedAt?: string
  message: string
  recordCount: number
}

export interface Alert extends BaseEntity {
  severity: 'High' | 'Medium' | 'Low'
  sourceType: string
  sourceId?: string
  message: string
  assignee?: string
  status: 'New' | 'Acknowledged' | 'In Progress' | 'Resolved'
}

export interface AuditLog extends BaseEntity {
  actor: string
  role: Role
  action: string
  entityType: string
  entityId: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  reason?: string
}

export interface DemoState {
  organizations: Organization[]
  systems: IntegrationSystem[]
  systemEnvironments: SystemEnvironment[]
  connectors: Connector[]
  connectorTests: ConnectorTest[]
  dataAssets: DataAsset[]
  assetFields: AssetField[]
  schemaSnapshots: SchemaSnapshot[]
  pipelines: Pipeline[]
  pipelineMappings: PipelineMapping[]
  dqRules: DqRule[]
  dqRuns: DqRun[]
  policies: Policy[]
  policyFields: PolicyField[]
  approvals: Approval[]
  dataProducts: DataProduct[]
  productVersions: ProductVersion[]
  channels: Channel[]
  consumers: Consumer[]
  grants: Grant[]
  runtimeRuns: RuntimeRun[]
  runtimeEvents: RuntimeEvent[]
  alerts: Alert[]
  auditLogs: AuditLog[]
}

export type EntityCollection = keyof DemoState
