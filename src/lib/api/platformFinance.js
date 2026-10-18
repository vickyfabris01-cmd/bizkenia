// src/lib/api/platformFinance.js — NEW FILE (Phase 5, step 3)
//
// AIM
// Everything the super admin's money and history screens ask of the database: transactions,
// subscription revenue, platform reports and the audit log. Each function returns { data, error }
// and never throws. All of them call database functions from migration p5_07 that first check the
// caller is a super admin, so a normal account gets "Only a super admin can do this".
//
// WHAT COUNTS AS A TRANSACTION
//   subscription  a business paying the platform         (the platform's only income)
//   rent          a resident paying a rental business     (STK push, or cash/bank recorded by staff)
//   order         a customer paying a shop                (M-Pesa, or paid on delivery)
// Status is one of: success, pending, failed, reversed (reversed also covers refunded).
//
// FILTERS (listTransactions, exportTransactions, getTransactionTotals)
//   { kind, status, from, to, search }   from/to are "YYYY-MM-DD"; empty means no limit.

import { supabase } from "../../config/supabase.js";

const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet." };
const guard = (fn) => (...args) => (supabase ? fn(...args) : Promise.resolve(NOT_CONNECTED));
const clean = (v) => (v === "" || v == null ? null : v);
const msg = (e) => (e ? e.message || "Something went wrong" : null);
const num = (v) => Number(v || 0);

export const PAGE_SIZE = 25;
export const EXPORT_LIMIT = 5000;

export const KIND_LABEL = { subscription: "Subscription", rent: "Rent", order: "Shop order" };
export const KIND_OPTIONS = [
  { value: "", label: "All types" },
  { value: "subscription", label: "Subscriptions" },
  { value: "rent", label: "Rent" },
  { value: "order", label: "Shop orders" },
];
export const STATUS_LABEL = { success: "Successful", pending: "Pending", failed: "Failed", reversed: "Reversed" };
export const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "success", label: "Successful" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "reversed", label: "Reversed or refunded" },
];
export const METHOD_LABEL = {
  mpesa_stk: "M-Pesa prompt", mpesa: "M-Pesa", manual: "Recorded by admin", cash: "Cash",
  bank_transfer: "Bank transfer", other: "Other", cash_on_delivery: "Paid on delivery",
};

const txArgs = (f = {}) => ({
  p_kind: clean(f.kind), p_status: clean(f.status), p_from: clean(f.from), p_to: clean(f.to), p_search: clean(f.search),
});

// ---- app errors (monitoring, migration p5_08) -------------------------------------------------------
/** Crashes reported by visitors' browsers, grouped by message. */
export const listClientErrors = guard(async (days = 7) => {
  const { data, error } = await supabase.rpc("admin_client_errors", { p_days: days });
  return error ? { data: null, error: msg(error) } : { data: data || [], error: null };
});

// ---- transactions ------------------------------------------------------------------------------------
/** One page of transactions: { rows, total }. */
export const listTransactions = guard(async (filters = {}, { page = 1, size = PAGE_SIZE } = {}) => {
  const { data, error } = await supabase.rpc("admin_transactions", { ...txArgs(filters), p_limit: size, p_offset: (page - 1) * size });
  if (error) return { data: null, error: msg(error) };
  const rows = data || [];
  return { data: { rows, total: rows.length ? num(rows[0].total_count) : 0 }, error: null };
});

/** Every transaction that matches (up to EXPORT_LIMIT) for the CSV download: { rows, total, truncated }. */
export const exportTransactions = guard(async (filters = {}) => {
  const { data, error } = await supabase.rpc("admin_transactions", { ...txArgs(filters), p_limit: EXPORT_LIMIT, p_offset: 0 });
  if (error) return { data: null, error: msg(error) };
  const rows = data || [];
  const total = rows.length ? num(rows[0].total_count) : 0;
  return { data: { rows, total, truncated: total > rows.length }, error: null };
});

/** Tiles above the list. Date and type filters apply; status and search do not. */
export const getTransactionTotals = guard(async (filters = {}) => {
  const a = txArgs(filters);
  const { data, error } = await supabase.rpc("admin_transaction_totals", { p_from: a.p_from, p_to: a.p_to, p_kind: a.p_kind });
  if (error) return { data: null, error: msg(error) };
  const d = data || {};
  return {
    data: {
      count: num(d.count), volume: num(d.volume),
      successCount: num(d.success_count), pendingCount: num(d.pending_count), pendingAmount: num(d.pending_amount),
      failedCount: num(d.failed_count), reversedCount: num(d.reversed_count), reversedAmount: num(d.reversed_amount),
      byKind: Object.fromEntries(Object.entries(d.by_kind || {}).map(([k, v]) => [k, { count: num(v.count), volume: num(v.volume) }])),
    },
    error: null,
  };
});

