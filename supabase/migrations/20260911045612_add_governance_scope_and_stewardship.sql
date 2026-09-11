-- Scope & stewardship governance model.
-- The browser demo continues to fall back to local seed data when no authenticated
-- Supabase session is available; these policies are the authoritative server guard.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.data_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  owner_user_id uuid,
  status text not null default 'Draft' check (status in ('Draft', 'Active', 'Paused', 'Deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists data_domains_organization_id_idx on public.data_domains (organization_id);
create index if not exists data_domains_organization_status_idx on public.data_domains (organization_id, status);

alter table public.data_assets
  add column if not exists owning_organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists custodian_organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists domain_id uuid references public.data_domains(id) on delete set null,
  add column if not exists governance_status text not null default 'Incomplete';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'data_assets_governance_status_check'
      and conrelid = 'public.data_assets'::regclass
  ) then
    alter table public.data_assets
      add constraint data_assets_governance_status_check
      check (governance_status in ('Complete', 'Incomplete', 'Review Required'));
  end if;
end;
$$;

update public.data_assets asset
set owning_organization_id = organization.id
from public.organizations organization
where asset.owning_organization_id is null
  and asset.owner = organization.name;

update public.data_assets asset
set custodian_organization_id = coalesce(
  (
    select system.organization_id
    from public.connectors connector
    join public.system_environments environment on environment.id = connector.system_environment_id
    join public.systems system on system.id = environment.system_id
    where connector.id = asset.connector_id
  ),
  asset.owning_organization_id
)
where asset.custodian_organization_id is null;

insert into public.data_domains (organization_id, code, name, description, status)
select distinct
  asset.owning_organization_id,
  'DOMAIN_' || substr(md5(asset.domain), 1, 10),
  asset.domain,
  'Domain được nâng cấp từ DataAsset hiện có.',
  'Active'
from public.data_assets asset
where asset.owning_organization_id is not null
  and nullif(trim(asset.domain), '') is not null
on conflict (organization_id, code) do nothing;

update public.data_assets asset
set domain_id = domain.id
from public.data_domains domain
where asset.domain_id is null
  and domain.organization_id = asset.owning_organization_id
  and domain.name = asset.domain;

create index if not exists data_assets_owning_organization_id_idx on public.data_assets (owning_organization_id);
create index if not exists data_assets_custodian_organization_id_idx on public.data_assets (custodian_organization_id);
create index if not exists data_assets_domain_id_idx on public.data_assets (domain_id);
create index if not exists data_assets_governance_gap_idx on public.data_assets (governance_status)
  where governance_status <> 'Complete';

create table if not exists public.user_organization_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('IntegrationAdmin', 'DataOwner', 'DataSteward', 'DelegateSteward', 'OrganizationViewer')),
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Suspended')),
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists user_organization_roles_user_org_role_idx
  on public.user_organization_roles (user_id, organization_id, role);
create unique index if not exists user_organization_roles_active_unique_idx
  on public.user_organization_roles (user_id, organization_id, role)
  where status = 'Active' and valid_to is null;

create table if not exists public.governance_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  scope_type text not null check (scope_type in ('Organization', 'Domain', 'Asset')),
  domain_id uuid references public.data_domains(id) on delete restrict,
  asset_id uuid references public.data_assets(id) on delete restrict,
  status text not null default 'Draft' check (status in ('Draft', 'Active', 'Paused', 'Expired', 'Revoked')),
  valid_from date not null default current_date,
  valid_to date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  check (
    (scope_type = 'Organization' and domain_id is null and asset_id is null)
    or (scope_type = 'Domain' and domain_id is not null and asset_id is null)
    or (scope_type = 'Asset' and asset_id is not null)
  )
);
create index if not exists governance_scopes_organization_status_idx
  on public.governance_scopes (organization_id, status, valid_to);
create index if not exists governance_scopes_domain_id_idx
  on public.governance_scopes (domain_id)
  where domain_id is not null;
create index if not exists governance_scopes_asset_id_idx
  on public.governance_scopes (asset_id)
  where asset_id is not null;
