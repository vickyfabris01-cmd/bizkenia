// src/lib/api/businesses.js — NEW FILE (Phase 5 step 3: adminStats counts subscription payments only)
//
// AIM
// Everything the browser does with businesses (onboarding, owner edits, super-admin review).
// Each function returns { data, error } and never throws. Rules (who may do what) are enforced
// by the database; messages from the database functions are plain English and are shown as is.

import { supabase } from "../../config/supabase.js";

const FULL = "id, name, slug, status, business_type, description, county, address, phone, email, whatsapp, logo_url, cover_url, rejection_reason, submitted_at, approved_at, created_at, owner_user_id";
const wrap = ({ data, error }) => ({ data: data ?? null, error: error?.message || null });
const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet." };

export async function createBusiness(fields) {
  if (!supabase) return NOT_CONNECTED;
  return wrap(await supabase.rpc("create_business", {
    p_name: fields.name, p_type: fields.type, p_description: fields.description || null,
    p_county: fields.county || null, p_phone: fields.phone || null, p_email: fields.email || null, p_address: fields.address || null,
  }));
}

export async function getMyBusiness(slug) {
  if (!supabase) return NOT_CONNECTED;
  return wrap(await supabase.from("businesses").select(FULL).eq("slug", slug).maybeSingle());
}

export async function updateBusiness(id, fields) {
  if (!supabase) return NOT_CONNECTED;
  const patch = {};
  for (const k of ["name", "description", "county", "address", "phone", "email", "whatsapp"]) {
    if (fields[k] !== undefined) patch[k] = fields[k] || null;
  }
  if (patch.name === null) delete patch.name;
  return wrap(await supabase.from("businesses").update(patch).eq("id", id).select(FULL).maybeSingle());
}

export async function resubmitBusiness(id) {
  if (!supabase) return NOT_CONNECTED;
  return wrap(await supabase.rpc("resubmit_business", { p_business: id }));
}

export async function plansForType(type) {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.from("subscription_plans").select("*").eq("business_type", type).eq("is_active", true).order("sort");
  return { data: data || [], error: error?.message || null };
}

// ── Super admin ────────────────────────────────────────────────────────────
export async function adminListBusinesses({ status = "", search = "" } = {}) {
  if (!supabase) return NOT_CONNECTED;
  let q = supabase.from("businesses").select(FULL).order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const term = search.trim().replace(/[%,()]/g, " ");
  if (term) q = q.or(`name.ilike.%${term}%,county.ilike.%${term}%,email.ilike.%${term}%`);
  const { data, error } = await q;
  return { data: data || [], error: error?.message || null };
}

export async function adminGetBusiness(id) {
  if (!supabase) return NOT_CONNECTED;
  const [biz, owner, subs, intents] = await Promise.all([
    supabase.from("businesses").select(FULL).eq("id", id).maybeSingle(),
    supabase.from("business_members").select("user_id, role, status").eq("business_id", id),
    supabase.from("business_subscriptions").select("*").eq("business_id", id).order("created_at", { ascending: false }),
    supabase.from("payment_intents").select("*").eq("business_id", id).order("created_at", { ascending: false }),
  ]);
  if (biz.error) return { data: null, error: biz.error.message };
  const ids = (owner.data || []).map((m) => m.user_id);
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name, email, phone").in("id", ids) : { data: [] };
  const byId = Object.fromEntries((people || []).map((p) => [p.id, p]));
  const members = (owner.data || []).map((m) => ({ ...m, profile: byId[m.user_id] || null }));
  return { data: { business: biz.data, members, subscriptions: subs.data || [], payments: intents.data || [] }, error: null };
}

export async function adminReview(id, decision, reason = null) {
  if (!supabase) return NOT_CONNECTED;
  return wrap(await supabase.rpc("admin_review_business", { p_business: id, p_decision: decision, p_reason: reason }));
}

export async function adminRecordPayment(businessId, planId, receipt, note) {
  if (!supabase) return NOT_CONNECTED;
  return wrap(await supabase.rpc("admin_record_payment", { p_business: businessId, p_plan: planId, p_receipt: receipt || null, p_note: note || null }));
}

export async function adminStats() {
  if (!supabase) return NOT_CONNECTED;
  const count = async (build) => (await build(supabase.from("businesses").select("id", { count: "exact", head: true }))).count || 0;
  const [pending, active, rejected, suspended, users] = await Promise.all([
    count((q) => q.eq("status", "pending")),
    count((q) => q.eq("status", "active")),
    count((q) => q.eq("status", "rejected")),
    count((q) => q.eq("status", "suspended")),
    supabase.from("profiles").select("id", { count: "exact", head: true }).then((r) => r.count || 0),
  ]);
  // Subscription money only: rent and shop payments belong to the businesses, not to the platform.
  // admin_revenue_summary (migration p5_07) adds it up in the database; if that migration is not applied
  // yet, fall back to adding up the rows here (the API returns at most 1000 rows, so this is a stop-gap).
  let revenue;
  const rev = await supabase.rpc("admin_revenue_summary");
  if (!rev.error && rev.data) revenue = Number(rev.data.all_time || 0);
  else {
    const { data: sums } = await supabase.from("payment_intents").select("amount_kes").eq("status", "success").eq("purpose", "subscription");
    revenue = (sums || []).reduce((a, r) => a + (r.amount_kes || 0), 0);
  }
  return { data: { pending, active, rejected, suspended, users, revenue }, error: null };
}

export async function adminListUsers({ search = "" } = {}) {
  if (!supabase) return NOT_CONNECTED;
  let q = supabase.from("profiles").select("id, full_name, email, phone, role, is_active, created_at").order("created_at", { ascending: false }).limit(200);
  const term = search.trim().replace(/[%,()]/g, " ");
  if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data, error } = await q;
  return { data: data || [], error: error?.message || null };
}

export async function adminSetUserActive(id, active) {
  return wrap(await supabase.rpc("admin_set_user_active", { p_user: id, p_active: active }));
}

// ── Platform settings ────────────────────────────────────────────────────
export async function adminGetSettings() {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.from("platform_settings").select("key, value");
  const map = {};
  for (const r of data || []) map[r.key] = r.value;
  return { data: map, error: error?.message || null };
}

export async function adminSaveSetting(key, value) {
  if (!supabase) return NOT_CONNECTED;
  return wrap(await supabase.from("platform_settings").update({ value }).eq("key", key).select().maybeSingle());
}

export async function adminListPlans() {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.from("subscription_plans").select("*").order("business_type").order("sort");
  return { data: data || [], error: error?.message || null };
}

export async function adminSavePlan(plan) {
  if (!supabase) return NOT_CONNECTED;
  const row = { business_type: plan.business_type, code: plan.code, name: plan.name, description: plan.description || null,
    price_kes: Number(plan.price_kes), period_days: Number(plan.period_days), is_active: !!plan.is_active, sort: Number(plan.sort || 0) };
  const q = plan.id ? supabase.from("subscription_plans").update(row).eq("id", plan.id) : supabase.from("subscription_plans").insert(row);
  return wrap(await q.select().maybeSingle());
}
