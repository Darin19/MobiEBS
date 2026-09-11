-- Keep SELECT policy evaluation lean: FOR ALL also contributes a permissive
-- SELECT policy, so scope writes are deliberately split by operation.

drop policy if exists data_domains_admin_write on public.data_domains;
create policy data_domains_admin_insert on public.data_domains for insert to authenticated
with check ((select private.is_integration_admin()));
create policy data_domains_admin_update on public.data_domains for update to authenticated
using ((select private.is_integration_admin()))
with check ((select private.is_integration_admin()));
create policy data_domains_admin_delete on public.data_domains for delete to authenticated
using ((select private.is_integration_admin()));

drop policy if exists user_organization_roles_admin_write on public.user_organization_roles;
create policy user_organization_roles_admin_insert on public.user_organization_roles for insert to authenticated
with check ((select private.is_integration_admin()));
create policy user_organization_roles_admin_update on public.user_organization_roles for update to authenticated
using ((select private.is_integration_admin()))
with check ((select private.is_integration_admin()));
create policy user_organization_roles_admin_delete on public.user_organization_roles for delete to authenticated
using ((select private.is_integration_admin()));

drop policy if exists governance_scopes_admin_write on public.governance_scopes;
create policy governance_scopes_admin_insert on public.governance_scopes for insert to authenticated
with check ((select private.is_integration_admin()));
create policy governance_scopes_admin_update on public.governance_scopes for update to authenticated
using ((select private.is_integration_admin()))
with check ((select private.is_integration_admin()));
create policy governance_scopes_admin_delete on public.governance_scopes for delete to authenticated
using ((select private.is_integration_admin()));

drop policy if exists asset_fields_mutate_by_scope on public.asset_fields;
create policy asset_fields_insert_by_scope on public.asset_fields for insert to authenticated
with check ((select private.can_mutate_asset(asset_id)));
create policy asset_fields_update_by_scope on public.asset_fields for update to authenticated
using ((select private.can_mutate_asset(asset_id)))
with check ((select private.can_mutate_asset(asset_id)));
create policy asset_fields_delete_by_scope on public.asset_fields for delete to authenticated
using ((select private.can_mutate_asset(asset_id)));

drop policy if exists dq_rules_mutate_by_scope on public.dq_rules;
create policy dq_rules_insert_by_scope on public.dq_rules for insert to authenticated
with check ((select private.can_mutate_asset(asset_id)));
create policy dq_rules_update_by_scope on public.dq_rules for update to authenticated
using ((select private.can_mutate_asset(asset_id)))
with check ((select private.can_mutate_asset(asset_id)));
create policy dq_rules_delete_by_scope on public.dq_rules for delete to authenticated
using ((select private.can_mutate_asset(asset_id)));

drop policy if exists dq_runs_mutate_by_scope on public.dq_runs;
create policy dq_runs_insert_by_scope on public.dq_runs for insert to authenticated
with check ((select private.can_mutate_asset(asset_id)));
create policy dq_runs_update_by_scope on public.dq_runs for update to authenticated
using ((select private.can_mutate_asset(asset_id)))
with check ((select private.can_mutate_asset(asset_id)));
create policy dq_runs_delete_by_scope on public.dq_runs for delete to authenticated
using ((select private.can_mutate_asset(asset_id)));

drop policy if exists policies_mutate_by_scope on public.policies;
create policy policies_insert_by_scope on public.policies for insert to authenticated
with check ((select private.can_mutate_asset(asset_id)));
create policy policies_update_by_scope on public.policies for update to authenticated
using ((select private.can_mutate_asset(asset_id)))
with check ((select private.can_mutate_asset(asset_id)));
create policy policies_delete_by_scope on public.policies for delete to authenticated
using ((select private.can_mutate_asset(asset_id)));

drop policy if exists policy_fields_mutate_by_scope on public.policy_fields;
create policy policy_fields_insert_by_scope on public.policy_fields for insert to authenticated
with check (
  exists (
    select 1
    from public.policies policy
    where policy.id = policy_fields.policy_id
      and private.can_mutate_asset(policy.asset_id)
  )
);
create policy policy_fields_update_by_scope on public.policy_fields for update to authenticated
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
create policy policy_fields_delete_by_scope on public.policy_fields for delete to authenticated
using (
  exists (
    select 1
    from public.policies policy
    where policy.id = policy_fields.policy_id
      and private.can_mutate_asset(policy.asset_id)
  )
);

drop policy if exists data_products_mutate_by_scope on public.data_products;
create policy data_products_insert_by_scope on public.data_products for insert to authenticated
with check ((select private.can_mutate_asset(asset_id)));
create policy data_products_update_by_scope on public.data_products for update to authenticated
using ((select private.can_mutate_asset(asset_id)))
with check ((select private.can_mutate_asset(asset_id)));
create policy data_products_delete_by_scope on public.data_products for delete to authenticated
using ((select private.can_mutate_asset(asset_id)));
