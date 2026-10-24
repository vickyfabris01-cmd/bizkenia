// src/lib/api/farm.js — MODIFIED (store item serial and condition, crop field quantity, livestock class)
//
// AIM
// Everything the farm (agriculture) screens ask of the database, grouped by screen. Every
// function returns { data, error } and never throws. Reads and simple edits use the tables (row-level
// security lets only the owner and managers of the business in); stock and livestock changes
// call the database functions record_stock_movement and record_livestock_event so quantities
// are always correct. Error messages from those functions are plain English and are shown as they are.

import { supabase } from "../../config/supabase.js";

const wrap = ({ data, error }) => ({ data: data ?? null, error: error?.message || null });
const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet." };
const guard = (fn) => (...args) => (supabase ? fn(...args) : Promise.resolve(NOT_CONNECTED));
const text = (v) => (v == null ? null : String(v).trim() || null);
const num = (v) => (v === "" || v == null ? null : Number(v));
const page = (q, { limit = 50, offset = 0 } = {}) => q.range(offset, offset + limit - 1);

// ---- fields ----------------------------------------------------------------------------
export const listFields = guard(async (bid) =>
  wrap(await supabase.from("farm_fields").select("*").eq("business_id", bid).order("name")));

export const getField = guard(async (id) =>
  wrap(await supabase.from("farm_fields").select("*").eq("id", id).maybeSingle()));

export const saveField = guard(async (bid, f) => {
  const row = { name: f.name.trim(), area_ha: Number(f.area_ha) || 0, boundary: f.boundary || null, notes: text(f.notes) };
  const q = f.id ? supabase.from("farm_fields").update(row).eq("id", f.id) : supabase.from("farm_fields").insert({ ...row, business_id: bid });
  const res = wrap(await q.select().single());
  if (res.error && /uq_farm_field_name/.test(res.error)) res.error = "You already have a field with that name.";
  return res;
});

export const deleteField = guard(async (id) => {
  const { count } = await supabase.from("crops").select("id", { count: "exact", head: true }).eq("field_id", id);
  if (count) return { data: null, error: "Remove this field's crops first." };
  return wrap(await supabase.from("farm_fields").delete().eq("id", id));
});

// ---- crops -----------------------------------------------------------------------------
export const listCrops = guard(async (bid) =>
  wrap(await supabase.from("crops").select("*, field:farm_fields(id, name, area_ha)").eq("business_id", bid).order("created_at", { ascending: false })));

export const getCrop = guard(async (id) =>
  wrap(await supabase.from("crops").select("*, field:farm_fields(id, name, area_ha)").eq("id", id).maybeSingle()));

export const saveCrop = guard(async (bid, f) => {
  const row = {
    field_id: f.field_id, name: f.name.trim(), variety: text(f.variety), status: f.status || "planned",
    area_ha: num(f.area_ha), planned_date: f.planned_date || null, planted_date: f.planted_date || null,
    expected_harvest: f.expected_harvest || null, notes: text(f.notes),
    field_quantity: f.field_quantity === "" || f.field_quantity == null ? null : Number(f.field_quantity), field_unit: text(f.field_unit) || "kg",
  };
  const q = f.id ? supabase.from("crops").update(row).eq("id", f.id) : supabase.from("crops").insert({ ...row, business_id: bid });
  return wrap(await q.select().single());
});

export const setCropStatus = guard(async (id, status) => {
  const patch = { status };
  if (status === "planted") patch.planted_date = new Date().toISOString().slice(0, 10);
  return wrap(await supabase.from("crops").update(patch).eq("id", id).select().single());
});

export const deleteCrop = guard(async (id) => wrap(await supabase.from("crops").delete().eq("id", id)));

// ---- activities and harvests -----------------------------------------------------------
export const listActivities = guard(async (bid, { cropId, ...pg } = {}) => {
  let q = supabase.from("crop_activities").select("*, crop:crops(id, name)").eq("business_id", bid).order("activity_date", { ascending: false }).order("created_at", { ascending: false });
  if (cropId) q = q.eq("crop_id", cropId);
  return wrap(await page(q, pg));
});

