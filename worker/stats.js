// worker/stats.js — MODIFIED (storage query now also selects datetime)
// GET /api/admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD  (super admin only)
// Needs: secret CF_API_TOKEN; vars CF_ACCOUNT_ID, CF_SITE_TAG, optional R2_BUCKET_NAME.

const GQL = "https://api.cloudflare.com/client/v4/graphql";
const DAY = 86400000;
const GB = 1024 ** 3;
const FREE = { storage: 10 * GB, classA: 1000000, classB: 10000000 };
const MAX_DAYS = 180;
const R2_HISTORY_DAYS = 31;

const CLASS_A = new Set(["ListBuckets", "PutBucket", "ListObjects", "PutObject", "CopyObject", "CompleteMultipartUpload", "CreateMultipartUpload", "ListMultipartUploads", "UploadPart", "UploadPartCopy", "ListParts", "PutBucketEncryption", "PutBucketCors", "PutBucketLifecycleConfiguration"]);
const CLASS_B = new Set(["HeadBucket", "HeadObject", "GetObject", "UsageSummary", "GetBucketEncryption", "GetBucketLocation", "GetBucketCors", "GetBucketLifecycleConfiguration"]);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const iso = (ms) => new Date(ms).toISOString();
const ymd = (ms) => iso(ms).slice(0, 10);

