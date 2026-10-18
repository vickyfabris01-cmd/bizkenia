-- supabase/migrations/20261016100003_p4_03_farm_money_tasks.sql — NEW FILE
-- Phase 4: farm income, farm expenses, and tasks with reminders.

create table if not exists farm_income (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  source text not null default 'crop_sale' check (source in ('crop_sale','livestock_sale','other')),
  amount numeric not null check (amount > 0),
  income_date date not null default current_date,
  crop_id uuid references crops(id) on delete set null,
  group_id uuid references livestock_groups(id) on delete set null,
  description text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_farm_income_business_date on farm_income (business_id, income_date desc);

create table if not exists farm_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category text not null default 'other' check (category in ('seeds','fertiliser','chemicals','labour','feed','equipment','fuel','transport','other')),
  amount numeric not null check (amount > 0),
  expense_date date not null default current_date,
  crop_id uuid references crops(id) on delete set null,
  description text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_farm_expenses_business_date on farm_expenses (business_id, expense_date desc);

create table if not exists farm_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  due_date date,
  status text not null default 'open' check (status in ('open','done')),
  field_id uuid references farm_fields(id) on delete set null,
  crop_id uuid references crops(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,
  notes text,
  completed_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_farm_tasks_business on farm_tasks (business_id, status, due_date);

-- Tell the owner and managers when a task is due today or has slipped past its date (once per task per day).
-- The farm screens call this when staff open the dashboard or the tasks page.
create or replace function remind_farm_tasks(p_business uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare t farm_tasks; n integer := 0;
begin
  perform _need_staff(p_business);
  for t in select * from farm_tasks where business_id = p_business and status = 'open' and due_date is not null and due_date <= current_date loop
    if not exists (select 1 from notifications where tenant_id = p_business and type = 'system'
                   and data->>'farm_task' = t.id::text and created_at::date = current_date) then
      insert into notifications (user_id, tenant_id, type, title, body, link, data)
      select m.user_id, p_business, 'system',
             case when t.due_date < current_date then 'Task overdue: ' else 'Task due today: ' end || t.title,
             'Open Tasks to mark it done.', '/app/' || _slug(p_business) || '/tasks', jsonb_build_object('farm_task', t.id)
        from business_members m
       where m.business_id = p_business and m.status = 'active' and m.role in ('owner','manager');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function remind_farm_tasks(uuid) from public, anon;
grant execute on function remind_farm_tasks(uuid) to authenticated;
