// worker/v1/lifecycle.js — NEW FILE (replaces the Edge Functions delete-business, delete-account, purge-closed-businesses)
// AIM: the two "danger zone" actions and the daily clean-up. The rules live in the database functions
// (owner_close_business, account_delete_prepare, purge_business ...); this file only checks who is asking, asks for
// the password again, calls them, and removes the files afterwards.
//   POST /api/v1/fn/delete-business   { businessId, password }  -> { result: "closed" | "deleted" }
//   POST /api/v1/fn/delete-account    { password }               -> { ok: true }
//   purgeClosedBusinesses(env)        called by the daily cron (cron.js), not from a browser
// Files: R2 is cleaned DIRECTLY through the BIZKENIA_FILES binding (no extra web call), and any copies still in
// Supabase Storage are cleaned too, so this is right before, during and after the move to R2.
import { admin, anon } from "./supabase.js";
import { bearer, json, readJson, UUID, clientIp, tooMany } from "./http.js";

const DAY = 86_400_000;
const FOLDER_BUCKETS = new Set(["business-media", "avatars"]);

async function pathsFor(db, bucket, folder) {
  const { data } = await db.rpc("storage_paths_for", { p_bucket: bucket, p_folder: folder });
  return Array.isArray(data) ? data : [];
}

/** Removes everything under <bucket>/<folder>/ in R2, and the listed Supabase Storage copies. Never throws: the data is already gone, so a failure is only logged. */
export async function removeFolder(env, db, bucket, folder, supabasePaths = []) {
  if (!FOLDER_BUCKETS.has(bucket) || !UUID.test(String(folder))) return;
  try {
    for (let i = 0; i < supabasePaths.length; i += 100) {
      const r = await db.removeStorage(bucket, supabasePaths.slice(i, i + 100));
      if (r.error) console.error("[files] supabase removal failed", bucket, r.error.message);
    }
    if (env.BIZKENIA_FILES) {
      const prefix = `${bucket}/${folder}/`;
      let cursor;
      do {
        const page = await env.BIZKENIA_FILES.list({ prefix, cursor, limit: 500 });
        if (page.objects.length) await env.BIZKENIA_FILES.delete(page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    }
  } catch (e) { console.error("[files] removal error", bucket, folder, e && e.message); }
}

/** True when the password belongs to this email (signs in on a throw-away session and drops it at once). Same sign-in limits as the app. */
async function passwordIsCorrect(env, email, password) {
  if (!email || !password) return false;
  const a = anon(env);
  const r = await a.passwordSignIn(email, password);
  if (r.error) return false;
  await a.signOutLocal(r.session.access_token);
  return true;
}

export async function deleteBusiness(request, env) {
  const db = admin(env);
  const user = await db.userFor(bearer(request));
  if (!user) return json({ error: "Please sign in first." }, 401);
  if (tooMany(`delbiz:${user.id}`, 5, 60_000)) return json({ error: "Too many tries. Wait a minute and try again." }, 429);
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid request" }, 400);
  const businessId = String(body.businessId ?? ""), password = String(body.password ?? "");
  if (!UUID.test(businessId)) return json({ error: "Invalid request" }, 400);
  if (!password) return json({ error: "Enter your password to continue." }, 400);

  const { data: prof } = await db.one("profiles", { select: "is_active", filters: { id: `eq.${user.id}` } });
  if (prof && prof.is_active === false) return json({ error: "This account has been switched off." }, 403);
  if (!(await passwordIsCorrect(env, user.email, password))) return json({ error: "The password is not correct." }, 403);

  const files = await pathsFor(db, "business-media", businessId); // listed before the rows go, in case the business is removed at once
  const { data, error } = await db.rpc("owner_close_business", { p_user: user.id, p_business: businessId });
  if (error) return json({ error: error.message }, 400);
  if (data === "deleted") await removeFolder(env, db, "business-media", businessId, files);
  return json({ result: data });
}

export async function deleteAccount(request, env) {
  const db = admin(env);
  const user = await db.userFor(bearer(request));
  if (!user) return json({ error: "Please sign in first." }, 401);
  if (tooMany(`delacc:${user.id}`, 5, 60_000)) return json({ error: "Too many tries. Wait a minute and try again." }, 429);
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid request" }, 400);
  const password = String(body.password ?? "");
  if (!password) return json({ error: "Enter your password to continue." }, 400);
  if (!(await passwordIsCorrect(env, user.email, password))) return json({ error: "The password is not correct." }, 403);

  // 1. the database refuses a super admin, an owner of a live business, and a resident with an active tenancy
  const { data: prep, error: prepErr } = await db.rpc("account_delete_prepare", { p_user: user.id });
  if (prepErr) return json({ error: prepErr.message }, 400);

  // 2. businesses deleted within the last 60 days that this person owned go for good now
  for (const id of (prep?.purge ?? [])) {
    const files = await pathsFor(db, "business-media", id);
    const { error } = await db.rpc("purge_business", { p_business: id, p_force: true });
    if (error) return json({ error: error.message }, 400);
    await removeFolder(env, db, "business-media", id, files);
  }

  // 3. the login
  const pictures = await pathsFor(db, "avatars", user.id);
  const del = await db.deleteAuthUser(user.id);
  if (del.error) {
    console.error("[delete-account] deleteUser failed", del.error.message);
    return json({ error: "Your account could not be deleted. Please contact support." }, 500);
  }

  // 4. what is left of the person
  const { error: cleanErr } = await db.rpc("account_delete_cleanup", { p_user: user.id });
  if (cleanErr) console.error("[delete-account] cleanup failed", cleanErr.message);
  await removeFolder(env, db, "avatars", user.id, pictures);
  return json({ ok: true });
}

/**
 * Daily: 1. at day 50 a notification tells the owner the deleted business will be gone in 10 days;
 *        2. at day 60 the business is purged for good, then its files.
 * At most PURGE_BATCH businesses per run (default 8) to stay inside the free plan's 50 outbound requests; the rest go the next day.
 */
export async function purgeClosedBusinesses(env, now = Date.now()) {
  const db = admin(env);
  const batch = Math.min(Math.max(Number(env.PURGE_BATCH) || 8, 1), 10);

  const { data: soon } = await db.list("businesses", {
    select: "id,name,owner_user_id",
    filters: { status: "eq.closed", closed_by_admin: "eq.false", and: `(closed_at.lte.${new Date(now - 50 * DAY).toISOString()},closed_at.gt.${new Date(now - 51 * DAY).toISOString()})` },
    limit: 100,
  });
  const rows = (soon ?? []).filter((b) => b.owner_user_id).map((b) => ({
    user_id: b.owner_user_id, tenant_id: b.id, type: "system",
    title: "Your deleted business will be gone in 10 days",
    body: `${b.name} will be deleted for good in 10 days. Restore it from My businesses if you want to keep it.`,
    data: { business_id: b.id },
  }));
  let reminded = 0;
  if (rows.length) { const r = await db.insert("notifications", rows); if (!r.error) reminded = rows.length; }

  const { data: due, error: dueErr } = await db.rpc("businesses_due_for_purge");
  if (dueErr) return { error: dueErr.message, reminded };
  const purged = [], failed = [];
  for (const id of (Array.isArray(due) ? due : []).slice(0, batch)) {
    const files = await pathsFor(db, "business-media", id);
    const { error } = await db.rpc("purge_business", { p_business: id, p_force: false });
    if (error) { failed.push({ id, error: error.message }); continue; }
    await removeFolder(env, db, "business-media", id, files);
    purged.push(id);
  }
  return { reminded, purged: purged.length, failed, leftover: Math.max((Array.isArray(due) ? due.length : 0) - batch, 0) };
}
