-- Phase 6 / 02 — let an account be deleted without losing the business's history.
--
-- Found by checking the live database: about 25 links to profiles / users were "NO ACTION", so deleting
-- any account that appears in rent payments, tenancies, invoices, complaints, workers and so on would
-- have been refused. They now blank the person and keep the record (the screens show "Deleted user").
-- The notification log is the person's own, so it goes with them. The link from a business to its owner
-- (businesses.owner_user_id) is left as it is on purpose: it stops anyone deleting an account that still
-- owns a business.
--
-- Existing constraint names are kept, because the app refers to them (for example
-- profiles!tenancies_client_id_fkey). Safe to run more than once.

do $$
declare r record; c record; v_name text;
begin
  for r in select * from (values
    ('businesses',        'approved_by',  'auth.users',      'set null'),
    ('platform_settings', 'updated_by',   'auth.users',      'set null'),
    ('profiles',          'tenant_id',    'public.businesses','set null'),
    ('manager_invites',   'invited_by',   'public.profiles', 'set null'),
    ('rental_requests',   'reviewed_by',  'public.profiles', 'set null'),
    ('rental_requests',   'requester_id', 'public.profiles', 'set null'),
    ('tenancies',         'approved_by',  'public.profiles', 'set null'),
    ('tenancies',         'client_id',    'public.profiles', 'set null'),
    ('room_transfers',    'approved_by',  'public.profiles', 'set null'),
    ('room_transfers',    'requested_by', 'public.profiles', 'set null'),
    ('billing_cycles',    'client_id',    'public.profiles', 'set null'),
    ('payments',          'recorded_by',  'public.profiles', 'set null'),
    ('payments',          'client_id',    'public.profiles', 'set null'),
    ('invoices',          'client_id',    'public.profiles', 'set null'),
    ('workers',           'user_id',      'public.profiles', 'set null'),
    ('worker_payments',   'recorded_by',  'public.profiles', 'set null'),
    ('attendance',        'recorded_by',  'public.profiles', 'set null'),
    ('complaints',        'assigned_to',  'public.profiles', 'set null'),
    ('complaints',        'submitted_by', 'public.profiles', 'set null'),
    ('complaint_messages','sender_id',    'public.profiles', 'set null'),
    ('notification_log',  'user_id',      'public.profiles', 'cascade')
  ) as t(tbl, col, ref, act) loop
    if to_regclass('public.' || r.tbl) is null then
      raise notice 'skipping %, table not found', r.tbl;
      continue;
    end if;
    v_name := null;
    for c in select con.conname
               from pg_constraint con
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
              where con.contype = 'f'
                and con.conrelid = ('public.' || r.tbl)::regclass
                and a.attname = r.col
                and con.confrelid = r.ref::regclass loop
      execute format('alter table public.%I drop constraint %I', r.tbl, c.conname);
      v_name := c.conname;
    end loop;
    if r.act = 'set null' then
      execute format('alter table public.%I alter column %I drop not null', r.tbl, r.col);
    end if;
    execute format('alter table public.%I add constraint %I foreign key (%I) references %s(id) on delete %s',
                   r.tbl, coalesce(v_name, r.tbl || '_' || r.col || '_fkey'), r.col, r.ref, r.act);
  end loop;
end $$;

-- The two account-deletion checks now also look at the business's own owner link, so nobody can slip
-- past them if the member row and the owner link ever disagree.
create or replace function public.account_delete_check() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_blocking jsonb; v_closed jsonb; v_ten int; v_orders int; v_admin boolean;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  v_admin := coalesce((select role = 'super_admin' from profiles where id = v_uid), false);

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'status', b.status)), '[]'::jsonb)
    into v_blocking
    from businesses b
   where b.status <> 'closed'
     and (b.owner_user_id = v_uid
          or exists (select 1 from business_members m where m.business_id = b.id and m.user_id = v_uid
                      and m.role = 'owner' and m.status = 'active'));

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'closed_at', b.closed_at)), '[]'::jsonb)
    into v_closed
    from businesses b
   where b.status = 'closed'
     and (b.owner_user_id = v_uid
          or exists (select 1 from business_members m where m.business_id = b.id and m.user_id = v_uid
                      and m.role = 'owner' and m.status = 'active'));

  select count(*) into v_ten from tenancies where client_id = v_uid and status = 'active';
  select count(*) into v_orders from orders
   where customer_id = v_uid and status in ('pending_payment','paid','processing','shipped','ready_for_pickup');

  return jsonb_build_object(
    'is_super_admin', v_admin,
    'owned_blocking', v_blocking,
    'owned_closed', v_closed,
    'active_tenancies', v_ten,
    'open_orders', v_orders,
    'can_delete', not v_admin and jsonb_array_length(v_blocking) = 0 and v_ten = 0);
end;
$$;
grant execute on function public.account_delete_check() to authenticated;

create or replace function public.account_delete_prepare(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_names text; v_purge jsonb; v_ten int;
begin
  if coalesce((select role = 'super_admin' from profiles where id = p_user), false) then
    raise exception 'A super admin account cannot be deleted here';
  end if;
  select string_agg(b.name, ', ') into v_names
    from businesses b
   where b.status <> 'closed'
     and (b.owner_user_id = p_user
          or exists (select 1 from business_members m where m.business_id = b.id and m.user_id = p_user
                      and m.role = 'owner' and m.status = 'active'));
  if v_names is not null then
    raise exception 'You still own: %. Hand it over to a manager or delete it first.', v_names;
  end if;
  select count(*) into v_ten from tenancies where client_id = p_user and status = 'active';
  if v_ten > 0 then
    raise exception 'You have an active tenancy. Ask the owner to end it before deleting your account.';
  end if;
  select coalesce(jsonb_agg(b.id), '[]'::jsonb) into v_purge
    from businesses b
   where b.status = 'closed'
     and (b.owner_user_id = p_user
          or exists (select 1 from business_members m where m.business_id = b.id and m.user_id = p_user
                      and m.role = 'owner' and m.status = 'active'));
  return jsonb_build_object('purge', v_purge);
end;
$$;
revoke all on function public.account_delete_prepare(uuid) from public, anon, authenticated;
grant execute on function public.account_delete_prepare(uuid) to service_role;
