-- MobiESB demo schema
-- This is intentionally a demo access model: RLS is enabled, while anon/authenticated
-- policies allow CRUD so the browser-only demo can work without Supabase Auth.
-- Do not reuse these broad policies in a production project.

create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  short_name text not null,
  organization_type text not null,
  contact_person text not null,
  contact_email text not null,
  owner_team text not null,
  status text not null default 'Draft',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.systems (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null unique,
  name text not null,
  technology text not null,
  status text not null default 'Draft',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index systems_organization_id_idx on public.systems (organization_id);

create table public.system_environments (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.systems(id) on delete cascade,
  name text not null check (name in ('DEV', 'UAT', 'PROD')),
  base_url text not null,
  network_zone text not null,
  status text not null default 'Draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (system_id, name)
);
create index system_environments_system_id_idx on public.system_environments (system_id);

create table public.connectors (
  id uuid primary key default gen_random_uuid(),
  system_environment_id uuid not null references public.system_environments(id) on delete restrict,
  code text not null unique,
  name text not null,
  type text not null,
  direction text not null check (direction in ('Inbound', 'Outbound', 'Bidirectional')),
  endpoint text not null,
  protocol text not null,
  timeout integer not null check (timeout > 0),
  status text not null default 'Draft',
  health_status text not null default 'Unknown',
  last_latency_ms integer,
  last_checked_at timestamptz,
  secret_ref text not null,
  masked_hint text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index connectors_system_environment_id_idx on public.connectors (system_environment_id);
create index connectors_status_idx on public.connectors (status);

create table public.connector_tests (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.connectors(id) on delete cascade,
  result text not null check (result in ('Success', 'Failed')),
  latency_ms integer not null check (latency_ms >= 0),
  checked_at timestamptz not null default now(),
  response_sample text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index connector_tests_connector_id_checked_at_idx on public.connector_tests (connector_id, checked_at desc);

create table public.data_assets (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid references public.connectors(id) on delete set null,
  code text not null unique,
  name text not null,
  role text not null check (role in ('Source', 'Target', 'Both')),
  technology text not null,
  domain text not null,
  owner text not null,
  steward text not null,
  classification text not null,
  status text not null default 'Draft',
  dq_score integer not null default 0 check (dq_score between 0 and 100),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index data_assets_connector_id_idx on public.data_assets (connector_id);
create index data_assets_domain_idx on public.data_assets (domain);

create table public.asset_fields (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.data_assets(id) on delete cascade,
  technical_name text not null,
  business_name text not null,
  data_type text not null,
  nullable boolean not null default true,
  is_primary_key boolean not null default false,
  classification text not null,
  definition text not null,
  dq_score integer not null default 0 check (dq_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, technical_name)
);
create index asset_fields_asset_id_idx on public.asset_fields (asset_id);

create table public.schema_snapshots (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.data_assets(id) on delete cascade,
  version text not null,
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, version)
);
create index schema_snapshots_asset_id_idx on public.schema_snapshots (asset_id);

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  source_asset_id uuid not null references public.data_assets(id) on delete restrict,
  target_asset_id uuid not null references public.data_assets(id) on delete restrict,
  sync_mode text not null check (sync_mode in ('Full', 'Incremental', 'CDC')),
  trigger text not null check (trigger in ('Manual', 'Schedule', 'Webhook', 'Event', 'File arrival')),
  schedule text,
  status text not null default 'Draft',
  dq_gate boolean not null default true,
  runtime_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_asset_id <> target_asset_id)
);
create index pipelines_source_asset_id_idx on public.pipelines (source_asset_id);
create index pipelines_target_asset_id_idx on public.pipelines (target_asset_id);
create index pipelines_status_idx on public.pipelines (status);

create table public.pipeline_mappings (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  source_field text not null,
  target_field text not null,
  data_type text not null,
  transform_type text not null check (transform_type in ('Direct', 'Cast', 'Lookup', 'Default', 'Expression', 'Ignore')),
  transform_expression text,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, source_field, target_field)
);
create index pipeline_mappings_pipeline_id_idx on public.pipeline_mappings (pipeline_id);

