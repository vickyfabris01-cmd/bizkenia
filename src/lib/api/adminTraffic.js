// src/lib/api/adminTraffic.js — NEW FILE
import { supabase } from "../../config/supabase.js";

export async function getTrafficStats({ from, to }) {
  if (!supabase) return { data: null, error: "The app is not connected to the database yet." };
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  if (!token) return { data: null, error: "Please sign in again." };
  try {
    const res = await fetch(`/api/admin/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: body.error || "Could not load the statistics." };
    return { data: body, error: null };
  } catch {
    return { data: null, error: "Could not reach the server. Check your connection and try again." };
  }
}
