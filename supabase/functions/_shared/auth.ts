// Shared by the functions that act for a signed-in person after asking for their password again
// (delete-business, delete-account). Nothing here is used by the M-Pesa callback.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/** A client with full rights. Only ever used on the server. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** The signed-in person behind the request, or null. */
export async function signedInUser(req: Request, admin: SupabaseClient) {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data?.user ?? null;
}

/**
 * True when the password belongs to this email. It signs in on a throw-away client (the person's
 * real session is untouched) and drops that new session straight away. The platform's own sign-in
 * rate limits apply, so this cannot be used to guess passwords quickly.
 */
export async function passwordIsCorrect(email: string | undefined, password: string): Promise<boolean> {
  if (!email || !password) return false;
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  await anon.auth.signOut({ scope: "local" });
  return true;
}
