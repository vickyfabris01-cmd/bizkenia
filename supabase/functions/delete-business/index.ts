// delete-business — the owner deletes his business (Settings > Danger zone).
// Body: { businessId, password }. The owner must sign in, and must type his password again.
// What happens (the rules live in the database function owner_close_business):
//   - a business that never took payment (draft or awaiting payment) is removed at once, with its files;
//   - any other business is closed: hidden from everyone, kept for 60 days, the owner can restore it,
//     then the daily purge deletes it for good (see purge-closed-businesses);
//   - a business with an unfinished order or an active tenancy is refused;
//   - a suspended business is refused (support handles those).
// Answers { result: "closed" | "deleted" }.
import { corsFor, jsonFor } from "../_shared/http.ts";
import { adminClient, passwordIsCorrect, signedInUser } from "../_shared/auth.ts";
import { pathsFor, removePaths } from "../_shared/storage.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = jsonFor(cors);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = adminClient();
  const user = await signedInUser(req, admin);
  if (!user) return json({ error: "Please sign in first." }, 401);

  let body: { businessId?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const businessId = String(body.businessId ?? "");
  const password = String(body.password ?? "");
  if (!UUID.test(businessId)) return json({ error: "Invalid request" }, 400);
  if (!password) return json({ error: "Enter your password to continue." }, 400);

  const { data: prof } = await admin.from("profiles").select("is_active").eq("id", user.id).maybeSingle();
  if (prof && prof.is_active === false) return json({ error: "This account has been switched off." }, 403);

  if (!(await passwordIsCorrect(user.email, password))) {
    return json({ error: "The password is not correct." }, 403);
  }

  // Listed before the rows go, in case the business is removed at once.
  const files = await pathsFor(admin, "business-media", businessId);
  const { data, error } = await admin.rpc("owner_close_business", { p_user: user.id, p_business: businessId });
  if (error) return json({ error: error.message }, 400);

  if (data === "deleted" && files.length) await removePaths(admin, "business-media", files);
  return json({ result: data });
});
