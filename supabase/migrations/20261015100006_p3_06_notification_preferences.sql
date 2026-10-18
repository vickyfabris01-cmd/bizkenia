-- supabase/migrations/20261015100006_p3_06_notification_preferences.sql — NEW FILE
--
-- AIM
-- Phase 3, step 6:
--  1. notification preferences: a person can switch a category of in-app alerts off. One trigger on
--     notifications drops switched-off alerts for every sender (notify, _note, _notify_staff ...), so
--     no function needs to know about preferences. Account and security alerts cannot be switched off.
--  2. notifications cleanup: two old rules let anyone whose profile named a tenant read or insert
--     that tenant's notifications. They are removed; people read and update only their own.
--  3. the "avatars" storage bucket: a public bucket where each person writes only inside their own folder.

create table if not exists notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('billing','requests','complaints','notices','messages','work','support')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
alter table notification_preferences enable row level security;
create policy notification_preferences_own on notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function notification_category(p_type text) returns text language sql immutable as $$
  select case p_type
    when 'billing' then 'billing' when 'payment' then 'billing'
    when 'rental_request' then 'requests' when 'offer' then 'requests' when 'tenancy' then 'requests'
    when 'invite' then 'requests' when 'transfer' then 'requests'
    when 'complaint' then 'complaints' when 'announcement' then 'notices' when 'message' then 'messages'
    when 'worker' then 'work' when 'ticket' then 'support'
    else null end;
$$;

create or replace function trg_notifications_preferences() returns trigger language plpgsql security definer set search_path = public as $$
declare v_cat text := notification_category(new.type);
begin
  if v_cat is not null and exists (select 1 from notification_preferences
                                    where user_id = new.user_id and category = v_cat and enabled = false) then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists trg_notifications_preferences on notifications;
create trigger trg_notifications_preferences before insert on notifications for each row execute function trg_notifications_preferences();

drop policy if exists notifications_manager_insert on notifications;
drop policy if exists notifications_select_own_tenant on notifications;
drop policy if exists notifications_delete_own on notifications;
create policy notifications_delete_own on notifications for delete to authenticated using (user_id = auth.uid());

-- avatars
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
drop policy if exists avatars_write on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