async function whoIs(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return 401;
  let res;
  try {
    res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_super_admin`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
  } catch { return 502; }
  if (res.status === 401) return 401;
  if (!res.ok) return 502;
  return (await res.json()) === true ? 200 : 403;
}

async function gql(env, query, variables) {
  const res = await fetch(GQL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`Cloudflare answered ${res.status}.`);
  if (body.errors && body.errors.length) throw new Error(String(body.errors[0].message || "Cloudflare refused the query."));
  return (body.data && body.data.viewer && body.data.viewer.accounts && body.data.viewer.accounts[0]) || {};
}

const F = "filter:{siteTag:$site,datetime_geq:$since,datetime_lt:$until}";
const RUM = `query($acc:String!,$site:String!,$since:Time!,$until:Time!){viewer{accounts(filter:{accountTag:$acc}){
  totals:rumPageloadEventsAdaptiveGroups(limit:1,${F}){count sum{visits}}
  daily:rumPageloadEventsAdaptiveGroups(limit:400,orderBy:[date_ASC],${F}){count sum{visits} dimensions{date}}
  pages:rumPageloadEventsAdaptiveGroups(limit:15,orderBy:[count_DESC],${F}){count sum{visits} dimensions{requestPath}}
  countries:rumPageloadEventsAdaptiveGroups(limit:10,orderBy:[count_DESC],${F}){count sum{visits} dimensions{countryName}}
  devices:rumPageloadEventsAdaptiveGroups(limit:6,orderBy:[count_DESC],${F}){count sum{visits} dimensions{deviceType}}
  referrers:rumPageloadEventsAdaptiveGroups(limit:10,orderBy:[count_DESC],${F}){count sum{visits} dimensions{refererHost}}
}}}`;

const rows = (list, key, empty) =>
  (list || []).map((g) => ({ name: g.dimensions[key] || empty, views: Number(g.count || 0), visits: Number((g.sum && g.sum.visits) || 0) }));

async function traffic(env, fromMs, toMs) {
  const a = await gql(env, RUM, { acc: env.CF_ACCOUNT_ID, site: env.CF_SITE_TAG, since: iso(fromMs), until: iso(toMs + DAY) });
  const byDay = new Map((a.daily || []).map((g) => [g.dimensions.date, g]));
  const daily = [];
  for (let t = fromMs; t <= toMs; t += DAY) {
    const d = ymd(t), g = byDay.get(d);
    daily.push({ date: d, views: g ? Number(g.count || 0) : 0, visits: g && g.sum ? Number(g.sum.visits || 0) : 0 });
  }
  const t = (a.totals && a.totals[0]) || {};
  return {
    views: Number(t.count || 0),
    visits: Number((t.sum && t.sum.visits) || 0),
    daily,
    pages: rows(a.pages, "requestPath", "(unknown)"),
    countries: rows(a.countries, "countryName", "Unknown"),
    devices: rows(a.devices, "deviceType", "Unknown"),
    referrers: rows(a.referrers, "refererHost", "Direct or unknown"),
  };
}

const ops = (geq, end) => `(limit:10000,filter:{bucketName:$bucket,datetime_geq:${geq},datetime_${end}}){sum{requests} dimensions{actionType}}`;
const R2Q = `query($acc:String!,$bucket:String!,$since:Time!,$until:Time!,$month:Time!,$now:Time!,$recent:Time!){viewer{accounts(filter:{accountTag:$acc}){
  storage:r2StorageAdaptiveGroups(limit:1,orderBy:[datetime_DESC],filter:{bucketName:$bucket,datetime_geq:$recent,datetime_leq:$now}){max{objectCount payloadSize metadataSize} dimensions{datetime}}
  rangeOps:r2OperationsAdaptiveGroups${ops("$since", "lt:$until")}
  monthOps:r2OperationsAdaptiveGroups${ops("$month", "leq:$now")}
}}}`;

function classify(list) {
  let classA = 0, classB = 0, other = 0;
  const byAction = [];
  for (const g of list || []) {
    const name = g.dimensions.actionType, c = Number((g.sum && g.sum.requests) || 0);
    byAction.push({ name, requests: c });
    if (CLASS_A.has(name)) classA += c; else if (CLASS_B.has(name)) classB += c; else other += c;
  }
  byAction.sort((x, y) => y.requests - x.requests);
  return { classA, classB, other, byAction: byAction.slice(0, 12) };
}

async function r2(env, fromMs, toMs) {
  const now = Date.now();
  const oldest = now - R2_HISTORY_DAYS * DAY;
  const since = Math.max(fromMs, oldest), until = Math.min(toMs + DAY, now);
  const n = new Date(now);
  const a = await gql(env, R2Q, {
    acc: env.CF_ACCOUNT_ID,
    bucket: env.R2_BUCKET_NAME || "bizkenia-files",
    since: iso(Math.min(since, until)), until: iso(until),
    month: iso(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)),
    now: iso(now), recent: iso(now - 3 * DAY),
  });
  const s = (a.storage && a.storage[0] && a.storage[0].max) || {};
  return {
    storageBytes: Number(s.payloadSize || 0) + Number(s.metadataSize || 0),
    objects: Number(s.objectCount || 0),
    free: FREE,
    clamped: fromMs < oldest,
    range: classify(since < until ? a.rangeOps : []),
    month: classify(a.monthOps),
  };
}

export async function handleStats(request, env) {
  if (request.method !== "GET") return json({ error: "Not found." }, 404);
  const who = await whoIs(request, env);
  if (who === 401) return json({ error: "Please sign in again." }, 401);
  if (who === 403) return json({ error: "Only a super admin can see this." }, 403);
  if (who !== 200) return json({ error: "Could not check your permission. Try again." }, 502);
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_SITE_TAG)
    return json({ error: "Statistics are not set up yet. Add CF_API_TOKEN, CF_ACCOUNT_ID and CF_SITE_TAG to the Worker." }, 503);

  const q = new URL(request.url).searchParams;
  const from = q.get("from"), to = q.get("to");
  if (!isDate(from) || !isDate(to)) return json({ error: "Pick a valid start and end date." }, 400);
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Math.min(Date.parse(`${to}T00:00:00Z`), Date.parse(`${ymd(Date.now())}T00:00:00Z`));
  if (fromMs > toMs) return json({ error: "The start date must be before the end date." }, 400);
  if ((toMs - fromMs) / DAY + 1 > MAX_DAYS) return json({ error: `Pick a range of ${MAX_DAYS} days or less.` }, 400);

  const [t, r] = await Promise.allSettled([traffic(env, fromMs, toMs), r2(env, fromMs, toMs)]);
  return json({
    range: { from: ymd(fromMs), to: ymd(toMs) },
    traffic: t.status === "fulfilled" ? t.value : null,
    trafficError: t.status === "rejected" ? String(t.reason && t.reason.message) : null,
    r2: r.status === "fulfilled" ? r.value : null,
    r2Error: r.status === "rejected" ? String(r.reason && r.reason.message) : null,
  });
                                                                                                            }
