import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Environment variables
// Set these in your .env file:
//
//   VITE_SUPABASE_URL=https://xyzxyzxyz.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
//
// Never commit real keys. The anon key is safe to expose in the browser
// because Row Level Security (RLS) is enabled on every table.
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY= import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isSupabaseConfigured) {
  console.warn(
    "[supabase.js] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
    "The app is running without Supabase. Copy .env.example to .env to enable authentication and data."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Password-recovery landing fix
// A recovery email link can land on any page (e.g. "/") when the redirect URL
// is not allow-listed in Supabase. The recovery token arrives in the URL hash
// (#access_token=...&type=recovery). If we see it, move the browser to the
// reset page BEFORE the client is created, keeping the hash so Supabase can
// still read the token and sign the user in for the password change.
// ─────────────────────────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
  const { pathname, hash, search } = window.location;
  const isRecovery =
    hash.includes("type=recovery") || search.includes("type=recovery");

  if (isRecovery && pathname !== "/reset-password") {
    window.history.replaceState(null, "", "/reset-password?type=recovery" + hash);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Client singleton
// auth.persistSession: true  — stores the JWT in localStorage so the user
//   stays logged in across page refreshes (Supabase default behaviour).
// auth.autoRefreshToken: true — silently refreshes the JWT before expiry.
// realtime.params.eventsPerSecond — throttle realtime broadcast rate.
// ─────────────────────────────────────────────────────────────────────────────
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:   true,
    autoRefreshToken: true,
    detectSessionInUrl: true,   // Required for magic links & OAuth
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    headers: {
      "x-application-name": "bizkenia",
    },
  },
  })
  : null;

// Table helper used by the notification store (other screens call supabase.from(...) directly).
export const db = {
  notifications: () => supabase.from("notifications"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Realtime channel factory
// Creates a named channel so components can subscribe to specific tables.
//
// Usage:
//   const channel = realtimeChannel("payments-feed")
//     .on("postgres_changes", {
//       event: "INSERT",
//       schema: "public",
//       table: "payments",
//       filter: `tenant_id=eq.${tenantId}`,
//     }, (payload) => console.log(payload))
//     .subscribe();
//
//   // Cleanup on unmount:
//   return () => supabase.removeChannel(channel);
// ─────────────────────────────────────────────────────────────────────────────
export const realtimeChannel = (name) => supabase.channel(name);

export default supabase;