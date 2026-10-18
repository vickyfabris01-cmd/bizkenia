-- supabase/migrations/20261016100006_p4_06_enable_agriculture.sql — NEW FILE
-- Phase 4: turn the Agriculture module on. The super admin can still switch it off again in
-- Admin > Settings; this only changes the starting value.

update platform_settings
   set value = jsonb_set(coalesce(value, '{}'::jsonb), '{agriculture}', 'true'::jsonb, true), updated_at = now()
 where key = 'modules';

insert into platform_settings (key, value, is_public)
select 'modules', '{"rental":true,"agriculture":true,"shop":false}'::jsonb, true
 where not exists (select 1 from platform_settings where key = 'modules');
