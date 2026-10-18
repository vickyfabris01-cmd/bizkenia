// src/lib/api/storefront.js — NEW FILE (Phase 5, step 2)
//
// AIM
// Everything a SHOPPER asks of the database: browse a shop's products, read the shop's delivery
// settings, place an order, pay it with M-Pesa, follow it, cancel it, ask for help, keep a wishlist
// and saved addresses. Every function returns { data, error } and never throws. Prices, stock and the
// delivery fee are decided by the database (place_order), never by the browser. Error messages that
// come from database functions are plain English and are shown as they are.

import { supabase } from "../../config/supabase.js";

const wrap = ({ data, error }) => ({ data: data ?? null, error: error?.message || null });
const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet." };
const guard = (fn) => (...args) => (supabase ? fn(...args) : Promise.resolve(NOT_CONNECTED));
const clean = (s) => String(s || "").replace(/[%,()]/g, " ").trim();

const PRODUCT_FIELDS = "id, business_id, category_id, name, description, price, compare_at_price, stock, unit, images, status, created_at, category:product_categories(id, name)";

// ---- browsing (no sign-in needed) --------------------------------------------------------
export const listShopCategories = guard(async (bid) =>
  wrap(await supabase.from("product_categories").select("id, name").eq("business_id", bid).order("sort_order").order("name")));

export const SORTS = {
  new: { label: "Newest", col: "created_at", asc: false },
  low: { label: "Price: low to high", col: "price", asc: true },
  high: { label: "Price: high to low", col: "price", asc: false },
};

export const listShopProducts = guard(async (bid, { search = "", categoryId = "", sort = "new", limit = 12, offset = 0 } = {}) => {
  const s = SORTS[sort] || SORTS.new;
  let q = supabase.from("products").select(PRODUCT_FIELDS).eq("business_id", bid).eq("status", "active")
    .order(s.col, { ascending: s.asc }).range(offset, offset + limit - 1);
  if (categoryId) q = q.eq("category_id", categoryId);
  if (clean(search)) q = q.ilike("name", `%${clean(search)}%`);
  return wrap(await q);
});

export const getShopProduct = guard(async (id) =>
  wrap(await supabase.from("products").select(PRODUCT_FIELDS).eq("id", id).eq("status", "active").maybeSingle()));

// fresh price and stock for the lines in a cart
export const getProductsByIds = guard(async (ids) => {
  if (!ids.length) return { data: [], error: null };
  const res = wrap(await supabase.from("products").select("id, business_id, name, price, stock, unit, images, status").in("id", ids));
  return { data: res.data || [], error: res.error };
});

export const getShopTerms = guard(async (bid) => {
  const res = wrap(await supabase.from("shop_settings").select("*").eq("business_id", bid).maybeSingle());
  return {
    data: { delivery_enabled: true, delivery_fee: 0, free_delivery_over: null, pickup_enabled: false, pickup_address: "", pay_on_delivery: false, delivery_note: "", ...(res.data || {}) },
    error: res.error,
  };
});

// ---- checkout ---------------------------------------------------------------------------
export const placeOrder = guard(async (bid, lines, f) =>
  wrap(await supabase.rpc("place_order", {
    p_business: bid,
    p_items: lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
    p_fulfilment: f.fulfilment, p_method: f.method, p_name: f.name, p_phone: f.phone,
    p_county: f.county || null, p_town: f.town || null, p_street: f.street || null,
    p_ship_notes: f.shipNotes || null, p_notes: f.notes || null,
  })));

/** Sends the M-Pesa prompt for an order. */
export const sendOrderPrompt = guard(async (orderId, phone) => {
  const { data, error } = await supabase.functions.invoke("mpesa-stk-push", { body: { purpose: "order", orderId, phone } });
  if (error) {
    let message = error.message, code = null;
    try { const body = await error.context?.json?.(); if (body?.error) message = body.error; code = body?.code || null; } catch { /* generic */ }
    return { data: null, error: message, code };
  }
  return { data, error: data?.error || null, code: data?.code || null };
});

export const orderPayment = guard(async (orderId) => wrap(await supabase.rpc("my_order_payment", { p_order: orderId })));

// ---- my orders --------------------------------------------------------------------------
export const listMyOrders = guard(async ({ limit = 25, offset = 0 } = {}) =>
  wrap(await supabase.from("orders").select("*, business:businesses(name, slug)").order("created_at", { ascending: false }).range(offset, offset + limit - 1)));

export const getMyOrder = guard(async (id) => {
  const [o, items, events, tickets] = await Promise.all([
    supabase.from("orders").select("*, business:businesses(name, slug, phone, whatsapp)").eq("id", id).maybeSingle(),
    supabase.from("order_items").select("*, product:products(images, status)").eq("order_id", id).order("name"),
    supabase.from("order_events").select("*").eq("order_id", id).order("created_at"),
    supabase.from("support_tickets").select("id, subject, status").eq("order_id", id).order("created_at", { ascending: false }),
  ]);
  if (o.error || !o.data) return { data: null, error: o.error?.message || "Order not found." };
  return { data: { ...o.data, items: items.data || [], events: events.data || [], tickets: tickets.data || [] }, error: null };
});

export const cancelMyOrder = guard(async (id) => wrap(await supabase.rpc("cancel_my_order", { p_order: id })));

export const createOrderTicket = guard(async (orderId, subject, body) =>
  wrap(await supabase.rpc("create_order_ticket", { p_order: orderId, p_subject: subject, p_body: body })));

// ---- wishlist ---------------------------------------------------------------------------
export const listWishlist = guard(async () =>
  wrap(await supabase.from("wishlists").select("created_at, product:products(id, business_id, name, price, compare_at_price, stock, unit, images, status, business:businesses(name, slug))").order("created_at", { ascending: false })));

export const wishlistIds = guard(async () => {
  const res = wrap(await supabase.from("wishlists").select("product_id"));
  return { data: (res.data || []).map((r) => r.product_id), error: res.error };
});

export const setWished = guard(async (userId, productId, on) =>
  wrap(on
    ? await supabase.from("wishlists").upsert({ user_id: userId, product_id: productId }, { onConflict: "user_id,product_id" })
    : await supabase.from("wishlists").delete().eq("user_id", userId).eq("product_id", productId)));

// ---- saved addresses --------------------------------------------------------------------
export const listAddresses = guard(async () =>
  wrap(await supabase.from("addresses").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: false })));

export const saveAddress = guard(async (userId, a) => {
  const row = {
    user_id: userId, label: a.label || null, recipient: String(a.recipient || "").trim(), phone: String(a.phone || "").trim(),
    county: a.county || null, town: a.town || null, street: a.street || null, notes: a.notes || null,
  };
  return wrap(await supabase.from("addresses").insert(row).select().single());
});
