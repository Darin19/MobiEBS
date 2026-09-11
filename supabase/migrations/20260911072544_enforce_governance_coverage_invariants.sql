create or replace function private.recalculate_asset_governance_status(target_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.data_assets asset
  set governance_status = case
    when asset.status = 'Deprecated' then 'Review Required'
    when exists (
      select 1
      from public.governance_scopes scope
      where scope.status = 'Paused'
        and private.scope_covers_asset(scope.id, asset.id)
    ) then 'Review Required'
    when exists (
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
    )
    and exists (
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
    ) then 'Complete'
    else 'Incomplete'
  end
  where asset.id = target_asset_id;
end;
$$;

create or replace function private.recalculate_scope_governance_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_scope_id uuid;
  asset_row record;
begin
  affected_scope_id := case
    when tg_table_name = 'governance_scopes' and tg_op = 'DELETE' then old.id
    when tg_table_name = 'governance_scopes' then new.id
    when tg_op = 'DELETE' then old.scope_id
    else new.scope_id
  end;

  for asset_row in
    select asset.id
    from public.data_assets asset
    where exists (
      select 1
      from public.governance_scopes scope
      where scope.id = affected_scope_id
        and private.scope_covers_asset(scope.id, asset.id)
    )
  loop
    perform private.recalculate_asset_governance_status(asset_row.id);
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists recalculate_scope_coverage_after_scope_mutation on public.governance_scopes;
create trigger recalculate_scope_coverage_after_scope_mutation
after insert or update of status, valid_from, valid_to, domain_id, asset_id or delete
on public.governance_scopes
for each row execute function private.recalculate_scope_governance_status();

drop trigger if exists recalculate_scope_coverage_after_assignment_mutation on public.stewardship_assignments;
create trigger recalculate_scope_coverage_after_assignment_mutation
after insert or update of assignment_role, status, is_primary, valid_from, valid_to, scope_id or delete
on public.stewardship_assignments
for each row execute function private.recalculate_scope_governance_status();

revoke all on function private.recalculate_asset_governance_status(uuid) from public, anon, authenticated;
revoke all on function private.recalculate_scope_governance_status() from public, anon, authenticated;

create or replace view public.governance_scope_conflicts
with (security_invoker = true)
as
select
  coverage.asset_id,
  array[]::uuid[] as assignment_ids,
  array[]::uuid[] as steward_user_ids,
  'MISSING_DATA_OWNER'::text as conflict_type
from public.governance_asset_coverage coverage
where not coverage.has_data_owner
union all
select
  coverage.asset_id,
  array[]::uuid[] as assignment_ids,
  array[]::uuid[] as steward_user_ids,
  'MISSING_PRIMARY_STEWARD'::text as conflict_type
from public.governance_asset_coverage coverage
where not coverage.has_primary_steward
union all
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
having count(distinct assignment.user_id) > 1
union all
select
  asset.id as asset_id,
  array_agg(assignment.id order by assignment.id) as assignment_ids,
  array_agg(assignment.user_id order by assignment.user_id) as steward_user_ids,
  'EXPIRED_SCOPE_ACCESS'::text as conflict_type
from public.data_assets asset
join public.governance_scopes scope
  on scope.status = 'Active'
 and scope.valid_to < current_date
 and private.scope_covers_asset(scope.id, asset.id)
join public.stewardship_assignments assignment
  on assignment.scope_id = scope.id
 and assignment.status = 'Active'
group by asset.id;

select private.recalculate_asset_governance_status(asset.id)
from public.data_assets asset;

grant select on public.governance_asset_coverage, public.governance_scope_conflicts, public.governance_scopes_expiring to authenticated;
