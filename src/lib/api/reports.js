// src/lib/api/reports.js — MODIFIED (Phase 5 step 3: getShopReport added at the bottom)
//
// AIM
// The numbers for the Reports screen, read from the report_* views (supabase migration p4_05).
// getRentalReport, getFarmReport and getShopReport each return { data, error } with the last 12 months merged
// into one list so the screen can chart and export it. Never throws.

import { supabase } from "../../config/supabase.js";
import { lastMonths } from "./farm.js";
import { haToAcres } from "../geo.js";

const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet." };
const first = (rs) => rs.find((r) => r.error)?.error?.message || null;
const key = (d) => String(d).slice(0, 7);

export async function getRentalReport(businessId) {
  if (!supabase) return NOT_CONNECTED;
  const months = lastMonths(12);
  const from = `${months[0]}-01`;
  const q = (v) => supabase.from(v).select("*").eq("business_id", businessId);
  const [billed, collected, occupancy, billing, workers] = await Promise.all([
    q("report_rental_monthly").gte("month", from), q("report_rental_collected").gte("month", from),
    q("report_rental_occupancy").order("building"), q("report_billing_status"), q("report_worker_costs").gte("month", from),
  ]);
  const error = first([billed, collected, occupancy, billing, workers]);
  if (error) return { data: null, error };

  const rows = Object.fromEntries(months.map((m) => [m, { month: m, billed: 0, collected: 0, invoices: 0, workerCost: 0, workers: 0 }]));
  for (const r of billed.data) if (rows[key(r.month)]) { rows[key(r.month)].billed = Number(r.billed); rows[key(r.month)].invoices = Number(r.invoices); }
  for (const r of collected.data) if (rows[key(r.month)]) rows[key(r.month)].collected = Number(r.collected);
  for (const r of workers.data) if (rows[key(r.month)]) { rows[key(r.month)].workerCost = Number(r.paid); rows[key(r.month)].workers = Number(r.workers); }
  const monthly = months.map((m) => ({ ...rows[m], net: rows[m].collected - rows[m].workerCost }));

  return {
    data: {
      monthly,
      occupancy: occupancy.data.map((o) => ({ ...o, rooms: +o.rooms, occupied: +o.occupied, reserved: +o.reserved, available: +o.available, maintenance: +o.maintenance,
        rate: +o.rooms ? Math.round((+o.occupied / +o.rooms) * 100) : 0 })),
      billing: billing.data.map((b) => ({ status: b.status, invoices: +b.invoices, billed: Number(b.billed), paid: Number(b.paid), balance: Number(b.balance) })),
    },
    error: null,
  };
}

export async function getFarmReport(businessId) {
  if (!supabase) return NOT_CONNECTED;
  const months = lastMonths(12);
  const from = `${months[0]}-01`;
  const q = (v) => supabase.from(v).select("*").eq("business_id", businessId);
  const [monthly, costs, yields] = await Promise.all([q("report_farm_monthly").gte("month", from), q("report_farm_costs"), q("report_farm_yield").order("harvested_kg", { ascending: false })]);
  const error = first([monthly, costs, yields]);
  if (error) return { data: null, error };

  const rows = Object.fromEntries(months.map((m) => [m, { month: m, income: 0, cost: 0 }]));
  for (const r of monthly.data) if (rows[key(r.month)]) { rows[key(r.month)].income = Number(r.income); rows[key(r.month)].cost = Number(r.cost); }
  return {
    data: {
      monthly: months.map((m) => ({ ...rows[m], profit: rows[m].income - rows[m].cost })),
      costs: costs.data.map((c) => ({ category: c.category, cost: Number(c.cost), entries: +c.entries })),
      // the views work in hectares; the Reports screen shows acres and kg per acre
      yields: yields.data.map((y) => {
        const ha = y.area_ha == null ? null : Number(y.area_ha);
        const harvested = Number(y.harvested_kg);
        return {
          crop: y.crop, field: y.field,
          area_acres: ha == null ? null : Math.round(haToAcres(ha) * 100) / 100,
          harvested_kg: harvested,
          kg_per_acre: ha > 0 ? Math.round((harvested / haToAcres(ha)) * 10) / 10 : null,
          cost: Number(y.cost), income: Number(y.income),
        };
      }),
    },
    error: null,
  };
}

export async function getShopReport(businessId) {
  if (!supabase) return NOT_CONNECTED;
  const months = lastMonths(12);
  const from = `${months[0]}-01`;
  const q = (v) => supabase.from(v).select("*").eq("business_id", businessId);
  const [monthly, status, top] = await Promise.all([
    q("report_shop_monthly").gte("month", from), q("report_shop_status"),
    q("report_shop_top_products").order("revenue", { ascending: false }).limit(20),
  ]);
  const error = first([monthly, status, top]);
  if (error) return { data: null, error };

  const rows = Object.fromEntries(months.map((m) => [m, { month: m, orders: 0, sales: 0, received: 0, cancelled: 0 }]));
  for (const r of monthly.data) {
    const t = rows[key(r.month)];
    if (t) { t.orders = Number(r.orders); t.sales = Number(r.sales); t.received = Number(r.received); t.cancelled = Number(r.cancelled); }
  }
  return {
    data: {
      monthly: months.map((m) => rows[m]),
      status: status.data.map((s) => ({ status: s.status, orders: Number(s.orders), total: Number(s.total) })),
      top: top.data.map((t, i) => ({ _k: `${t.product_id || t.name}-${i}`, name: t.name, units: Number(t.units), revenue: Number(t.revenue), orders: Number(t.orders) })),
    },
    error: null,
  };
}