export const addActivity = guard(async (bid, f) => {
  const res = wrap(await supabase.from("crop_activities").insert({
    business_id: bid, crop_id: f.crop_id, kind: f.kind, activity_date: f.activity_date || new Date().toISOString().slice(0, 10),
    quantity: num(f.quantity), unit: text(f.unit), notes: text(f.notes),
  }).select().single());
  // Planting a crop that was only planned moves it to "planted".
  if (!res.error && f.kind === "planting") {
    await supabase.from("crops").update({ status: "planted", planted_date: f.activity_date || new Date().toISOString().slice(0, 10) })
      .eq("id", f.crop_id).eq("status", "planned");
  }
  return res;
});

export const deleteActivity = guard(async (id) => wrap(await supabase.from("crop_activities").delete().eq("id", id)));

export const listHarvests = guard(async (bid, { cropId, ...pg } = {}) => {
  let q = supabase.from("harvests").select("*, crop:crops(id, name)").eq("business_id", bid).order("harvest_date", { ascending: false }).order("created_at", { ascending: false });
  if (cropId) q = q.eq("crop_id", cropId);
  return wrap(await page(q, pg));
});

export const addHarvest = guard(async (bid, f) =>
  wrap(await supabase.from("harvests").insert({
    business_id: bid, crop_id: f.crop_id, harvest_date: f.harvest_date || new Date().toISOString().slice(0, 10),
    quantity_kg: Number(f.quantity_kg), notes: text(f.notes),
  }).select().single()));

export const deleteHarvest = guard(async (id) => wrap(await supabase.from("harvests").delete().eq("id", id)));

// ---- inventory -------------------------------------------------------------------------
export const listItems = guard(async (bid) =>
  wrap(await supabase.from("farm_inventory_items").select("*").eq("business_id", bid).order("name")));

export const saveItem = guard(async (bid, f) => {
  const row = { name: f.name.trim(), category: f.category || "other", unit: f.unit?.trim() || "kg", reorder_level: Number(f.reorder_level) || 0, unit_cost: num(f.unit_cost), notes: text(f.notes), serial_no: text(f.serial_no), condition: f.condition || null };
  // The quantity of an existing item changes only through stock movements.
  const q = f.id ? supabase.from("farm_inventory_items").update(row).eq("id", f.id)
                 : supabase.from("farm_inventory_items").insert({ ...row, business_id: bid, quantity: Number(f.quantity) || 0 });
  const res = wrap(await q.select().single());
  if (res.error && /uq_farm_item_name/.test(res.error)) res.error = "You already have an item with that name.";
  return res;
});

export const deleteItem = guard(async (id) => wrap(await supabase.from("farm_inventory_items").delete().eq("id", id)));

export const moveStock = guard(async (itemId, kind, quantity, note) =>
  wrap(await supabase.rpc("record_stock_movement", { p_item: itemId, p_kind: kind, p_quantity: Number(quantity), p_note: note || null })));

export const listMovements = guard(async (itemId, pg) =>
  wrap(await page(supabase.from("inventory_movements").select("*").eq("item_id", itemId).order("moved_at", { ascending: false }), pg)));

// ---- livestock -------------------------------------------------------------------------
export const listGroups = guard(async (bid) =>
  wrap(await supabase.from("livestock_groups").select("*").eq("business_id", bid).order("name")));

export const saveGroup = guard(async (bid, f) => {
  const row = { name: f.name.trim(), species: f.species || "cattle", breed: text(f.breed), animal_class: text(f.animal_class), notes: text(f.notes) };
  const q = f.id ? supabase.from("livestock_groups").update(row).eq("id", f.id)
                 : supabase.from("livestock_groups").insert({ ...row, business_id: bid, head_count: Math.max(0, parseInt(f.head_count, 10) || 0) });
  const res = wrap(await q.select().single());
  if (res.error && /uq_livestock_group_name/.test(res.error)) res.error = "You already have a group with that name.";
  return res;
});

export const deleteGroup = guard(async (id) => wrap(await supabase.from("livestock_groups").delete().eq("id", id)));

export const recordEvent = guard(async (groupId, f) =>
  wrap(await supabase.rpc("record_livestock_event", {
    p_group: groupId, p_kind: f.kind, p_date: f.event_date || null, p_heads: parseInt(f.heads, 10) || 0,
    p_amount: num(f.amount), p_notes: text(f.notes),
  })));

