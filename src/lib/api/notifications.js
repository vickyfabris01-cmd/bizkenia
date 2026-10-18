// src/lib/api/notifications.js — NEW FILE
// The signed-in person's in-app notifications (Phase 1 shows them on My businesses and the
// business dashboard; Phase 3 builds the full screens on the same functions).

import { supabase } from "../../config/supabase.js";

export async function listMyNotifications(limit = 10) {
  if (!supabase) return { data: [], error: null };
  const { data, error } = await supabase.from("notifications")
    .select("id, type, title, body, data, link, is_read, created_at, tenant_id")
    .order("created_at", { ascending: false }).limit(limit);
  return { data: data || [], error: error?.message || null };
}

export async function markNotificationRead(id) {
  return supabase.from("notifications").update({ is_read: true }).eq("id", id);
}

export async function markAllRead() {
  return supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
}

export async function unreadCount() {
  if (!supabase) return 0;
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false);
  return count || 0;
}
