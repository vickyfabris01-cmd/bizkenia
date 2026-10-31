// Login throttling, shared by the functions that check a password themselves (resolve-login now; the
// fingerprint sign-in part reuses it). The counting is done in the database (login_throttle_begin /
// login_throttle_finish, migration 20261027100005_login_attempts) so parallel guesses cannot slip past it.
// An attempt is recorded as a failure the moment it is allowed; call finishAttempt(..., true) when the
// password turns out to be right, which also clears that identifier's earlier failures.
// If the database cannot be reached the attempt is allowed (and the problem is logged), so a database
// hiccup never locks everybody out of signing in.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** More than this many failures inside the window blocks the next attempt. */
export const LOGIN_LIMITS = { identifierMax: 5, ipMax: 20, windowSeconds: 15 * 60 };

export type Attempt =
  | { allowed: true; attemptId: string | null }
  | { allowed: false; retryAfter: number };       // seconds

/**
 * The visitor's IP as the function receives it. cf-connecting-ip is set by Cloudflare in front of Supabase and
 * a visitor cannot choose it; x-real-ip is the fallback. x-forwarded-for is NOT used: a visitor can send their
 * own, which would let them pick a fresh IP bucket for every guess. Returns null when neither header is there,
 * and then only the per-phone limit applies.
 */
export function clientIp(req: Request): string | null {
  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "").trim();
  return ip ? ip.slice(0, 64) : null;
}

/** Asks whether this attempt may go ahead and records it. identifier is the phone number (or another stable key). */
export async function beginAttempt(
  admin: SupabaseClient, identifier: string, ip: string | null, limits = LOGIN_LIMITS,
): Promise<Attempt> {
  try {
    const { data, error } = await admin.rpc("login_throttle_begin", {
      p_identifier: identifier, p_ip: ip, p_identifier_max: limits.identifierMax,
      p_ip_max: limits.ipMax, p_window_seconds: limits.windowSeconds,
    });
    if (error || !data) throw new Error(error?.message ?? "no answer");
    if (data.allowed === false) return { allowed: false, retryAfter: Math.max(1, Number(data.retry_after) || 1) };
    return { allowed: true, attemptId: data.attempt_id ?? null };
  } catch (e) {
    console.error("[rateLimit] begin failed, allowing the attempt", (e as Error).message);
    return { allowed: true, attemptId: null };
  }
}

/** Marks an allowed attempt as successful (this clears the identifier's failures). Never throws. */
export async function finishAttempt(admin: SupabaseClient, attemptId: string | null, success: boolean) {
  if (!attemptId) return;
  try {
    const { error } = await admin.rpc("login_throttle_finish", { p_attempt: attemptId, p_success: success });
    if (error) console.error("[rateLimit] finish failed", error.message);
  } catch (e) { console.error("[rateLimit] finish failed", (e as Error).message); }
}

/** HTTP 429 with a generic message (it says nothing about whether the account exists) and Retry-After. */
export function tooManyAttempts(retryAfter: number, cors: Record<string, string>) {
  const minutes = Math.max(1, Math.ceil(retryAfter / 60));
  return new Response(JSON.stringify({
    error: `Too many sign-in attempts. Please wait ${minutes} ${minutes === 1 ? "minute" : "minutes"} and try again.`,
    retry_after: retryAfter,
  }), { status: 429, headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(retryAfter) } });
}
