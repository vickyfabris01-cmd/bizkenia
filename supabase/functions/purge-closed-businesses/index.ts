// purge-closed-businesses — run once a day by the scheduler (see docs/phase-6/STEP-1.md).
//   1. Day 50: a notification tells the owner his deleted business will be gone in 10 days.
//   2. Day 60: businesses deleted 60 days ago or more are purged for good (every row of the business
//      goes; the platform's subscription and payment records stay, without the link), then their files.
// Deploy WITHOUT the sign-in check (it is called by the scheduler, not by a browser) and protect it with
// the CRON_SECRET secret, sent in the x-cron-secret header:
//   supabase functions deploy purge-closed-businesses --no-verify-jwt
// Answers { reminded, purged, failed: [{ id, error }] }.
import { corsFor, jsonFor } from "../_shared/http.ts";
import { adminClient } from "../_shared/auth.ts";
import { pathsFor, removeFolder } from "../_shared/storage.ts";

const DAY = 86_400_000;

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = jsonFor(cors);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Not allowed" }, 401);

  const admin = adminClient();
  const now = Date.now();

  // 1. reminders: closed 50 to 51 days ago, so each business is reminded once by a daily job
  let reminded = 0;
  const { data: soon } = await admin.from("businesses").select("id, name, owner_user_id")
    .eq("status", "closed").eq("closed_by_admin", false)
    .lte("closed_at", new Date(now - 50 * DAY).toISOString())
    .gt("closed_at", new Date(now - 51 * DAY).toISOString());
  for (const b of soon ?? []) {
    if (!b.owner_user_id) continue;
    const { error } = await admin.from("notifications").insert({
      user_id: b.owner_user_id, tenant_id: b.id, type: "system",
      title: "Your deleted business will be gone in 10 days",
      body: `${b.name} will be deleted for good in 10 days. Restore it from My businesses if you want to keep it.`,
      data: { business_id: b.id },
    });
    if (!error) reminded++;
  }

  // 2. purge
  const purged: string[] = [];
  const failed: { id: string; error: string }[] = [];
  const { data: due, error: dueErr } = await admin.rpc("businesses_due_for_purge");
  if (dueErr) return json({ error: dueErr.message }, 500);
  for (const id of (due as string[] | null) ?? []) {
    const files = await pathsFor(admin, "business-media", id);
    const { error } = await admin.rpc("purge_business", { p_business: id, p_force: false });
    if (error) { failed.push({ id, error: error.message }); continue; }
    await removeFolder(admin, "business-media", id, files);
    purged.push(id);
  }
  return json({ reminded, purged: purged.length, failed });
});