export const listEvents = guard(async (bid, { groupId, ...pg } = {}) => {
  let q = supabase.from("livestock_events").select("*, group:livestock_groups(id, name, species)").eq("business_id", bid)
    .order("event_date", { ascending: false }).order("created_at", { ascending: false });
  if (groupId) q = q.eq("group_id", groupId);
  return wrap(await page(q, pg));
});

// ---- money -----------------------------------------------------------------------------
export const listIncome = guard(async (bid, pg) =>
  wrap(await page(supabase.from("farm_income").select("*, crop:crops(id, name)").eq("business_id", bid).order("income_date", { ascending: false }).order("created_at", { ascending: false }), pg)));

export const addIncome = guard(async (bid, f) =>
  wrap(await supabase.from("farm_income").insert({
    business_id: bid, source: f.source || "crop_sale", amount: Number(f.amount), income_date: f.date || new Date().toISOString().slice(0, 10),
    crop_id: f.crop_id || null, description: text(f.description),
  }).select().single()));

export const deleteIncome = guard(async (id) => wrap(await supabase.from("farm_income").delete().eq("id", id)));

export const listExpenses = guard(async (bid, pg) =>
  wrap(await page(supabase.from("farm_expenses").select("*, crop:crops(id, name)").eq("business_id", bid).order("expense_date", { ascending: false }).order("created_at", { ascending: false }), pg)));

export const addExpense = guard(async (bid, f) =>
  wrap(await supabase.from("farm_expenses").insert({
    business_id: bid, category: f.category || "other", amount: Number(f.amount), expense_date: f.date || new Date().toISOString().slice(0, 10),
    crop_id: f.crop_id || null, description: text(f.description),
  }).select().single()));

export const deleteExpense = guard(async (id) => wrap(await supabase.from("farm_expenses").delete().eq("id", id)));

// ---- tasks -----------------------------------------------------------------------------
export const listTasks = guard(async (bid) =>
  wrap(await supabase.from("farm_tasks").select("*, field:farm_fields(id, name), crop:crops(id, name)").eq("business_id", bid)
    .order("status", { ascending: true }).order("due_date", { ascending: true, nullsFirst: false })));

export const saveTask = guard(async (bid, f) => {
  const row = { title: f.title.trim(), due_date: f.due_date || null, field_id: f.field_id || null, crop_id: f.crop_id || null, notes: text(f.notes) };
  const q = f.id ? supabase.from("farm_tasks").update(row).eq("id", f.id) : supabase.from("farm_tasks").insert({ ...row, business_id: bid });
  return wrap(await q.select().single());
});

export const setTaskDone = guard(async (id, done) =>
  wrap(await supabase.from("farm_tasks").update({ status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null }).eq("id", id).select().single()));

export const deleteTask = guard(async (id) => wrap(await supabase.from("farm_tasks").delete().eq("id", id)));

export const remindTasks = guard(async (bid) => wrap(await supabase.rpc("remind_farm_tasks", { p_business: bid })));

// ---- dashboard and analytics -----------------------------------------------------------
const ymd = (d) => d.toISOString().slice(0, 10);
const monthKey = (s) => String(s).slice(0, 7);

