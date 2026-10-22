// src/lib/api/shop.js — NEW FILE (Phase 5)
//
// AIM
// Everything the seller side of a shop asks of the database, grouped by screen. Every function
// returns { data, error } and never throws. Reads and simple edits use the tables (row-level
// security lets only the owner and managers of the business in). Stock changes call the database
// function record_shop_stock, and order steps call set_order_status, so stock can never go below
// zero and every order change is kept in its timeline. Error messages from those functions are
// plain English and are shown as they are. Product photos go to the public business-media bucket
// under <businessId>/products/.

import { supabase } from "../../config/supabase.js";

const wrap = ({ data, error }) => ({ data: data ?? null, error: error?.message || null });
const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet." };
const guard = (fn) => (...args) => (supabase ? fn(...args) : Promise.resolve(NOT_CONNECTED));
const text = (v) => (v == null ? null : String(v).trim() || null);
const num = (v) => (v === "" || v == null ? null : Number(v));

export const PHOTO_MAX_MB = 5; // the storage bucket refuses anything bigger
export const MAX_PHOTOS = 5;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const BUCKET = "business-media";

// ---- categories ------------------------------------------------------------------------
export const listCategories = guard(async (bid) =>
  wrap(await supabase.from("product_categories").select("*").eq("business_id", bid).order("sort_order").order("name")));

export const saveCategory = guard(async (bid, c) => {
  const row = { name: String(c.name || "").trim() };
  const q = c.id ? supabase.from("product_categories").update(row).eq("id", c.id) : supabase.from("product_categories").insert({ ...row, business_id: bid });
  const res = wrap(await q.select().single());
  if (res.error && /uq_product_category_name/.test(res.error)) res.error = "You already have a category with that name.";
  return res;
});

export const deleteCategory = guard(async (id) => wrap(await supabase.from("product_categories").delete().eq("id", id)));

// ---- products --------------------------------------------------------------------------
export const listProducts = guard(async (bid, { search = "", status = "", categoryId = "", limit = 24, offset = 0 } = {}) => {
  let q = supabase.from("products").select("*, category:product_categories(id, name)").eq("business_id", bid)
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (status) q = q.eq("status", status);
  if (categoryId) q = q.eq("category_id", categoryId);
  if (search.trim()) q = q.ilike("name", `%${search.trim().replace(/[%,]/g, " ")}%`);
  return wrap(await q);
});

export const saveProduct = guard(async (bid, p) => {
  const row = {
    name: String(p.name || "").trim(), description: text(p.description), category_id: p.category_id || null,
    price: Number(p.price), compare_at_price: num(p.compare_at_price), unit: text(p.unit) || "item", sku: text(p.sku),
    low_stock_level: Number(p.low_stock_level) || 0, images: p.images || [], status: p.status || "draft",
  };
  if (Number.isNaN(row.price) || row.price < 0) return { data: null, error: "Enter the price." };
  if (row.compare_at_price != null && row.compare_at_price <= row.price) return { data: null, error: "The old price must be higher than the price." };
  let q;
  if (p.id) q = supabase.from("products").update(row).eq("id", p.id);
  else q = supabase.from("products").insert({ ...row, business_id: bid, stock: Math.max(0, Math.floor(Number(p.stock) || 0)) });
  const res = wrap(await q.select().single());
  if (res.error && /uq_product_sku/.test(res.error)) res.error = "Another product already uses that SKU.";
  return res;
});

export const deleteProduct = guard(async (id) => wrap(await supabase.from("products").delete().eq("id", id)));

