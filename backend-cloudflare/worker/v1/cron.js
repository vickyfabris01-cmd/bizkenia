// worker/v1/cron.js — NEW FILE
// AIM: the timers, run by Cloudflare (free) instead of pg_cron + pg_net inside Supabase.
// They are listed under "triggers" in wrangler.jsonc. Each cron string below must match one there.
//   "*/10 * * * *"  reconcile: ask Safaricom about prompts that never got an answer (cheap when nothing is pending)
//   "0 2 * * *"     purge-closed-businesses: 02:00 UTC = 05:00 Nairobi
// A timer has no HTTP request, so it needs no secret. To run one by hand see the /api/v1/cron/* route in router.js (CRON_SECRET).
import { reconcile } from "./mpesa.js";
import { purgeClosedBusinesses } from "./lifecycle.js";

export const RECONCILE_CRON = "*/10 * * * *";
export const PURGE_CRON = "0 2 * * *";

export async function runScheduled(controller, env) {
  try {
    if (controller.cron === RECONCILE_CRON) console.log("[cron] reconcile", JSON.stringify(await reconcile(env)));
    else if (controller.cron === PURGE_CRON) console.log("[cron] purge", JSON.stringify(await purgeClosedBusinesses(env)));
    else console.log("[cron] unknown schedule", controller.cron);
  } catch (e) {
    console.error("[cron] failed", controller.cron, e && e.message);
  }
}
