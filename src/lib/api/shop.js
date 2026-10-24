// src/lib/api/shop.js — MODIFIED (listings from holdings, sales recorded by hand, field to store)
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
  row.available_until = p.available_until || null;
  const linked = Boolean(p.source);
  if (linked) {
    const [kind, id] = String(p.source).split(":");
    row.source_kind = kind; row.source_id = id; row.per_unit = Number(p.per_unit) > 0 ? Number(p.per_unit) : 1;
  }
  const qty = Math.max(0, Math.floor(Number(p.stock) || 0));
  let res;
  if (p.id) {
    res = wrap(await supabase.from("products").update(row).eq("id", p.id).select().single());
    if (!res.error) {
      // how much is on sale is changed by the database function, so it can check what the holding has
      const r2 = await setListing(p.id, qty, !linked && p.list_all !== false);
      if (r2.error) return r2;
    }
  } else {
    const store = Math.max(0, Math.floor(Number(p.store_quantity) || 0));
    const listAll = p.list_all !== false;
    const stock = linked ? qty : (listAll ? store : Math.min(qty, store));
    res = wrap(await supabase.from("products").insert({ ...row, business_id: bid, stock, store_quantity: linked ? 0 : store, list_all: linked ? true : listAll }).select().single());
  }
  if (res.error && /uq_product_sku/.test(res.error)) res.error = "Another product already uses that SKU.";
  return res;
});

// How much of a product is on sale. For a product that is its own store, listAll lists everything it has.
export const setListing = guard(async (id, quantity, listAll = false) =>
  wrap(await supabase.rpc("set_listing", { p_product: id, p_quantity: listAll ? null : Math.floor(Number(quantity) || 0), p_list_all: Boolean(listAll) })));

// What a farm holds that can be put on sale: store items, crops in the field and livestock groups,
// each with how much is on hand, how much is already offered, and how much is still free to list.
export const listSources = guard(async (bid) => {
  const [items, crops, groups, listings] = await Promise.all([
    supabase.from("farm_inventory_items").select("id, name, category, unit, quantity").eq("business_id", bid).order("name"),
    supabase.from("crops").select("id, name, status, field_quantity, field_unit").eq("business_id", bid).order("name"),
    supabase.from("livestock_groups").select("id, name, species, head_count, animal_class").eq("business_id", bid).order("name"),
    supabase.from("products").select("source_kind, source_id, stock, per_unit").eq("business_id", bid).eq("status", "active").not("source_kind", "is", null),
  ]);
  const err = [items, crops, groups, listings].find((r) => r.error);
  if (err) return { data: null, error: err.error.message };
  const used = {};
  for (const l of listings.data || []) used[`${l.source_kind}:${l.source_id}`] = (used[`${l.source_kind}:${l.source_id}`] || 0) + Number(l.stock) * Number(l.per_unit);
  const make = (kind, id, name, unit, onhand, extra) => {
    const key = `${kind}:${id}`; const on = Number(onhand) || 0; const listed = used[key] || 0;
    return { key, kind, id, name, unit, onhand: on, listed, free: Math.max(0, on - listed), ...extra };
  };
  const out = {
    items: (items.data || []).map((r) => make("item", r.id, r.name, r.unit, r.quantity, { category: r.category })),
    crops: (crops.data || []).map((r) => make("crop", r.id, r.name, r.field_unit || "kg", r.field_quantity, { status: r.status })),
    livestock: (groups.data || []).map((r) => make("livestock", r.id, r.name, "head", r.head_count, { animalClass: r.animal_class })),
  };
  out.all = [...out.items, ...out.crops, ...out.livestock];
  return { data: out, error: null };
});

// ---- sales made outside the system --------------------------------------------------------
// target: { productId, fromListing } for a listed item, or { sourceKind, sourceId } for something never listed
export const recordSale = guard(async (bid, s) => {
  const res = await supabase.rpc("record_sale", {
    p_business: bid, p_product: s.productId || null, p_source_kind: s.sourceKind || null, p_source_id: s.sourceId || null,
    p_quantity: Number(s.quantity), p_unit_price: Number(s.unitPrice), p_buyer_name: text(s.buyerName), p_buyer_phone: text(s.buyerPhone),
    p_sold_on: s.soldOn || null, p_note: text(s.note), p_from_listing: s.fromListing !== false,
  });
  return wrap(res);
});

export const voidSale = guard(async (id, reason) => wrap(await supabase.rpc("void_sale", { p_sale: id, p_reason: String(reason || "").trim() })));

export const listRecordedSales = guard(async (bid, { limit = 100 } = {}) =>
  wrap(await supabase.from("recorded_sales").select("*").eq("business_id", bid).order("sold_on", { ascending: false }).order("created_at", { ascending: false }).limit(limit)));

// harvest: move a quantity from a crop in the field into a store item (a new one when itemId is empty)
export const moveFieldToStore = guard(async (cropId, quantity, itemId, itemName) =>
  wrap(await supabase.rpc("move_field_to_store", { p_crop: cropId, p_quantity: Number(quantity), p_item: itemId || null, p_item_name: text(itemName) })));

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
  const sinceDay = since.slice(0, 10);
  const [prods, low, newOrders, recent, month, recorded] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", bid).eq("status", "active"),
    supabase.from("products").select("id, stock, low_stock_level").eq("business_id", bid).neq("status", "archived"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("business_id", bid).in("status", ["paid", "pending_payment"]),
    supabase.from("orders").select("*").eq("business_id", bid).order("created_at", { ascending: false }).limit(5),
    supabase.from("orders").select("total").eq("business_id", bid).neq("status", "cancelled").gte("created_at", since),
    supabase.from("recorded_sales").select("total").eq("business_id", bid).is("voided_at", null).gte("sold_on", sinceDay),
  ]);
  const err = [prods, low, newOrders, recent, month, recorded].find((r) => r.error);
  if (err) return { data: null, error: err.error.message };
  return {
    data: {
      activeProducts: prods.count || 0,
      lowStock: (low.data || []).filter((p) => Number(p.low_stock_level) > 0 && p.stock <= p.low_stock_level).length,
      newOrders: newOrders.count || 0,
      revenue30: (month.data || []).reduce((s, o) => s + Number(o.total || 0), 0) + (recorded.data || []).reduce((s, o) => s + Number(o.total || 0), 0),
      recent: recent.data || [],
      anyProducts: (low.data || []).length > 0,
    },
    error: null,
  };
});
