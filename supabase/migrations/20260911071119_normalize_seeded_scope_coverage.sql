-- Normalize the original data-asset backfill after the canonical demo seed runs.
-- Only remove generated, unreferenced bootstrap domains created by the prior migration.

delete from public.data_domains domain
where domain.code like 'DOMAIN_%'
  and domain.description = 'Domain được nâng cấp từ DataAsset hiện có.'
  and not exists (select 1 from public.data_assets asset where asset.domain_id = domain.id)
  and not exists (select 1 from public.governance_scopes scope where scope.domain_id = domain.id)
  and not exists (select 1 from public.scope_change_requests request where request.target_domain_id = domain.id);

update public.data_assets
set governance_status = case id
  when '50000000-0000-4000-8000-000000000001'::uuid then 'Complete'
  when '50000000-0000-4000-8000-000000000002'::uuid then 'Complete'
  when '50000000-0000-4000-8000-000000000003'::uuid then 'Complete'
  when '50000000-0000-4000-8000-000000000004'::uuid then 'Incomplete'
  when '50000000-0000-4000-8000-000000000005'::uuid then 'Review Required'
  when '50000000-0000-4000-8000-000000000006'::uuid then 'Incomplete'
  else governance_status
end
where id in (
  '50000000-0000-4000-8000-000000000001'::uuid,
  '50000000-0000-4000-8000-000000000002'::uuid,
  '50000000-0000-4000-8000-000000000003'::uuid,
  '50000000-0000-4000-8000-000000000004'::uuid,
  '50000000-0000-4000-8000-000000000005'::uuid,
  '50000000-0000-4000-8000-000000000006'::uuid
);