// photo: returns { data: { url } }
export const uploadProductPhoto = guard(async (bid, file) => {
  if (!TYPES[file.type]) return { data: null, error: "Use a JPG, PNG or WebP photo." };
  if (file.size > PHOTO_MAX_MB * 1024 * 1024) return { data: null, error: `Each photo must be under ${PHOTO_MAX_MB} MB.` };
  const path = `${bid}/products/${crypto.randomUUID()}.${TYPES[file.type]}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { data: null, error: up.error.message };
  return { data: { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl }, error: null };
});

// delete a product photo we uploaded (best effort; only inside this business's products/ folder)
export const removeProductPhoto = guard(async (bid, url) => {
  const marker = `/${BUCKET}/`;
  const i = (url || "").indexOf(marker);
  if (i < 0) return { data: null, error: null };
  const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  if (!path.startsWith(`${bid}/products/`)) return { data: null, error: null };
  await supabase.storage.from(BUCKET).remove([path]);
  return { data: null, error: null };
});

// ---- stock -----------------------------------------------------------------------------
export const moveShopStock = guard(async (productId, kind, quantity, note) =>
  wrap(await supabase.rpc("record_shop_stock", { p_product: productId, p_kind: kind, p_quantity: Math.floor(Number(quantity)), p_note: text(note) })));

export const listShopMovements = guard(async (productId, { limit = 50 } = {}) =>
  wrap(await supabase.from("shop_stock_movements").select("*").eq("product_id", productId).order("moved_at", { ascending: false }).limit(limit)));

// ---- orders ----------------------------------------------------------------------------
export const ORDER_GROUPS = {
  new: ["pending_payment", "paid"],
  processing: ["processing"],
  onway: ["shipped", "ready_for_pickup"],
  done: ["delivered"],
  cancelled: ["cancelled"],
};

export const listOrders = guard(async (bid, { group = "", search = "", limit = 25, offset = 0 } = {}) => {
  let q = supabase.from("orders").select("*").eq("business_id", bid).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (group && ORDER_GROUPS[group]) q = q.in("status", ORDER_GROUPS[group]);
  if (search.trim()) { const s = search.trim().replace(/[%,]/g, " "); q = q.or(`order_number.ilike.%${s}%,customer_name.ilike.%${s}%`); }
  return wrap(await q);
});

export const getOrder = guard(async (id) => {
  const [o, items, events] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("order_items").select("*").eq("order_id", id).order("name"),
    supabase.from("order_events").select("*").eq("order_id", id).order("created_at"),
  ]);
  if (o.error || !o.data) return { data: null, error: o.error?.message || "Order not found." };
  return { data: { ...o.data, items: items.data || [], events: events.data || [] }, error: items.error?.message || events.error?.message || null };
});

export const setOrderStatus = guard(async (id, status, note) =>
  wrap(await supabase.rpc("set_order_status", { p_order: id, p_status: status, p_note: text(note) })));

export const markOrderPaid = guard(async (id, receipt) =>
  wrap(await supabase.rpc("seller_mark_order_paid", { p_order: id, p_receipt: text(receipt) })));

// ---- customers -------------------------------------------------------------------------
export const listShopCustomers = guard(async (bid) =>
  wrap(await supabase.from("shop_customers").select("*").eq("business_id", bid).order("last_order_at", { ascending: false }).limit(200)));

// ---- settings --------------------------------------------------------------------------
export const DEFAULT_SETTINGS = { delivery_enabled: true, delivery_fee: 0, free_delivery_over: null, pickup_enabled: false, pickup_address: "", pay_on_delivery: false, delivery_note: "" };

export const getShopSettings = guard(async (bid) => {
  const res = wrap(await supabase.from("shop_settings").select("*").eq("business_id", bid).maybeSingle());
  return { data: { ...DEFAULT_SETTINGS, ...(res.data || {}) }, error: res.error };
});

export const saveShopSettings = guard(async (bid, s) => {
  if (!s.delivery_enabled && !s.pickup_enabled) return { data: null, error: "Switch on delivery, pickup or both." };
  const row = {
    business_id: bid, delivery_enabled: !!s.delivery_enabled, delivery_fee: Number(s.delivery_fee) || 0,
    free_delivery_over: num(s.free_delivery_over) || null, pickup_enabled: !!s.pickup_enabled,
    pickup_address: text(s.pickup_address), pay_on_delivery: !!s.pay_on_delivery, delivery_note: text(s.delivery_note),
  };
  return wrap(await supabase.from("shop_settings").upsert(row, { onConflict: "business_id" }).select().single());
});

// ---- M-Pesa (where customers' payments go) ----------------------------------------------
export const getShopMpesa = guard(async (bid) => wrap(await supabase.rpc("mpesa_status", { p_business: bid })));
export const saveShopMpesa = guard(async (bid, shortcode, passkey) =>
  wrap(await supabase.rpc("save_mpesa_details", { p_business: bid, p_shortcode: shortcode, p_passkey: text(passkey) })));

// ---- dashboard -------------------------------------------------------------------------
export const getShopOverview = guard(async (bid) => {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [prods, low, newOrders, recent, month] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", bid).eq("status", "active"),
    supabase.from("products").select("id, stock, low_stock_level").eq("business_id", bid).neq("status", "archived"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("business_id", bid).in("status", ["paid", "pending_payment"]),
    supabase.from("orders").select("*").eq("business_id", bid).order("created_at", { ascending: false }).limit(5),
    supabase.from("orders").select("total").eq("business_id", bid).neq("status", "cancelled").gte("created_at", since),
  ]);
  const err = [prods, low, newOrders, recent, month].find((r) => r.error);
  if (err) return { data: null, error: err.error.message };
  return {
    data: {
      activeProducts: prods.count || 0,
      lowStock: (low.data || []).filter((p) => Number(p.low_stock_level) > 0 && p.stock <= p.low_stock_level).length,
      newOrders: newOrders.count || 0,
      revenue30: (month.data || []).reduce((s, o) => s + Number(o.total || 0), 0),
      recent: recent.data || [],
      anyProducts: (low.data || []).length > 0,
    },
    error: null,
  };
});
