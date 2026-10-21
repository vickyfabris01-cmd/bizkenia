// src/lib/api/people.js — NEW FILE
//
// AIM
// Phase 3: everything the people-and-communication screens ask of the database, grouped by screen:
// resident portal, complaints, transfers, announcements, workforce, messaging, notifications, help desk.
// Every function returns { data, error } and never throws. Reads use the tables (row-level security decides
// who sees what); writes call the database functions from migrations p3_01 to p3_06.

import { supabase } from "../../config/supabase.js";

const wrap = ({ data, error }) => ({ data: data ?? null, error: error?.message || null });
const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet." };
const guard = (fn) => (...args) => (supabase ? fn(...args) : Promise.resolve(NOT_CONNECTED));
const rpc = (name, args) => supabase.rpc(name, args).then(wrap);
const PROFILE = "id, full_name, email, phone, avatar_url";

// ---- resident portal ---------------------------------------------------------------------
/** The signed-in resident's current tenancy with room details. */
export const myTenancy = guard(async (businessId) => {
  const { data, error } = await supabase.from("tenancies")
    .select("*, room:rooms(id, room_number, room_type, description, amenities, images, floor:floors(floor_name), building:buildings(name, address))")
    .eq("tenant_id", businessId).eq("status", "active").maybeSingle();
  return { data, error: error?.message || null };
});
export const myCycles = guard(async (businessId) =>
  wrap(await supabase.from("billing_cycles").select("*").eq("tenant_id", businessId).order("period_start", { ascending: false })));
export const myPayments = guard(async (businessId) =>
  wrap(await supabase.from("payments").select("*, cycle:billing_cycles(invoice_number, period_start, period_end)")
    .eq("tenant_id", businessId).order("created_at", { ascending: false }).limit(200)));

// ---- complaints --------------------------------------------------------------------------
const CMP = `*, who:profiles!complaints_submitted_by_fkey(${PROFILE}), assignee:profiles!complaints_assigned_to_fkey(id, full_name, email), tenancy:tenancies(room:rooms(room_number, building:buildings(name)))`;
export const listComplaints = guard(async (businessId) =>
  wrap(await supabase.from("complaints").select(CMP).eq("tenant_id", businessId).order("created_at", { ascending: false })));
export const complaintMessages = guard(async (complaintId) =>
  wrap(await supabase.from("complaint_messages").select(`*, sender:profiles!complaint_messages_sender_id_fkey(${PROFILE})`)
    .eq("complaint_id", complaintId).order("created_at")));
export const createComplaint = guard((businessId, f) => rpc("create_complaint", {
  p_business: businessId, p_title: f.title, p_body: f.body || null, p_category: f.category, p_priority: f.priority || "normal" }));
export const postComplaintMessage = guard((id, body) => rpc("post_complaint_message", { p_complaint: id, p_body: body }));
export const updateComplaint = guard((id, f) => rpc("update_complaint", {
  p_complaint: id, p_status: f.status ?? null, p_priority: f.priority ?? null, p_assigned: f.assigned ?? null }));
export const assignablePeople = guard((businessId) => rpc("assignable_people", { p_business: businessId }));

// ---- transfers ---------------------------------------------------------------------------
const TRF = `*, who:profiles!room_transfers_requested_by_fkey(${PROFILE}), from_room:rooms!room_transfers_from_room_id_fkey(room_number, building:buildings(name)), to_room:rooms!room_transfers_to_room_id_fkey(room_number, building:buildings(name))`;
export const listTransfers = guard(async (businessId) =>
  wrap(await supabase.from("room_transfers").select(TRF).eq("tenant_id", businessId).order("created_at", { ascending: false })));
export const requestTransfer = guard((businessId, roomId, reason) => rpc("request_transfer", { p_business: businessId, p_to_room: roomId || null, p_reason: reason }));
export const cancelTransfer = guard((id) => rpc("cancel_transfer", { p_transfer: id }));
export const decideTransfer = guard((id, f) => rpc("decide_transfer", {
  p_transfer: id, p_approve: f.approve, p_to_room: f.room || null, p_effective: f.effective || null, p_note: f.note || null }));