create unique index if not exists governance_scopes_active_identity_idx
  on public.governance_scopes (organization_id, scope_type, coalesce(domain_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(asset_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('Draft', 'Active', 'Paused');

create table if not exists public.stewardship_assignments (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references public.governance_scopes(id) on delete cascade,
  assignment_role text not null check (assignment_role in ('DataOwner', 'DataSteward', 'DelegateSteward')),
  user_id uuid not null,
  assigned_by uuid not null,
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  valid_from date not null default current_date,
  valid_to date,
  status text not null default 'Awaiting Acceptance' check (status in ('Assigned', 'Awaiting Acceptance', 'Accepted', 'Active', 'Rejected', 'Ended', 'Revoked', 'Expired')),
  is_primary boolean not null default false,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists stewardship_assignments_scope_id_idx on public.stewardship_assignments (scope_id);
create index if not exists stewardship_assignments_user_status_validity_idx
  on public.stewardship_assignments (user_id, status, valid_to);
create index if not exists stewardship_assignments_primary_steward_idx
  on public.stewardship_assignments (scope_id, user_id)
  where assignment_role = 'DataSteward' and is_primary and status = 'Active';

create table if not exists public.scope_change_requests (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid references public.governance_scopes(id) on delete set null,
  request_type text not null check (request_type in ('ADD_ASSET', 'REMOVE_ASSET', 'TRANSFER_STEWARD', 'CHANGE_OWNER', 'EXPAND_DOMAIN', 'REDUCE_DOMAIN', 'PAUSE_SCOPE', 'REACTIVATE_SCOPE')),
  requested_by uuid not null,
  target_user_id uuid,
  target_asset_id uuid references public.data_assets(id) on delete set null,
  target_domain_id uuid references public.data_domains(id) on delete set null,
  reason text not null,
  status text not null default 'Draft' check (status in ('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Changes Requested', 'Cancelled')),
  reviewer_id uuid,
  reviewer_comment text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scope_change_requests_scope_id_idx on public.scope_change_requests (scope_id);
create index if not exists scope_change_requests_requested_by_idx on public.scope_change_requests (requested_by, created_at desc);
create index if not exists scope_change_requests_pending_idx on public.scope_change_requests (created_at desc)
  where status = 'Pending Approval';

create table if not exists public.governance_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid references public.organizations(id) on delete set null,
  type text not null check (type in ('SCOPE_ASSIGNED', 'SCOPE_EXPIRING', 'REQUEST_DECIDED', 'SCOPE_PAUSED', 'STEWARDSHIP_TRANSFERRED', 'SCOPE_CONFLICT')),
  title text not null,
  detail text,
  entity_type text not null,
  entity_id uuid not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists governance_notifications_user_unread_idx
  on public.governance_notifications (user_id, created_at desc)
  where read_at is null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'data_domains',
    'user_organization_roles',
    'governance_scopes',
    'stewardship_assignments',
    'scope_change_requests',
    'governance_notifications'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'set_' || table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      'set_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end;
$$;

alter table public.audit_logs
  add column if not exists actor_user_id uuid,
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;
create index if not exists audit_logs_organization_created_at_idx
  on public.audit_logs (organization_id, created_at desc);

create or replace function private.scope_covers_asset(target_scope_id uuid, target_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.governance_scopes scope
    join public.data_assets asset on asset.id = target_asset_id
    where scope.id = target_scope_id
      and scope.organization_id = asset.owning_organization_id
      and (
        scope.scope_type = 'Organization'
        or (scope.scope_type = 'Domain' and scope.domain_id = asset.domain_id)
        or (scope.scope_type = 'Asset' and scope.asset_id = asset.id)
      )
  );
$$;

create or replace function private.is_integration_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.user_organization_roles role
      where role.user_id = (select auth.uid())
        and role.role = 'IntegrationAdmin'
        and role.status = 'Active'
        and role.valid_from <= current_date
        and (role.valid_to is null or role.valid_to >= current_date)
    );
$$;

create or replace function private.can_view_scope(target_scope_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_integration_admin()
    or exists (
      select 1
      from public.governance_scopes scope
      join public.stewardship_assignments assignment on assignment.scope_id = scope.id
      join public.user_organization_roles role
        on role.user_id = assignment.user_id
       and role.organization_id = scope.organization_id
      where scope.id = target_scope_id
        and assignment.user_id = (select auth.uid())
        and assignment.status = 'Active'
        and assignment.valid_from <= current_date
        and (assignment.valid_to is null or assignment.valid_to >= current_date)
        and role.status = 'Active'
        and role.valid_from <= current_date
        and (role.valid_to is null or role.valid_to >= current_date)
    )
    or exists (
      select 1
      from public.governance_scopes scope
      join public.user_organization_roles role on role.organization_id = scope.organization_id
      where scope.id = target_scope_id
        and role.user_id = (select auth.uid())
        and role.role = 'OrganizationViewer'
        and role.status = 'Active'
        and role.valid_from <= current_date
        and (role.valid_to is null or role.valid_to >= current_date)
    );
$$;

create or replace function private.can_view_asset(target_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_integration_admin()
    or exists (
      select 1
      from public.governance_scopes scope
      join public.stewardship_assignments assignment on assignment.scope_id = scope.id
      join public.user_organization_roles role
        on role.user_id = assignment.user_id
       and role.organization_id = scope.organization_id
      where assignment.user_id = (select auth.uid())
        and assignment.assignment_role in ('DataOwner', 'DataSteward', 'DelegateSteward')
        and assignment.status = 'Active'
        and assignment.valid_from <= current_date
        and (assignment.valid_to is null or assignment.valid_to >= current_date)
        and scope.status = 'Active'
        and scope.valid_from <= current_date
        and (scope.valid_to is null or scope.valid_to >= current_date)
        and role.status = 'Active'
        and role.valid_from <= current_date
        and (role.valid_to is null or role.valid_to >= current_date)
        and private.scope_covers_asset(scope.id, target_asset_id)
    );
$$;

create or replace function private.can_mutate_asset(target_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_integration_admin()
    or exists (
      select 1
      from public.governance_scopes scope
      join public.stewardship_assignments assignment on assignment.scope_id = scope.id
      join public.user_organization_roles role
        on role.user_id = assignment.user_id
       and role.organization_id = scope.organization_id
      where assignment.user_id = (select auth.uid())
        and assignment.assignment_role in ('DataSteward', 'DelegateSteward')
        and assignment.status = 'Active'
        and assignment.valid_from <= current_date
        and (assignment.valid_to is null or assignment.valid_to >= current_date)
        and scope.status = 'Active'
        and scope.valid_from <= current_date
        and (scope.valid_to is null or scope.valid_to >= current_date)
        and role.status = 'Active'
        and role.valid_from <= current_date
        and (role.valid_to is null or role.valid_to >= current_date)
        and private.scope_covers_asset(scope.id, target_asset_id)
    );
$$;

create or replace function private.can_view_domain(target_domain_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_integration_admin()
    or exists (
      select 1
      from public.governance_scopes scope
      where (scope.scope_type = 'Organization' or scope.domain_id = target_domain_id)
        and private.can_view_scope(scope.id)
    );
$$;

create or replace function private.can_view_audit_log(target_entity_type text, target_entity_id uuid, target_actor_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_integration_admin()
    or target_actor_user_id = (select auth.uid())
    or case target_entity_type
      when 'GovernanceScope' then private.can_view_scope(target_entity_id)
      when 'StewardshipAssignment' then exists (
        select 1 from public.stewardship_assignments assignment
        where assignment.id = target_entity_id and private.can_view_scope(assignment.scope_id)
      )
      when 'ScopeChangeRequest' then exists (
        select 1 from public.scope_change_requests request
        where request.id = target_entity_id
          and (request.requested_by = (select auth.uid()) or private.can_view_scope(request.scope_id))
      )
      when 'DataAsset' then private.can_view_asset(target_entity_id)
      else false
    end;
$$;

create or replace function private.validate_governance_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  resolved_organization_id uuid;
  resolved_asset_status text;
begin
  if new.scope_type = 'Domain' then
    select organization_id into resolved_organization_id
    from public.data_domains
    where id = new.domain_id;

    if resolved_organization_id is null or resolved_organization_id <> new.organization_id then
      raise exception 'Domain must belong to the scope organization';
    end if;
  elsif new.scope_type = 'Asset' then
    select owning_organization_id, status
      into resolved_organization_id, resolved_asset_status
    from public.data_assets
    where id = new.asset_id;

    if resolved_organization_id is null or resolved_organization_id <> new.organization_id then
      raise exception 'Asset must belong to the scope organization';
    end if;

    if tg_op = 'INSERT' and resolved_asset_status = 'Deprecated' then
      raise exception 'Cannot create a governance scope for a deprecated asset';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.validate_primary_steward_conflict()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assignment_role <> 'DataSteward'
    or not new.is_primary
    or new.status <> 'Active' then
    return new;
  end if;

  if exists (
    select 1
    from public.stewardship_assignments existing
    join public.governance_scopes existing_scope on existing_scope.id = existing.scope_id
    join public.governance_scopes new_scope on new_scope.id = new.scope_id
    where existing.id <> new.id
      and existing.assignment_role = 'DataSteward'
      and existing.is_primary
      and existing.status = 'Active'
      and existing.user_id <> new.user_id
      and existing_scope.status = 'Active'
      and new_scope.status = 'Active'
      and daterange(
        greatest(existing.valid_from, existing_scope.valid_from),
        least(coalesce(existing.valid_to, 'infinity'::date), coalesce(existing_scope.valid_to, 'infinity'::date)) + 1,
        '[)'
      ) && daterange(
        greatest(new.valid_from, new_scope.valid_from),
        least(coalesce(new.valid_to, 'infinity'::date), coalesce(new_scope.valid_to, 'infinity'::date)) + 1,
        '[)'
      )
      and exists (
        select 1
        from public.data_assets asset
        where private.scope_covers_asset(existing.scope_id, asset.id)
          and private.scope_covers_asset(new.scope_id, asset.id)
      )
  ) then
    raise exception 'A primary Data Steward is already active for at least one asset in this scope';
  end if;

  return new;
end;
$$;

create or replace function private.flag_data_asset_governance_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.owning_organization_id is distinct from new.owning_organization_id
    or old.domain_id is distinct from new.domain_id
    or new.status = 'Deprecated' then
    new.governance_status = 'Review Required';
  end if;
  return new;
end;
$$;

create or replace function private.audit_scope_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  action_name text;
  target_id uuid;
  target_organization_id uuid;
  actor_role text;
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
    target_id := old.id;
  else
    row_data := to_jsonb(new);
    target_id := new.id;
  end if;

  if tg_table_name = 'governance_scopes' then
    target_organization_id := (row_data ->> 'organization_id')::uuid;
    action_name := case
      when tg_op = 'INSERT' then 'CREATE_SCOPE'
      when row_data ->> 'status' = 'Paused' then 'PAUSE_SCOPE'
      when row_data ->> 'status' = 'Revoked' then 'REMOVE_ASSET'
      else 'UPDATE_SCOPE'
    end;
  elsif tg_table_name = 'stewardship_assignments' then
    select scope.organization_id into target_organization_id
    from public.governance_scopes scope
    where scope.id = (row_data ->> 'scope_id')::uuid;
    action_name := case
      when tg_op = 'INSERT' and row_data ->> 'assignment_role' = 'DataOwner' then 'ASSIGN_OWNER'
      when tg_op = 'INSERT' then 'ASSIGN_STEWARD'
      when row_data ->> 'status' = 'Active' and row_data ->> 'accepted_at' is not null then 'ACCEPT_STEWARDSHIP'
      when row_data ->> 'status' = 'Rejected' then 'REJECT_STEWARDSHIP'
      else 'UPDATE_SCOPE'
    end;
  else
    select scope.organization_id into target_organization_id
    from public.governance_scopes scope
    where scope.id = (row_data ->> 'scope_id')::uuid;
    action_name := case
      when tg_op = 'INSERT' then 'CREATE_SCOPE_REQUEST'
      when row_data ->> 'status' = 'Approved' then 'APPROVE_SCOPE_REQUEST'
      when row_data ->> 'status' = 'Rejected' then 'REJECT_SCOPE_REQUEST'
      else 'UPDATE_SCOPE_REQUEST'
    end;
  end if;

  select case role.role
    when 'IntegrationAdmin' then 'Admin tích hợp'
    when 'DataOwner' then 'Data Owner / Reviewer'
    when 'DataSteward' then 'Data Steward'
    else role.role
  end
  into actor_role
  from public.user_organization_roles role
  where role.user_id = (select auth.uid())
    and role.status = 'Active'
  order by role.created_at
  limit 1;

  insert into public.audit_logs (
    actor,
    actor_user_id,
    role,
    organization_id,
    action,
    entity_type,
    entity_id,
    before,
    after,
    reason
  )
  values (
    coalesce((select auth.jwt() ->> 'email'), (select auth.uid())::text, 'System'),
    (select auth.uid()),
    coalesce(actor_role, 'System'),
    target_organization_id,
    action_name,
    case tg_table_name
      when 'governance_scopes' then 'GovernanceScope'
      when 'stewardship_assignments' then 'StewardshipAssignment'
      else 'ScopeChangeRequest'
    end,
    target_id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    row_data ->> 'reason'
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_governance_scope on public.governance_scopes;
create trigger validate_governance_scope
before insert or update of organization_id, scope_type, domain_id, asset_id
on public.governance_scopes
for each row execute function private.validate_governance_scope();

drop trigger if exists validate_primary_steward_conflict on public.stewardship_assignments;
create trigger validate_primary_steward_conflict
before insert or update of scope_id, assignment_role, user_id, is_primary, status, valid_from, valid_to
on public.stewardship_assignments
for each row execute function private.validate_primary_steward_conflict();

drop trigger if exists flag_data_asset_governance_review on public.data_assets;
create trigger flag_data_asset_governance_review
before update of owning_organization_id, domain_id, status
on public.data_assets
for each row execute function private.flag_data_asset_governance_review();

drop trigger if exists audit_governance_scope_mutation on public.governance_scopes;
create trigger audit_governance_scope_mutation
after insert or update or delete on public.governance_scopes
for each row execute function private.audit_scope_mutation();

drop trigger if exists audit_stewardship_assignment_mutation on public.stewardship_assignments;
create trigger audit_stewardship_assignment_mutation
after insert or update or delete on public.stewardship_assignments
for each row execute function private.audit_scope_mutation();

drop trigger if exists audit_scope_change_request_mutation on public.scope_change_requests;
create trigger audit_scope_change_request_mutation
after insert or update or delete on public.scope_change_requests
for each row execute function private.audit_scope_mutation();

revoke all on function private.scope_covers_asset(uuid, uuid) from public, anon, authenticated;
revoke all on function private.is_integration_admin() from public, anon;
revoke all on function private.can_view_scope(uuid) from public, anon;
revoke all on function private.can_view_asset(uuid) from public, anon;
revoke all on function private.can_mutate_asset(uuid) from public, anon;
revoke all on function private.can_view_domain(uuid) from public, anon;
revoke all on function private.can_view_audit_log(text, uuid, uuid) from public, anon;
grant execute on function private.is_integration_admin() to authenticated;
grant execute on function private.can_view_scope(uuid) to authenticated;
grant execute on function private.can_view_asset(uuid) to authenticated;
grant execute on function private.can_mutate_asset(uuid) to authenticated;
grant execute on function private.can_view_domain(uuid) to authenticated;
grant execute on function private.can_view_audit_log(text, uuid, uuid) to authenticated;

alter table public.data_domains enable row level security;
alter table public.user_organization_roles enable row level security;
alter table public.governance_scopes enable row level security;
alter table public.stewardship_assignments enable row level security;
alter table public.scope_change_requests enable row level security;
alter table public.governance_notifications enable row level security;

drop policy if exists demo_full_access_data_assets on public.data_assets;
drop policy if exists demo_full_access_asset_fields on public.asset_fields;
drop policy if exists demo_full_access_dq_rules on public.dq_rules;
drop policy if exists demo_full_access_dq_runs on public.dq_runs;
drop policy if exists demo_full_access_policies on public.policies;
drop policy if exists demo_full_access_policy_fields on public.policy_fields;
drop policy if exists demo_full_access_data_products on public.data_products;
drop policy if exists demo_full_access_audit_logs on public.audit_logs;

alter table public.data_assets enable row level security;
alter table public.asset_fields enable row level security;
alter table public.dq_rules enable row level security;
alter table public.dq_runs enable row level security;
alter table public.policies enable row level security;
alter table public.policy_fields enable row level security;
alter table public.data_products enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table
  public.data_domains,
  public.user_organization_roles,
  public.governance_scopes,
  public.stewardship_assignments,
  public.scope_change_requests,
  public.governance_notifications,
  public.data_assets,
  public.asset_fields,
  public.dq_rules,
  public.dq_runs,
  public.policies,
  public.policy_fields,
  public.data_products,
  public.audit_logs
from anon, authenticated;

grant select, insert, update on public.data_domains to authenticated;
grant select, insert, update on public.user_organization_roles to authenticated;
grant select, insert, update on public.governance_scopes to authenticated;
grant select, insert, update on public.stewardship_assignments to authenticated;
grant select, insert, update on public.scope_change_requests to authenticated;
grant select, update on public.governance_notifications to authenticated;
grant select, insert, update on public.data_assets to authenticated;
grant select, insert, update on public.asset_fields to authenticated;
grant select, insert, update on public.dq_rules to authenticated;
grant select, insert, update on public.dq_runs to authenticated;
grant select, insert, update on public.policies to authenticated;
grant select, insert, update on public.policy_fields to authenticated;
grant select, insert, update on public.data_products to authenticated;
grant select on public.audit_logs to authenticated;

create policy data_domains_select_by_scope
on public.data_domains
for select
to authenticated
using ((select private.can_view_domain(id)));

create policy data_domains_admin_write
on public.data_domains
for all
to authenticated
using ((select private.is_integration_admin()))
with check ((select private.is_integration_admin()));

create policy user_organization_roles_select
on public.user_organization_roles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_integration_admin())
);

create policy user_organization_roles_admin_write
on public.user_organization_roles
for all
to authenticated
using ((select private.is_integration_admin()))
with check ((select private.is_integration_admin()));

create policy governance_scopes_select
on public.governance_scopes
for select
to authenticated
using (
  (select private.is_integration_admin())
  or (select private.can_view_scope(id))
);

create policy governance_scopes_admin_write
on public.governance_scopes
for all
to authenticated
using ((select private.is_integration_admin()))
with check ((select private.is_integration_admin()));

create policy stewardship_assignments_select
on public.stewardship_assignments
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_integration_admin())
  or (select private.can_view_scope(scope_id))
);

create policy stewardship_assignments_admin_or_acceptance_update
on public.stewardship_assignments
for update
to authenticated
using (
  (select private.is_integration_admin())
  or (
    user_id = (select auth.uid())
    and status in ('Assigned', 'Awaiting Acceptance')
  )
)
with check (
  (select private.is_integration_admin())
  or (
    user_id = (select auth.uid())
    and status in ('Accepted', 'Active', 'Rejected')
  )
);

create policy stewardship_assignments_admin_insert
on public.stewardship_assignments
for insert
to authenticated
with check ((select private.is_integration_admin()));

create policy scope_change_requests_select
on public.scope_change_requests
for select
to authenticated
using (
  requested_by = (select auth.uid())
  or (select private.is_integration_admin())
  or (scope_id is not null and (select private.can_view_scope(scope_id)))
);

create policy scope_change_requests_submit
on public.scope_change_requests
for insert
to authenticated
with check (
  requested_by = (select auth.uid())
  and scope_id is not null
  and (select private.can_view_scope(scope_id))
);

create policy scope_change_requests_update
on public.scope_change_requests
for update
to authenticated
using (
  (select private.is_integration_admin())
  or (requested_by = (select auth.uid()) and status in ('Draft', 'Changes Requested'))
)
with check (
  (select private.is_integration_admin())
  or (
    requested_by = (select auth.uid())
    and status in ('Draft', 'Pending Approval', 'Cancelled')
  )
);

create policy governance_notifications_select
on public.governance_notifications
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_integration_admin())
);

create policy governance_notifications_mark_read
on public.governance_notifications
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy data_assets_select_by_scope
on public.data_assets
for select
to authenticated
using ((select private.can_view_asset(id)));

create policy data_assets_admin_insert
on public.data_assets
for insert
to authenticated
with check ((select private.is_integration_admin()));

create policy data_assets_scope_update
on public.data_assets
for update
to authenticated
using ((select private.can_mutate_asset(id)))
with check ((select private.can_mutate_asset(id)));

create policy asset_fields_select_by_scope
on public.asset_fields
for select
to authenticated
using ((select private.can_view_asset(asset_id)));

create policy asset_fields_mutate_by_scope
on public.asset_fields
for all
to authenticated
using ((select private.can_mutate_asset(asset_id)))
with check ((select private.can_mutate_asset(asset_id)));

create policy dq_rules_select_by_scope
on public.dq_rules
for select
to authenticated
using ((select private.can_view_asset(asset_id)));

create policy dq_rules_mutate_by_scope
on public.dq_rules
for all
to authenticated
using ((select private.can_mutate_asset(asset_id)))
with check ((select private.can_mutate_asset(asset_id)));

create policy dq_runs_select_by_scope
on public.dq_runs
for select
to authenticated
using ((select private.can_view_asset(asset_id)));

create policy dq_runs_mutate_by_scope
on public.dq_runs
for all
to authenticated
using ((select private.can_mutate_asset(asset_id)))
with check ((select private.can_mutate_asset(asset_id)));

create policy policies_select_by_scope
on public.policies
for select
to authenticated
using ((select private.can_view_asset(asset_id)));

create policy policies_mutate_by_scope
on public.policies
for all
to authenticated
using ((select private.can_mutate_asset(asset_id)))
with check ((select private.can_mutate_asset(asset_id)));

create policy policy_fields_select_by_scope
on public.policy_fields
for select
to authenticated
using (
  exists (
    select 1
    from public.policies policy
    where policy.id = policy_fields.policy_id
      and private.can_view_asset(policy.asset_id)
  )
);

create policy policy_fields_mutate_by_scope
on public.policy_fields
for all
to authenticated
using (
  exists (
    select 1
    from public.policies policy
    where policy.id = policy_fields.policy_id
      and private.can_mutate_asset(policy.asset_id)
  )
)
with check (
  exists (
    select 1
    from public.policies policy
    where policy.id = policy_fields.policy_id
      and private.can_mutate_asset(policy.asset_id)
  )
);

create policy data_products_select_by_scope
on public.data_products
for select
to authenticated
using ((select private.can_view_asset(asset_id)));

create policy data_products_mutate_by_scope
on public.data_products
for all
to authenticated
using ((select private.can_mutate_asset(asset_id)))
with check ((select private.can_mutate_asset(asset_id)));

create policy audit_logs_select_by_scope
on public.audit_logs
for select
to authenticated
using ((select private.can_view_audit_log(entity_type, entity_id, actor_user_id)));

create or replace view public.governance_asset_coverage
with (security_invoker = true)
as
select
  asset.id as asset_id,
  asset.owning_organization_id,
  asset.domain_id,
  asset.governance_status,
  asset.classification,
  asset.dq_score,
  exists (
    select 1
    from public.stewardship_assignments assignment
    join public.governance_scopes scope on scope.id = assignment.scope_id
    where assignment.assignment_role = 'DataOwner'
      and assignment.status = 'Active'
      and assignment.valid_from <= current_date
      and (assignment.valid_to is null or assignment.valid_to >= current_date)
      and scope.status = 'Active'
      and scope.valid_from <= current_date
      and (scope.valid_to is null or scope.valid_to >= current_date)
      and private.scope_covers_asset(scope.id, asset.id)
  ) as has_data_owner,
  exists (
    select 1
    from public.stewardship_assignments assignment
    join public.governance_scopes scope on scope.id = assignment.scope_id
    where assignment.assignment_role = 'DataSteward'
      and assignment.is_primary
      and assignment.status = 'Active'
      and assignment.valid_from <= current_date
      and (assignment.valid_to is null or assignment.valid_to >= current_date)
      and scope.status = 'Active'
      and scope.valid_from <= current_date
      and (scope.valid_to is null or scope.valid_to >= current_date)
      and private.scope_covers_asset(scope.id, asset.id)
  ) as has_primary_steward,
  (select count(*) from public.asset_fields field where field.asset_id = asset.id) as field_count,
  (select count(*) from public.policies policy where policy.asset_id = asset.id) as policy_count,
  (select count(*) from public.data_products product where product.asset_id = asset.id) as product_count
from public.data_assets asset;

create or replace view public.governance_scope_conflicts
with (security_invoker = true)
as
select
  asset.id as asset_id,
  array_agg(assignment.id order by assignment.id) as assignment_ids,
  array_agg(assignment.user_id order by assignment.user_id) as steward_user_ids,
  'PRIMARY_STEWARD_OVERLAP'::text as conflict_type
from public.data_assets asset
join public.governance_scopes scope
  on scope.status = 'Active'
 and scope.valid_from <= current_date
 and (scope.valid_to is null or scope.valid_to >= current_date)
 and private.scope_covers_asset(scope.id, asset.id)
join public.stewardship_assignments assignment
  on assignment.scope_id = scope.id
 and assignment.assignment_role = 'DataSteward'
 and assignment.is_primary
 and assignment.status = 'Active'
 and assignment.valid_from <= current_date
 and (assignment.valid_to is null or assignment.valid_to >= current_date)
group by asset.id
having count(distinct assignment.user_id) > 1;

create or replace view public.governance_scopes_expiring
with (security_invoker = true)
as
select scope.*
from public.governance_scopes scope
where scope.status = 'Active'
  and scope.valid_to between current_date and current_date + 30;