create table public.dq_rules (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.data_assets(id) on delete cascade,
  name text not null,
  type text not null check (type in ('Required', 'Unique', 'Range', 'Regex', 'Reference', 'Custom Label')),
  threshold integer not null check (threshold between 0 and 100),
  action_on_fail text not null check (action_on_fail in ('Reject', 'Quarantine', 'Warn')),
  status text not null default 'Draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dq_rules_asset_id_idx on public.dq_rules (asset_id);

create table public.dq_runs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.data_assets(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  dimension_scores jsonb not null default '{}'::jsonb,
  violations integer not null default 0 check (violations >= 0),
  run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dq_runs_asset_id_run_at_idx on public.dq_runs (asset_id, run_at desc);

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  asset_id uuid not null references public.data_assets(id) on delete restrict,
  status text not null default 'Draft',
  data_steward text not null,
  owner text not null,
  purpose text not null default '',
  allowed_organizations text[] not null default '{}'::text[],
  field_allowlist text[] not null default '{}'::text[],
  row_filter text not null default 'true',
  masking jsonb not null default '{}'::jsonb,
  min_dq_score integer not null default 0 check (min_dq_score between 0 and 100),
  valid_from date not null default current_date,
  valid_to date,
  version text not null default '1.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index policies_asset_id_idx on public.policies (asset_id);
create index policies_status_idx on public.policies (status);

create table public.policy_fields (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  asset_field_id uuid not null references public.asset_fields(id) on delete restrict,
  masking text not null default 'None' check (masking in ('None', 'Partial', 'Hash', 'Redact')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (policy_id, asset_field_id)
);
create index policy_fields_policy_id_idx on public.policy_fields (policy_id);
create index policy_fields_asset_field_id_idx on public.policy_fields (asset_field_id);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  title text not null,
  status text not null default 'Pending Approval',
  requester text not null,
  reviewer text,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index approvals_entity_type_entity_id_idx on public.approvals (entity_type, entity_id);
create index approvals_status_idx on public.approvals (status);

create table public.data_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  asset_id uuid not null references public.data_assets(id) on delete restrict,
  policy_id uuid not null references public.policies(id) on delete restrict,
  owner text not null,
  steward text not null,
  description text not null default '',
  status text not null default 'Draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index data_products_asset_id_idx on public.data_products (asset_id);
create index data_products_policy_id_idx on public.data_products (policy_id);
create index data_products_status_idx on public.data_products (status);

create table public.product_versions (
  id uuid primary key default gen_random_uuid(),
  data_product_id uuid not null references public.data_products(id) on delete cascade,
  version text not null,
  compatibility text not null check (compatibility in ('Compatible', 'Breaking')),
  contract_snapshot jsonb not null default '[]'::jsonb,
  status text not null default 'Draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (data_product_id, version)
);
create index product_versions_data_product_id_idx on public.product_versions (data_product_id);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  data_product_id uuid not null references public.data_products(id) on delete cascade,
  type text not null check (type in ('API Pull', 'Push', 'Event', 'File', 'DB View')),
  name text not null,
  path text not null,
  environment text not null check (environment in ('DEV', 'UAT', 'PROD')),
  status text not null default 'Draft',
  schedule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (data_product_id, name)
);
create index channels_data_product_id_idx on public.channels (data_product_id);

create table public.consumers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  system_id uuid references public.systems(id) on delete set null,
  name text not null,
  client_id text not null unique,
  credential_type text not null,
  secret_ref text not null,
  masked_hint text not null,
  status text not null default 'Draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consumers_organization_id_idx on public.consumers (organization_id);
create index consumers_system_id_idx on public.consumers (system_id);

create table public.grants (
  id uuid primary key default gen_random_uuid(),
  consumer_id uuid not null references public.consumers(id) on delete restrict,
  data_product_id uuid not null references public.data_products(id) on delete restrict,
  product_version_id uuid not null references public.product_versions(id) on delete restrict,
  channel_id uuid not null references public.channels(id) on delete restrict,
  purpose text not null,
  valid_from date not null,
  valid_to date not null,
  quota_per_day integer not null check (quota_per_day >= 0),
  rate_limit_per_minute integer not null check (rate_limit_per_minute >= 0),
  status text not null default 'Pending Approval',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to >= valid_from)
);
create index grants_consumer_id_idx on public.grants (consumer_id);
create index grants_data_product_id_idx on public.grants (data_product_id);
create index grants_product_version_id_idx on public.grants (product_version_id);
create index grants_channel_id_idx on public.grants (channel_id);
create index grants_status_valid_to_idx on public.grants (status, valid_to);

create table public.runtime_runs (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid references public.pipelines(id) on delete set null,
  data_product_id uuid references public.data_products(id) on delete set null,
  type text not null check (type in ('Pipeline', 'API', 'Push', 'File', 'Event')),
  name text not null,
  correlation_id text not null unique,
  source text not null,
  target text not null,
  status text not null default 'Processing',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  records_read integer not null default 0 check (records_read >= 0),
  records_written integer not null default 0 check (records_written >= 0),
  records_rejected integer not null default 0 check (records_rejected >= 0),
  parent_run_id uuid references public.runtime_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index runtime_runs_pipeline_id_idx on public.runtime_runs (pipeline_id);
create index runtime_runs_data_product_id_idx on public.runtime_runs (data_product_id);
create index runtime_runs_parent_run_id_idx on public.runtime_runs (parent_run_id);
create index runtime_runs_status_started_at_idx on public.runtime_runs (status, started_at desc);

create table public.runtime_events (
  id uuid primary key default gen_random_uuid(),
  runtime_run_id uuid not null references public.runtime_runs(id) on delete cascade,
  step text not null,
  status text not null default 'Draft',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  message text not null,
  record_count integer not null default 0 check (record_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index runtime_events_runtime_run_id_started_at_idx on public.runtime_events (runtime_run_id, started_at);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('High', 'Medium', 'Low')),
  source_type text not null,
  source_id uuid,
  message text not null,
  assignee text,
  status text not null default 'New' check (status in ('New', 'Acknowledged', 'In Progress', 'Resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index alerts_status_severity_idx on public.alerts (status, severity);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  role text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audit_logs_entity_type_entity_id_created_at_idx on public.audit_logs (entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_updated_at() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'systems', 'system_environments', 'connectors', 'connector_tests',
    'data_assets', 'asset_fields', 'schema_snapshots', 'pipelines', 'pipeline_mappings',
    'dq_rules', 'dq_runs', 'policies', 'policy_fields', 'approvals', 'data_products',
    'product_versions', 'channels', 'consumers', 'grants', 'runtime_runs', 'runtime_events',
    'alerts', 'audit_logs'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'set_' || table_name || '_updated_at', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', table_name);
    execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)', 'demo_full_access_' || table_name, table_name);
  end loop;
end;
$$;
