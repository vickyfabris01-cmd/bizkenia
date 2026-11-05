// worker/v1/router.js — NEW FILE
// AIM: the front door of the backend. Every address under /api/v1/ (and /sitemap.xml) lands here.
//
//   GET  /api/v1/health                      is the Worker alive. With header X-Cron-Secret it also lists which settings are filled in.
//   GET  /api/v1/public/<name>               cached public reads (public.js)
//   POST /api/v1/fn/<name>                   the former Supabase Edge Functions, same names, same bodies, same answers:
//                                            mpesa-stk-push, mpesa-status, resolve-login, send-email, delete-business, delete-account
//   POST /api/v1/mpesa/callback?secret=      Safaricom's answer (mpesa.js)
//   POST /api/v1/cron/<job>                  run a timer by hand: reconcile | purge   (header X-Cron-Secret = CRON_SECRET)
//   GET  /sitemap.xml                        search-engine sitemap (sitemap.js)
//
// Every answer uses one error shape { error, code? }. Nothing here returns a stack trace or a secret.
// SECRET: CRON_SECRET  any long random text YOU invent; only used for the by-hand /cron/* and detailed /health calls.
import { corsHeaders, json, sameSecret } from "./http.js";
import { callback, reconcile, status, stkPush } from "./mpesa.js";
import { handlePublic } from "./public.js";
import { resolveLogin } from "./login.js";
import { sendEmail } from "./email.js";
import { deleteAccount, deleteBusiness, purgeClosedBusinesses } from "./lifecycle.js";
import { sitemap } from "./sitemap.js";

const FUNCTIONS = {
  "mpesa-stk-push": stkPush,
  "mpesa-status": status,
  "resolve-login": resolveLogin,
  "send-email": sendEmail,
  "delete-business": deleteBusiness,
  "delete-account": deleteAccount,
};

// Names of every setting the Worker can use, so /health can say which are still empty (never their values).
const SETTINGS = {
  required: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
  mpesa: ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_PASSKEY", "MPESA_CALLBACK_SECRET", "PUBLIC_BASE_URL"],
  other: ["CRON_SECRET", "RESEND_API_KEY", "MAIL_FROM", "SITE_URL", "ALLOWED_ORIGINS"],
};
const isFilled = (v) => Boolean(v) && !/YOUR-LIVE|CHANGE_ME|PASTE_/.test(String(v)); // placeholders count as empty

function health(request, env) {
  const base = { ok: true, service: "bizkenia-api", version: 1 };
  if (!env.CRON_SECRET || !sameSecret(request.headers.get("X-Cron-Secret") || "", env.CRON_SECRET)) return json(base);
  const report = {};
  for (const [group, names] of Object.entries(SETTINGS)) report[group] = Object.fromEntries(names.map((n) => [n, isFilled(env[n])]));
  report.r2 = Boolean(env.BIZKENIA_FILES);
  return json({ ...base, settings: report });
}

export async function handleV1(request, env, ctx) {
  const cors = corsHeaders(request, env);
  const done = (res) => { for (const [k, v] of Object.entries(cors)) res.headers.set(k, v); return res; };
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  try {
    if (path === "/sitemap.xml" || path === "/api/v1/sitemap") return request.method === "GET" ? await sitemap(request, env, ctx) : done(json({ error: "Method not allowed" }, 405));
    if (path === "/api/v1/health") return done(health(request, env));

    let m;
    if ((m = /^\/api\/v1\/public\/([a-z-]+)$/.exec(path))) return done(await handlePublic(request, env, ctx, m[1]));

    if (path === "/api/v1/mpesa/callback") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return await callback(request, env); // Safaricom, not a browser: no CORS headers needed
    }

    if ((m = /^\/api\/v1\/fn\/([a-z-]+)$/.exec(path))) {
      const fn = FUNCTIONS[m[1]];
      if (!fn) return done(json({ error: "Not found." }, 404));
      if (request.method !== "POST") return done(json({ error: "Method not allowed" }, 405));
      return done(await fn(request, env, ctx));
    }

    if ((m = /^\/api\/v1\/cron\/([a-z-]+)$/.exec(path))) {
      if (request.method !== "POST") return done(json({ error: "Method not allowed" }, 405));
      if (!env.CRON_SECRET || !sameSecret(request.headers.get("X-Cron-Secret") || "", env.CRON_SECRET)) return done(json({ error: "Not allowed" }, 401));
      if (m[1] === "reconcile") return done(json(await reconcile(env)));
      if (m[1] === "purge") return done(json(await purgeClosedBusinesses(env)));
      return done(json({ error: "Not found." }, 404));
    }
    return done(json({ error: "Not found." }, 404));
  } catch (err) {
    console.error("[v1]", path, err && err.message); // the message only; never the request body
    return done(json({ error: "Something went wrong. Try again." }, 500));
  }
}
