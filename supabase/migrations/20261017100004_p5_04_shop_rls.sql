-- supabase/migrations/20261017100004_p5_04_shop_rls.sql — NEW FILE
-- Phase 5 (shop), part 4: row-level security.
--   Catalogue: anyone can read ACTIVE products and the categories of an ACTIVE shop; the owner and
--              managers (is_staff) read and write everything of their own business.
--   Orders:    a customer sees only their own; staff see their business's; the super admin sees all.
--              Nobody writes orders or items directly: only place_order / set_order_status do.
--   Personal:  addresses, carts and wishlists belong to one person.

do $$
declare t text;
begin
  foreach t in array array['product_categories','products','shop_stock_movements','shop_settings','orders','order_items','order_events','addresses','carts','cart_items','wishlists']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- helper: is this business a live (approved) shop?
create or replace function shop_is_live(bid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from businesses where id = bid and status = 'active' and business_type = 'shop');
$$;
grant execute on function shop_is_live(uuid) to anon, authenticated;

-- catalogue
drop policy if exists product_categories_read on product_categories;
drop policy if exists product_categories_write on product_categories;
create policy product_categories_read on product_categories for select using (shop_is_live(business_id) or is_staff(business_id) or coalesce(is_super_admin(), false));
create policy product_categories_write on product_categories for all to authenticated using (is_staff(business_id)) with check (is_staff(business_id));

drop policy if exists products_read on products;
drop policy if exists products_write on products;
create policy products_read on products for select using ((status = 'active' and shop_is_live(business_id)) or is_staff(business_id) or coalesce(is_super_admin(), false));
create policy products_write on products for all to authenticated using (is_staff(business_id)) with check (is_staff(business_id));

drop policy if exists shop_stock_movements_read on shop_stock_movements;
create policy shop_stock_movements_read on shop_stock_movements for select to authenticated using (is_staff(business_id) or coalesce(is_super_admin(), false));

drop policy if exists shop_settings_read on shop_settings;
drop policy if exists shop_settings_write on shop_settings;
create policy shop_settings_read on shop_settings for select using (shop_is_live(business_id) or is_staff(business_id) or coalesce(is_super_admin(), false));
create policy shop_settings_write on shop_settings for all to authenticated using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- orders (read only; changes go through functions)
drop policy if exists orders_read on orders;
create policy orders_read on orders for select to authenticated using (customer_id = auth.uid() or is_staff(business_id) or coalesce(is_super_admin(), false));
drop policy if exists order_items_read on order_items;
create policy order_items_read on order_items for select to authenticated using (exists (select 1 from orders o where o.id = order_id and (o.customer_id = auth.uid() or is_staff(o.business_id) or coalesce(is_super_admin(), false))));
drop policy if exists order_events_read on order_events;
create policy order_events_read on order_events for select to authenticated using (exists (select 1 from orders o where o.id = order_id and (o.customer_id = auth.uid() or is_staff(o.business_id) or coalesce(is_super_admin(), false))));

-- personal data
drop policy if exists addresses_own on addresses;
create policy addresses_own on addresses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists carts_own on carts;
create policy carts_own on carts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists cart_items_own on cart_items;
create policy cart_items_own on cart_items for all to authenticated
  using (exists (select 1 from carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from carts c where c.id = cart_id and c.user_id = auth.uid()));
drop policy if exists wishlists_own on wishlists;
create policy wishlists_own on wishlists for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Shop customers of a business, worked out from its orders (staff only through the orders policy).
create or replace view shop_customers with (security_invoker = true) as
  select business_id, customer_id, max(customer_name) as name, max(customer_phone) as phone,
         count(*) filter (where status <> 'cancelled') as orders,
         coalesce(sum(total) filter (where status <> 'cancelled'), 0) as spent,
         max(created_at) as last_order_at
    from orders where customer_id is not null group by business_id, customer_id;
grant select on shop_customers to authenticated;
