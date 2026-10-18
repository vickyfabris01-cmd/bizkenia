-- supabase/migrations/20261015100007_p3_07_remove_legacy_roles.sql — NEW FILE
--
-- AIM
-- Phase 3, step 7: retire the old "one business per profile" access path.
-- Access to a business is now decided only by business_members (owner / manager / resident / worker).
-- This migration removes everything that still granted access through profiles.role or profiles.tenant_id:
--   * the role-switching functions and the unattached tenancy trigger function
--   * old row rules on profiles, businesses, floors, tenant_branding and notification_log
--   * old helper RPCs that wrote through the legacy model
-- profiles.role stays, but now means only the platform flag: 'super_admin' or an ordinary person.
-- The columns profiles.tenant_id and the legacy value set of profiles.role are NOT dropped here,
-- because the old pages behind VITE_ENABLE_LEGACY_PAGES (dev only) still select them; see docs/phase-3.

drop function if exists handle_tenancy_role_change() cascade;
drop function if exists elevate_to_client() cascade;
drop function if exists elevate_to_manager() cascade;
drop function if exists revert_to_visitor() cascade;
drop function if exists assign_role(uuid, text, uuid) cascade;
drop function if exists lookup_visitor_by_email(text) cascade;
drop function if exists broadcast_notification(uuid, uuid[], text, text, text, jsonb) cascade;
drop function if exists invite_worker(uuid, text, text, text, numeric, text) cascade;
drop function if exists regenerate_billing_for_client(uuid, uuid) cascade;
drop function if exists generate_first_billing_cycle() cascade;
drop function if exists get_invite_by_token(text) cascade;

drop policy if exists profiles_same_tenant on profiles;
drop policy if exists profiles_role_assignment_search on profiles;
drop policy if exists tenants_own_select on businesses;
drop policy if exists tenants_own_update on businesses;

drop policy if exists floors_manage on floors;
drop policy if exists floors_tenant on floors;
create policy floors_read on floors for select to authenticated using (is_member(tenant_id) or is_staff(tenant_id));
create policy floors_staff on floors for all to authenticated using (is_staff(tenant_id)) with check (is_staff(tenant_id));

drop policy if exists branding_insert on tenant_branding;
drop policy if exists branding_manage on tenant_branding;
create policy branding_staff on tenant_branding for all to authenticated using (is_staff(tenant_id)) with check (is_staff(tenant_id));

drop policy if exists notif_log_manager on notification_log;
create policy notif_log_staff on notification_log for select to authenticated using (is_staff(tenant_id));

-- the rental tables must not be readable through the old helper either
drop function if exists my_role() cascade;
drop function if exists my_tenant_id() cascade;
drop function if exists same_tenant(uuid) cascade;
