-- supabase/migrations/20261016100005_p4_05_report_views.sql — NEW FILE
-- Phase 4: the numbers behind the Reports screen. Every view runs with the caller's own rights
-- (security_invoker), so row-level security on the tables underneath still decides who sees what.
-- The screens always filter by business_id.

-- Rental: money billed per month (invoices by the month their period starts)
create or replace view report_rental_monthly with (security_invoker = true) as
select tenant_id as business_id, date_trunc('month', period_start)::date as month,
       sum(amount_due + coalesce(late_fee, 0)) as billed, count(*) as invoices
from billing_cycles where status not in ('cancelled','waived')
group by tenant_id, date_trunc('month', period_start);

-- Rental: money collected per month (confirmed payments)
create or replace view report_rental_collected with (security_invoker = true) as
select tenant_id as business_id, date_trunc('month', coalesce(paid_at, created_at))::date as month, sum(amount) as collected
from payments where payment_status = 'confirmed' group by 1, 2;

-- Rental: rooms per building by status
create or replace view report_rental_occupancy with (security_invoker = true) as
select r.tenant_id as business_id, bl.id as building_id, bl.name as building,
       count(*) as rooms,
       count(*) filter (where r.status = 'occupied') as occupied,
       count(*) filter (where r.status = 'reserved') as reserved,
       count(*) filter (where r.status = 'available') as available,
       count(*) filter (where r.status = 'maintenance') as maintenance
from rooms r join buildings bl on bl.id = r.building_id
group by r.tenant_id, bl.id, bl.name;

-- Rental: invoices by status
create or replace view report_billing_status with (security_invoker = true) as
select tenant_id as business_id, status, count(*) as invoices,
       sum(amount_due + coalesce(late_fee, 0)) as billed, sum(coalesce(amount_paid, 0)) as paid, sum(coalesce(balance, 0)) as balance
from billing_cycles group by tenant_id, status;

-- Rental: what the workforce cost, per month
create or replace view report_worker_costs with (security_invoker = true) as
select tenant_id as business_id, date_trunc('month', paid_at)::date as month, count(distinct worker_id) as workers, sum(amount) as paid
from worker_payments where payment_status = 'paid' and paid_at is not null group by 1, 2;

-- Farm: income and costs per month
create or replace view report_farm_monthly with (security_invoker = true) as
select business_id, month, sum(income) as income, sum(cost) as cost from (
  select business_id, date_trunc('month', income_date)::date as month, amount as income, 0::numeric as cost from farm_income
  union all
  select business_id, date_trunc('month', expense_date)::date, 0, amount from farm_expenses
) x group by business_id, month;

-- Farm: cost by category
create or replace view report_farm_costs with (security_invoker = true) as
select business_id, category, sum(amount) as cost, count(*) as entries from farm_expenses group by business_id, category;

-- Farm: yield per crop
create or replace view report_farm_yield with (security_invoker = true) as
select c.business_id, c.id as crop_id, c.name as crop, f.name as field, coalesce(c.area_ha, f.area_ha) as area_ha,
       coalesce(sum(h.quantity_kg), 0) as harvested_kg,
       case when coalesce(c.area_ha, f.area_ha) > 0 then round(coalesce(sum(h.quantity_kg), 0) / coalesce(c.area_ha, f.area_ha), 1) end as kg_per_ha,
       coalesce((select sum(e.amount) from farm_expenses e where e.crop_id = c.id), 0) as cost,
       coalesce((select sum(i.amount) from farm_income i where i.crop_id = c.id), 0) as income
from crops c join farm_fields f on f.id = c.field_id left join harvests h on h.crop_id = c.id
group by c.business_id, c.id, c.name, f.name, c.area_ha, f.area_ha;

grant select on report_rental_monthly, report_rental_collected, report_rental_occupancy, report_billing_status, report_worker_costs,
  report_farm_monthly, report_farm_costs, report_farm_yield to authenticated;
revoke all on report_rental_monthly, report_rental_collected, report_rental_occupancy, report_billing_status, report_worker_costs,
  report_farm_monthly, report_farm_costs, report_farm_yield from anon;
