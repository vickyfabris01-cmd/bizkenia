-- Signed-out visitors browse live shops, and the read policies on products,
-- product_categories and shop_settings call shop_is_live(). The p5_08 hardening
-- pass revoked anon access because the name doesn't start with is_/can_/in_.
-- Give it back; the function is a read-only security definer check.
grant execute on function public.shop_is_live(uuid) to anon, authenticated;