// src/lib/api/adminStorage.js — NEW FILE (Part 9)
// AIM: talks to the Worker route /api/admin/storage (storage used per business). Super admin only.
// The Worker keeps its answer for 10 minutes; getStorageUsage({ refresh: true }) lists R2 again.
// Returns { data, error } and never throws.

import { supabase } from "../../config/supabase.js";

export async function getStorageUsage({ refresh = false } = {}) {
  if (!supabase) return { data: null, error: "The app is not connected to the database yet." };
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  if (!token) return { data: null, error: "Please sign in again." };
  try {
    const res = await fetch(`/api/admin/storage${refresh ? "?refresh=1" : ""}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: body.error || "Something went wrong. Try again." };
    return { data: body, error: null };
  } catch {
    return { data: null, error: "Could not reach the server. Check your connection and try again." };
  }
}
