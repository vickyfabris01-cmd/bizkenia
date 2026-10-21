// src/lib/api/rental.js — MODIFIED FILE (room types)
//
// AIM
// Everything the rental screens ask of the database, in one file, grouped by screen.
// Every function returns { data, error } and never throws. Reads use the tables (row-level
// security decides who sees what); writes that touch several rows or need a rule check call
// the database functions from supabase/migrations/20261014100002_p2_02_rental_functions.sql and
// supabase/migrations/20261020100001_room_types.sql.
// Error messages from those functions are plain English and are shown to people as they are.
//
// Room types: an owner describes a kind of room once (saveRoomType) and adds its rooms from a
// number range (addRooms). The public page lists types (listRoomTypesPublic), people ask for a
// type (submitTypeRequest), and the manager's offer chooses the room (respondRequest roomId).

import { supabase } from "../../config/supabase.js";

const wrap = ({ data, error }) => ({ data: data ?? null, error: error?.message || null });
const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet." };
const guard = (fn) => (...args) => (supabase ? fn(...args) : Promise.resolve(NOT_CONNECTED));
const rpc = (name, args) => supabase.rpc(name, args).then(wrap);

const PROFILE = "id, full_name, email, phone";

// ---- dashboard -------------------------------------------------------------------------
export const getDashboard = guard((businessId) => rpc("rental_dashboard", { p_business: businessId }));

// ---- properties ------------------------------------------------------------------------
export const listBuildings = guard(async (businessId) =>
  wrap(await supabase.from("buildings").select("*").eq("tenant_id", businessId).order("name")));

export const saveBuilding = guard(async (businessId, f) => {
  const row = { name: f.name.trim(), address: f.address?.trim() || null, description: f.description?.trim() || null, total_floors: Number(f.total_floors) || 1 };
  const q = f.id ? supabase.from("buildings").update(row).eq("id", f.id) : supabase.from("buildings").insert({ ...row, tenant_id: businessId });
  return wrap(await q.select().single());
});

export const deleteBuilding = guard(async (id) => {
  const [rooms, types] = await Promise.all([
    supabase.from("rooms").select("id", { count: "exact", head: true }).eq("building_id", id),
    supabase.from("room_types").select("id", { count: "exact", head: true }).eq("building_id", id),
  ]);
  if (rooms.count || types.count) return { data: null, error: "Remove this building's room types and rooms first." };
  return wrap(await supabase.from("buildings").delete().eq("id", id));
});

/** Every room of the business (each room belongs to a room type). */
export const listRooms = guard(async (businessId) =>
  wrap(await supabase.from("rooms").select("*, building:buildings(id, name)").eq("tenant_id", businessId).order("room_number")));

/** Room types of the business, with their building. Counts come from listRooms. */
export const listRoomTypes = guard(async (businessId) =>
  wrap(await supabase.from("room_types").select("*, building:buildings(id, name)").eq("tenant_id", businessId).order("name")));

/**
 * Creates (no f.id) or edits a room type. The name is made by the database from the kind of room
 * ("Single room", then "Single room (1)" in the same building). A hostel (f.is_hostel) has people it
 * sleeps and a semester rent; every other type has a monthly rent. An edit reaches all its rooms and
 * a rent change reaches residents. Returns { id, name, repriced }.
 */
export const saveRoomType = guard((businessId, f) => rpc("save_room_type", {
  p_business: businessId, p_id: f.id || null, p_building: f.building_id, p_kind: f.kind, p_hostel: Boolean(f.is_hostel),
  p_capacity: f.is_hostel ? Number(f.capacity) || 1 : 1,
  p_monthly: f.is_hostel ? null : Number(f.monthly_price) || 0,
  p_semester: f.is_hostel ? Number(f.semester_price) || 0 : null,
  p_description: f.description || null, p_amenities: f.amenities || [], p_images: f.images || [],
  p_allow_self_pick: Boolean(f.allow_self_pick),
}));

/** Adds rooms to a type from a range: prefix "A", 1 to 20 makes A1 … A20 (pad 2 makes A01 … A20). */
export const addRooms = guard((typeId, f) => rpc("add_rooms", {
  p_type: typeId, p_prefix: f.prefix || "", p_from: Number(f.from), p_to: Number(f.to), p_pad: Number(f.pad) || 0,
}));