export const availableRooms = guard(async (businessId) =>
  wrap(await supabase.from("rooms").select("id, room_number, room_type, monthly_price, semester_price, building:buildings(name)")
    .eq("tenant_id", businessId).eq("status", "available").order("room_number")));

// ---- announcements -----------------------------------------------------------------------
export const listAnnouncements = guard(async (businessId) => {
  const [a, r] = await Promise.all([
    supabase.from("announcements").select(`*, author:profiles!announcements_author_id_fkey(full_name), building:buildings(name), floor:floors(floor_name)`)
      .eq("business_id", businessId).order("pinned", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("announcement_reads").select("announcement_id"),
  ]);
  if (a.error) return { data: null, error: a.error.message };
  const read = new Set((r.data || []).map((x) => x.announcement_id));
  return { data: (a.data || []).map((x) => ({ ...x, is_read: read.has(x.id) })), error: null };
});
export const postAnnouncement = guard((businessId, f) => rpc("post_announcement", {
  p_business: businessId, p_title: f.title, p_body: f.body, p_audience: f.audience,
  p_building: f.audience === "building" ? f.building : null, p_floor: f.audience === "floor" ? f.floor : null, p_pinned: !!f.pinned }));
export const deleteAnnouncement = guard((id) => rpc("delete_announcement", { p_announcement: id }));
export const markAnnouncementRead = guard((id) => rpc("mark_announcement_read", { p_announcement: id }));
export const listBuildingsFloors = guard(async (businessId) => {
  const [b, f] = await Promise.all([
    supabase.from("buildings").select("id, name").eq("tenant_id", businessId).order("name"),
    supabase.from("floors").select("id, building_id, floor_number, floor_name").eq("tenant_id", businessId).order("floor_number"),
  ]);
  return { data: { buildings: b.data || [], floors: f.data || [] }, error: b.error?.message || f.error?.message || null };
});

// ---- workforce ---------------------------------------------------------------------------
export const listWorkers = guard(async (businessId) =>
  wrap(await supabase.from("workers").select("*").eq("tenant_id", businessId).order("full_name")));
export const addWorker = guard((businessId, f) => rpc("add_worker", {
  p_business: businessId, p_email: f.email || null, p_name: f.name, p_phone: f.phone || null, p_role: f.role,
  p_salary: Number(f.salary), p_pay_cycle: f.pay_cycle, p_start: f.start || null }));
export const setWorkerStatus = guard((id, status) => rpc("set_worker_status", { p_worker: id, p_status: status }));
export const updateWorker = guard(async (id, f) => wrap(await supabase.from("workers").update({
  full_name: f.name, phone: f.phone || null, role: f.role, salary: Number(f.salary), pay_cycle: f.pay_cycle }).eq("id", id)));
export const listAttendance = guard(async (businessId, from, to) =>
  wrap(await supabase.from("attendance").select("*").eq("tenant_id", businessId).gte("date", from).lte("date", to)));
export const markAttendance = guard((workerId, date, status, notes) => rpc("mark_attendance", { p_worker: workerId, p_date: date, p_status: status, p_notes: notes || null }));
export const listWorkerPayments = guard(async (businessId) =>
  wrap(await supabase.from("worker_payments").select("*").eq("tenant_id", businessId).order("paid_at", { ascending: false }).limit(300)));
export const payWorker = guard((workerId, f) => rpc("pay_worker", {
  p_worker: workerId, p_amount: Number(f.amount), p_start: f.start, p_end: f.end, p_method: f.method, p_notes: f.notes || null }));
export const payrollSummary = guard((businessId, month) => rpc("payroll_summary", { p_business: businessId, p_month: month }));

// worker portal
export const myWorker = guard(async (businessId) =>
  wrap(await supabase.from("workers").select("*").eq("tenant_id", businessId).eq("status", "active").maybeSingle()));
export const myAttendance = guard(async (workerId, from) =>
  wrap(await supabase.from("attendance").select("*").eq("worker_id", workerId).gte("date", from).order("date", { ascending: false })));
export const myWorkerPayments = guard(async (workerId) =>
  wrap(await supabase.from("worker_payments").select("*").eq("worker_id", workerId).order("paid_at", { ascending: false })));
export const checkIn = guard((businessId) => rpc("worker_check_in", { p_business: businessId }));
export const checkOut = guard((businessId) => rpc("worker_check_out", { p_business: businessId }));
export const claimWorkerLinks = guard(() => rpc("claim_worker_links", {}));

// ---- messaging ---------------------------------------------------------------------------
export const myConversations = guard((businessId) => rpc("my_conversations", { p_business: businessId }));
export const messageContacts = guard((businessId) => rpc("message_contacts", { p_business: businessId }));
export const startConversation = guard((businessId, otherId) => rpc("start_conversation", { p_business: businessId, p_other: otherId }));
export const listMessages = guard(async (conversationId) =>
  wrap(await supabase.from("messages").select("id, sender_id, body, created_at").eq("conversation_id", conversationId).order("created_at")));
export const sendMessage = guard((conversationId, body) => rpc("send_message", { p_conversation: conversationId, p_body: body }));
export const markConversationRead = guard((conversationId) => rpc("mark_conversation_read", { p_conversation: conversationId }));
/** Calls onInsert(message) for every new message of one conversation. Returns an unsubscribe function. */
export function subscribeMessages(conversationId, onInsert) {
  if (!supabase) return () => {};
  const ch = supabase.channel(`msgs-${conversationId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (p) => onInsert(p.new))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ---- notifications -----------------------------------------------------------------------
export const listNotifications = guard(async ({ limit = 100, unreadOnly = false } = {}) => {
  let q = supabase.from("notifications").select("id, type, title, body, link, is_read, created_at, tenant_id, business:businesses(name)")
    .order("created_at", { ascending: false }).limit(limit);
  if (unreadOnly) q = q.eq("is_read", false);
  return wrap(await q);
});
export const deleteNotification = guard(async (id) => wrap(await supabase.from("notifications").delete().eq("id", id)));
export const getPreferences = guard(async () => wrap(await supabase.from("notification_preferences").select("category, enabled")));
export const setPreference = guard(async (userId, category, enabled) =>
  wrap(await supabase.from("notification_preferences").upsert({ user_id: userId, category, enabled, updated_at: new Date().toISOString() })));
/** Calls onInsert(row) whenever a notification arrives for the signed-in person. */
export function subscribeNotifications(userId, onInsert) {
  if (!supabase || !userId) return () => {};
  const ch = supabase.channel(`notes-${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (p) => onInsert(p.new))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ---- help desk ---------------------------------------------------------------------------
export const listArticles = guard(async () =>
  wrap(await supabase.from("help_articles").select("*").order("sort").order("title")));
export const saveArticle = guard(async (f) => wrap(await supabase.from("help_articles").upsert({
  ...(f.id ? { id: f.id } : {}), slug: f.slug, title: f.title, body: f.body, category: f.category, audience: f.audience,
  sort: Number(f.sort) || 100, published: !!f.published, updated_at: new Date().toISOString() })));
export const deleteArticle = guard(async (id) => wrap(await supabase.from("help_articles").delete().eq("id", id)));
export const listTickets = guard(async () =>
  wrap(await supabase.from("support_tickets").select(`*, who:profiles!support_tickets_user_id_fkey(${PROFILE})`).order("last_message_at", { ascending: false })));
export const ticketMessages = guard(async (id) =>
  wrap(await supabase.from("ticket_messages").select("*").eq("ticket_id", id).order("created_at")));
export const createTicket = guard((f) => rpc("create_ticket", { p_subject: f.subject, p_body: f.body, p_category: f.category || "general", p_business: f.business || null }));
export const replyTicket = guard((id, body, status) => rpc("reply_ticket", { p_ticket: id, p_body: body, p_status: status || null }));
export const setTicketStatus = guard((id, status) => rpc("set_ticket_status", { p_ticket: id, p_status: status }));