// ---- subscription revenue -------------------------------------------------------------------------------
export const getRevenue = guard(async () => {
  const [sum, monthly, byType] = await Promise.all([
    supabase.rpc("admin_revenue_summary"), supabase.rpc("admin_revenue_monthly", { p_months: 12 }), supabase.rpc("admin_revenue_by_type", { p_months: 12 }),
  ]);
  const e = [sum, monthly, byType].find((r) => r.error);
  if (e) return { data: null, error: msg(e.error) };
  const s = sum.data || {};
  return {
    data: {
      thisMonth: num(s.this_month), lastMonth: num(s.last_month), twelveMonths: num(s.twelve_months), allTime: num(s.all_time),
      payments: num(s.payments), payingBusinesses: num(s.paying_businesses),
      activeSubscriptions: num(s.active_subscriptions), expiringSoon: num(s.expiring_soon),
      monthly: (monthly.data || []).map((m) => ({ month: String(m.month).slice(0, 7), revenue: num(m.revenue), payments: num(m.payments), payingBusinesses: num(m.paying_businesses) })),
      byType: (byType.data || []).map((t) => ({ type: t.business_type, revenue: num(t.revenue), payments: num(t.payments) })),
    },
    error: null,
  };
});

// ---- platform reports and analytics ------------------------------------------------------------------------
export const getPlatformReport = guard(async () => {
  const [growth, mix, volume, top] = await Promise.all([
    supabase.rpc("admin_growth_monthly", { p_months: 12 }), supabase.rpc("admin_business_mix"),
    supabase.rpc("admin_monthly_volume", { p_months: 12 }), supabase.rpc("admin_top_businesses", { p_limit: 10, p_months: 12 }),
  ]);
  const e = [growth, mix, volume, top].find((r) => r.error);
  if (e) return { data: null, error: msg(e.error) };
  return {
    data: {
      growth: (growth.data || []).map((g) => ({
        month: String(g.month).slice(0, 7), newUsers: num(g.new_users), newBusinesses: num(g.new_businesses),
        approved: num(g.approved_businesses), usersTotal: num(g.users_total), businessesTotal: num(g.businesses_total),
      })),
      mix: (mix.data || []).map((m) => ({ type: m.business_type, status: m.status, businesses: num(m.businesses) })),
      volume: (volume.data || []).map((v) => ({
        month: String(v.month).slice(0, 7), subscription: num(v.subscription), rent: num(v.rent), orders: num(v.shop_orders), payments: num(v.payments),
      })),
      top: (top.data || []).map((t) => ({
        id: t.business_id, name: t.name, type: t.business_type, county: t.county, moneyHandled: num(t.money_handled),
        payments: num(t.payments), subscriptionPaid: num(t.subscription_paid), lastPayment: t.last_payment,
      })),
    },
    error: null,
  };
});

// ---- audit log ------------------------------------------------------------------------------------------------
const auditArgs = (f = {}) => ({ p_action: clean(f.action), p_from: clean(f.from), p_to: clean(f.to), p_search: clean(f.search), p_entity: null });

export const listAudit = guard(async (filters = {}, { page = 1, size = PAGE_SIZE } = {}) => {
  const { data, error } = await supabase.rpc("admin_audit_feed", { ...auditArgs(filters), p_limit: size, p_offset: (page - 1) * size });
  if (error) return { data: null, error: msg(error) };
  const rows = data || [];
  return { data: { rows, total: rows.length ? num(rows[0].total_count) : 0 }, error: null };
});

export const exportAudit = guard(async (filters = {}) => {
  const { data, error } = await supabase.rpc("admin_audit_feed", { ...auditArgs(filters), p_limit: EXPORT_LIMIT, p_offset: 0 });
  if (error) return { data: null, error: msg(error) };
  const rows = data || [];
  const total = rows.length ? num(rows[0].total_count) : 0;
  return { data: { rows, total, truncated: total > rows.length }, error: null };
});