export const deleteRoomType = guard((id) => rpc("delete_room_type", { p_type: id }));

/** Puts a free room under maintenance or back on the market. Occupied and reserved rooms cannot be changed by hand. */
export const setRoomMaintenance = guard(async (id, on) =>
  wrap(await supabase.from("rooms").update({ status: on ? "maintenance" : "available" }).eq("id", id).in("status", ["available", "maintenance"]).select().maybeSingle()));

export const deleteRoom = guard(async (id) => {
  const { count } = await supabase.from("tenancies").select("id", { count: "exact", head: true }).eq("room_id", id);
  if (count) return { data: null, error: "This room has tenancy history, so it cannot be deleted. Mark it as under maintenance instead." };
  return wrap(await supabase.from("rooms").delete().eq("id", id));
});

/** Free rooms of one type (for the manager's offer). */
export const listFreeRooms = guard(async (typeId) =>
  wrap(await supabase.from("rooms").select("id, room_number").eq("room_type_id", typeId).eq("status", "available")));

// ---- requests --------------------------------------------------------------------------
const REQ = `*, requester:profiles!rental_requests_requester_id_fkey(${PROFILE}), room:rooms(room_number, monthly_price, semester_price, status, building:buildings(name)), room_type:room_types(id, name, kind, is_hostel, monthly_price, semester_price, allow_self_pick, building:buildings(name))`;
export const listRequests = guard(async (businessId) => {
  await supabase.rpc("expire_offers", { p_business: businessId });
  return wrap(await supabase.from("rental_requests").select(REQ).eq("tenant_id", businessId).order("created_at", { ascending: false }));
});
/** f.roomId chooses the room for an offer (needed when the business assigns rooms by hand and the person picked none). */
export const respondRequest = guard((id, f) => rpc("respond_request", {
  p_request: id, p_action: f.action, p_price: f.price ?? null, p_billing: f.billing ?? null,
  p_move_in: f.moveIn || null, p_note: f.note || null, p_hours: f.hours ?? 48, p_room: f.roomId || null,
}));

// ---- residents and tenancies -----------------------------------------------------------
const TEN = `*, client:profiles!tenancies_client_id_fkey(${PROFILE}), room:rooms(room_number, building:buildings(name))`;
export const listTenancies = guard(async (businessId) =>
  wrap(await supabase.from("tenancies").select(TEN).eq("tenant_id", businessId).order("created_at", { ascending: false })));

export const addResident = guard((businessId, f) => rpc("add_resident", {
  p_business: businessId, p_email: f.email, p_room: f.room_id, p_billing: f.billing, p_price: Number(f.price), p_move_in: f.move_in || null,
}));
export const endTenancy = guard((id, status, moveOut) => rpc("end_tenancy", { p_tenancy: id, p_status: status, p_move_out: moveOut || null }));

// ---- billing ---------------------------------------------------------------------------
const CYC = `*, client:profiles!billing_cycles_client_id_fkey(${PROFILE}), room:rooms(room_number, building:buildings(name))`;
export const listCycles = guard(async (businessId) => {
  await supabase.rpc("refresh_overdue", { p_business: businessId });
  return wrap(await supabase.from("billing_cycles").select(CYC).eq("tenant_id", businessId).order("period_start", { ascending: false }).order("invoice_number"));
});
export const generateCycles = guard((businessId) => rpc("generate_cycles", { p_business: businessId }));
export const waiveCycle = guard((id, reason) => rpc("waive_cycle", { p_cycle: id, p_reason: reason || null }));

// ---- payments --------------------------------------------------------------------------
const PAY = `*, client:profiles!payments_client_id_fkey(full_name, phone), cycle:billing_cycles(invoice_number)`;
export const listPayments = guard(async (businessId) =>
  wrap(await supabase.from("payments").select(PAY).eq("tenant_id", businessId).order("created_at", { ascending: false }).limit(500)));
export const recordPayment = guard((businessId, f) => rpc("record_payment", {
  p_business: businessId, p_cycle: f.cycle_id || null, p_amount: Number(f.amount), p_method: f.method,
  p_reference: f.reference || null, p_paid_at: f.paid_at ? new Date(f.paid_at).toISOString() : null, p_notes: f.notes || null,
  p_payer_phone: f.payer_phone || null, p_payer_name: f.payer_name || null,
}));
export const reversePayment = guard((id, reason) => rpc("reverse_payment", { p_payment: id, p_reason: reason || null }));
export const assignPayment = guard((id, cycleId) => rpc("assign_payment", { p_payment: id, p_cycle: cycleId }));

