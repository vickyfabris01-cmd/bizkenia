// delete-account — a person deletes his own account (My account > Danger zone).
// Body: { password }. He must sign in, and must type his password again.
// Order of work (nothing is done unless the checks pass):
//   1. account_delete_prepare refuses a super admin, a person who still owns a business that is not
//      deleted, and a resident with an active tenancy. It lists the owner's businesses that were
//      deleted within the last 60 days: nobody could restore them after this, so they go for good now.
//   2. those businesses are purged, and their files removed;
//   3. the login is deleted (records the person made stay, without his name);
//   4. the profile and notifications are removed, then his pictures.
// Answers { ok: true }.
import { corsFor, jsonFor } from "../_shared/http.ts";
import { adminClient, passwordIsCorrect, signedInUser } from "../_shared/auth.ts";
import { pathsFor, removePaths } from "../_shared/storage.ts";

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = jsonFor(cors);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = adminClient();
  const user = await signedInUser(req, admin);
  if (!user) return json({ error: "Please sign in first." }, 401);

  let body: { password?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const password = String(body.password ?? "");
  if (!password) return json({ error: "Enter your password to continue." }, 400);

  if (!(await passwordIsCorrect(user.email, password))) {
    return json({ error: "The password is not correct." }, 403);
  }

  const { data: prep, error: prepErr } = await admin.rpc("account_delete_prepare", { p_user: user.id });
  if (prepErr) return json({ error: prepErr.message }, 400);

  // 2. businesses deleted in the last 60 days that this person owned
  for (const id of ((prep as { purge?: string[] })?.purge ?? [])) {
    const files = await pathsFor(admin, "business-media", id);
    const { error } = await admin.rpc("purge_business", { p_business: id, p_force: true });
    if (error) return json({ error: error.message }, 400);
    if (files.length) await removePaths(admin, "business-media", files);
  }

  // 3. the login
  const pictures = await pathsFor(admin, "avatars", user.id);
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error("[delete-account] deleteUser failed", delErr.message);
    return json({ error: "Your account could not be deleted. Please contact support." }, 500);
  }

  // 4. what is left of the person
  const { error: cleanErr } = await admin.rpc("account_delete_cleanup", { p_user: user.id });
  if (cleanErr) console.error("[delete-account] cleanup failed", cleanErr.message);
  if (pictures.length) await removePaths(admin, "avatars", pictures);

  return json({ ok: true });
});