/** Last `n` month keys ("2026-05") ending with this month, oldest first. */
export function lastMonths(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/**
 * Everything the dashboard and analytics screens show, worked out from the tables.
 * Farm data is small (tens to hundreds of rows a year), so totals are added up here.
 */
export const getFarmSummary = guard(async (bid) => {
  const since = ymd(new Date(Date.UTC(new Date().getUTCFullYear() - 1, new Date().getUTCMonth(), 1)));
  const [fields, crops, items, groups, income, expenses, harvests, tasks, acts, events] = await Promise.all([
    supabase.from("farm_fields").select("id, name, area_ha").eq("business_id", bid),
    supabase.from("crops").select("id, name, status, field_id, area_ha, expected_harvest").eq("business_id", bid),
    supabase.from("farm_inventory_items").select("id, name, unit, quantity, reorder_level").eq("business_id", bid),
    supabase.from("livestock_groups").select("id, name, species, head_count").eq("business_id", bid),
    supabase.from("farm_income").select("amount, income_date").eq("business_id", bid).gte("income_date", since),
    supabase.from("farm_expenses").select("amount, expense_date, category").eq("business_id", bid).gte("expense_date", since),
    supabase.from("harvests").select("quantity_kg, harvest_date, crop_id").eq("business_id", bid).gte("harvest_date", since),
    supabase.from("farm_tasks").select("id, title, due_date, status").eq("business_id", bid).eq("status", "open").order("due_date", { ascending: true, nullsFirst: false }).limit(50),
    supabase.from("crop_activities").select("id, kind, activity_date, created_at, crop:crops(name)").eq("business_id", bid).order("activity_date", { ascending: false }).order("created_at", { ascending: false }).limit(8),
    supabase.from("livestock_events").select("id, kind, event_date, created_at, head_change, group:livestock_groups(name)").eq("business_id", bid).order("event_date", { ascending: false }).order("created_at", { ascending: false }).limit(8),
  ]);
  const failed = [fields, crops, items, groups, income, expenses, harvests, tasks, acts, events].find((r) => r.error);
  if (failed) return { data: null, error: failed.error.message };

  const months = lastMonths(12);
  const series = Object.fromEntries(months.map((m) => [m, { month: m, income: 0, cost: 0, harvestKg: 0 }]));
  for (const r of income.data) { const s = series[monthKey(r.income_date)]; if (s) s.income += Number(r.amount); }
  for (const r of expenses.data) { const s = series[monthKey(r.expense_date)]; if (s) s.cost += Number(r.amount); }
  for (const r of harvests.data) { const s = series[monthKey(r.harvest_date)]; if (s) s.harvestKg += Number(r.quantity_kg); }

  const thisMonth = months[months.length - 1];
  const year = String(new Date().getUTCFullYear());
  const sum = (rows, key, pred) => rows.filter(pred).reduce((a, r) => a + Number(r[key]), 0);
  const costByCategory = {};
  for (const r of expenses.data) costByCategory[r.category] = (costByCategory[r.category] || 0) + Number(r.amount);

  const today = ymd(new Date());
  const recent = [
    ...acts.data.map((a) => ({ id: `a${a.id}`, when: a.activity_date, at: a.created_at, kind: "crop", label: `${a.kind[0].toUpperCase()}${a.kind.slice(1)}`, subject: a.crop?.name || "a crop" })),
    ...events.data.map((e) => ({ id: `e${e.id}`, when: e.event_date, at: e.created_at, kind: "livestock", label: `${e.kind[0].toUpperCase()}${e.kind.slice(1)}`, subject: e.group?.name || "a group" })),
  ].sort((a, b) => (b.when === a.when ? String(b.at).localeCompare(String(a.at)) : String(b.when).localeCompare(String(a.when)))).slice(0, 8);

  return {
    data: {
      fieldCount: fields.data.length,
      hectares: fields.data.reduce((a, f) => a + Number(f.area_ha || 0), 0),
      activePlots: crops.data.filter((c) => c.status === "planted" || c.status === "growing").length,
      cropsByStatus: ["planned", "planted", "growing", "harvested"].map((s) => ({ status: s, count: crops.data.filter((c) => c.status === s).length })),
      yieldKgYear: sum(harvests.data, "quantity_kg", (r) => r.harvest_date.startsWith(year)),
      incomeYear: sum(income.data, "amount", (r) => r.income_date.startsWith(year)),
      costYear: sum(expenses.data, "amount", (r) => r.expense_date.startsWith(year)),
      incomeMonth: series[thisMonth].income,
      costMonth: series[thisMonth].cost,
      lowStock: items.data.filter((i) => Number(i.quantity) <= Number(i.reorder_level) && Number(i.reorder_level) > 0),
      livestockHeads: groups.data.reduce((a, g) => a + g.head_count, 0),
      groups: groups.data,
      openTasks: tasks.data,
      dueTasks: tasks.data.filter((t) => t.due_date && t.due_date <= today),
      recent,
      monthly: months.map((m) => series[m]),
      costByCategory: Object.entries(costByCategory).map(([name, value]) => ({ name, value })),
      cropsCount: crops.data.length,
    },
    error: null,
  };
});