/** Asks the M-Pesa edge function to send an STK prompt for one invoice. */
export const sendRentPrompt = guard(async ({ cycleId, amount, phone }) => {
  const { data, error } = await supabase.functions.invoke("mpesa-stk-push", { body: { purpose: "rent", cycleId, amount, phone } });
  if (error) {
    let message = error.message;
    try { const body = await error.context?.json?.(); if (body?.error) message = body.error; } catch { /* keep generic message */ }
    return { data: null, error: message };
  }
  return { data, error: data?.error || null };
});

// ---- managers --------------------------------------------------------------------------
export const listStaff = guard(async (businessId) => {
  const { data: members, error } = await supabase.from("business_members").select("id, user_id, role, status, created_at")
    .eq("business_id", businessId).in("role", ["owner", "manager"]).eq("status", "active").order("created_at");
  if (error) return { data: null, error: error.message };
  const ids = members.map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select(PROFILE).in("id", ids) : { data: [] };
  return { data: members.map((m) => ({ ...m, profile: (profiles || []).find((p) => p.id === m.user_id) || null })), error: null };
});
export const listInvites = guard(async (businessId) =>
  wrap(await supabase.from("manager_invites").select("id, email, status, token, expires_at, created_at").eq("tenant_id", businessId).eq("status", "pending").order("created_at", { ascending: false })));
export const inviteManager = guard((businessId, email) => rpc("invite_manager", { p_business: businessId, p_email: email }));
export const cancelInvite = guard((id) => rpc("cancel_invite", { p_invite: id }));
export const removeManager = guard((businessId, userId) => rpc("remove_manager", { p_business: businessId, p_user: userId }));
export const getInvite = guard(async (token) => {
  const res = await supabase.rpc("get_invite_by_token", { p_token: token });
  return { data: res.data?.[0] || null, error: res.error?.message || null };
});
export const acceptInvite = guard((token, name) => rpc("accept_manager_invite", { p_token: token, p_full_name: name || null }));

// ---- settings --------------------------------------------------------------------------
export const getSettings = guard(async (businessId) =>
  wrap(await supabase.from("tenant_settings").select("*").eq("tenant_id", businessId).maybeSingle()));
export const saveSettings = guard(async (businessId, f) => wrap(await supabase.from("tenant_settings").upsert({
  tenant_id: businessId, billing_due_day: Number(f.billing_due_day), grace_period_days: Number(f.grace_period_days),
  late_fee_amount: Number(f.late_fee_amount) || 0, late_fee_percent: Number(f.late_fee_percent) || 0, updated_at: new Date().toISOString(),
}, { onConflict: "tenant_id" }).select().single()));
/** "auto": the system gives an approved renter a free room of the type they asked for. "manual": the manager chooses. */
export const saveRoomAssignment = guard(async (businessId, mode) => wrap(await supabase.from("tenant_settings").upsert({
  tenant_id: businessId, room_assignment: mode === "auto" ? "auto" : "manual", updated_at: new Date().toISOString(),
}, { onConflict: "tenant_id" }).select().single()));
export const saveMpesa = guard((businessId, shortcode, passkey) => rpc("save_mpesa_details", { p_business: businessId, p_shortcode: shortcode, p_passkey: passkey || null }));
export const getMpesaStatus = guard((businessId) => rpc("mpesa_status", { p_business: businessId }));

// ---- public side -----------------------------------------------------------------------
/** One row per room type with total and available rooms (and the free rooms when the type lets people pick). */
export const listRoomTypesPublic = guard((businessId) => rpc("list_room_types", { p_business: businessId }));
export const submitTypeRequest = guard((businessId, typeId, roomId, message, moveIn) => rpc("submit_type_request", {
  p_business: businessId, p_type: typeId, p_room: roomId || null, p_message: message || null, p_move_in: moveIn || null }));
export const myRequests = guard(() => rpc("my_requests", {}));
export const cancelRequest = guard((id) => rpc("cancel_request", { p_request: id }));
export const respondOffer = guard((id, accept) => rpc("respond_offer", { p_request: id, p_accept: accept }));
export const getPublicInvoice = guard((token) => rpc("get_public_invoice", { p_token: token }));
