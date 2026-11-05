// worker/v1/supabase.js — NEW FILE
// AIM: the only place the Worker talks to Supabase. Plain fetch against PostgREST and the Auth API, no library.
//   admin(env)  full rights (service role). Server-side jobs and money flows ONLY. Never for a plain browser read.
//   anon(env)   what any visitor may see (row-level security still applies).
// Every method returns { data, error } and never throws on a Supabase error answer.
//
// SECRETS (set with `npx wrangler secret put <NAME>` from the project folder, never in a file):
//   SUPABASE_SERVICE_ROLE_KEY   Supabase > Project Settings > API > "service_role" (secret) key. NEVER commit it.
// PUBLIC VALUES (wrangler.jsonc "vars"): SUPABASE_URL, SUPABASE_ANON_KEY.

const enc = encodeURIComponent;

function client(env, key) {
  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const headers = (extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra });

  async function send(url, init) {
    let res;
    try { res = await fetch(url, init); } catch (e) { return { data: null, error: { message: "Could not reach the database.", status: 0 }, res: null }; }
    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    if (!res.ok) return { data: null, error: { message: (data && (data.message || data.msg || data.error_description || data.error)) || `Database error ${res.status}`, status: res.status, code: data?.code }, res };
    return { data, error: null, res };
  }

  // filters: { column: "eq.value" | "gte.value" | ... } ; order: "created_at.desc"
  const qs = (select, filters = {}, extra = {}) => {
    const p = [`select=${enc(select || "*")}`];
    for (const [k, v] of Object.entries(filters)) p.push(`${enc(k)}=${enc(v)}`);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) p.push(`${enc(k)}=${enc(v)}`);
    return p.join("&");
  };

  return {
    /** Rows of a table. Returns { data: [...] }. */
    async list(table, { select = "*", filters = {}, order, limit, offset, count } = {}) {
      const r = await send(`${base}/rest/v1/${table}?${qs(select, filters, { order, limit, offset })}`, { headers: headers(count ? { Prefer: "count=exact" } : {}) });
      if (!r.error && count) {
        const m = /\/(\d+)$/.exec(r.res.headers.get("content-range") || "");
        r.count = m ? Number(m[1]) : (r.data || []).length;
      }
      return r;
    },
    /** One row or null. */
    async one(table, opts = {}) {
      const r = await this.list(table, { ...opts, limit: 1 });
      return { data: r.error ? null : (r.data?.[0] ?? null), error: r.error };
    },
    insert(table, row) {
      return send(`${base}/rest/v1/${table}`, { method: "POST", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(row) });
    },
    /** Changes rows. Needs at least one filter. { returning: true } answers with the changed rows (to learn whether this call won a race). */
    update(table, filters, patch, { returning = false } = {}) {
      if (!filters || Object.keys(filters).length === 0) return Promise.resolve({ data: null, error: { message: "Refusing an update with no filter.", status: 0 } });
      return send(`${base}/rest/v1/${table}?${qs("*", filters).replace(/^select=[^&]*&?/, "")}`, { method: "PATCH", headers: headers({ Prefer: returning ? "return=representation" : "return=minimal" }), body: JSON.stringify(patch) });
    },
    rpc(name, args = {}) {
      return send(`${base}/rest/v1/rpc/${name}`, { method: "POST", headers: headers(), body: JSON.stringify(args) });
    },
    /** The signed-in person behind a token (asks Supabase Auth, so revoked or deleted accounts are refused). */
    async userFor(token) {
      if (!token) return null;
      const r = await send(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
      return r.error || !r.data?.id ? null : r.data;
    },
    /** Signs in with email + password. Returns { session } or { error }. */
    async passwordSignIn(email, password) {
      const r = await send(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      return r.error || !r.data?.access_token ? { error: r.error || { message: "No session" } } : { session: r.data };
    },
    signOutLocal(accessToken) {
      return send(`${base}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${accessToken}` } });
    },
    deleteAuthUser(id) {
      return send(`${base}/auth/v1/admin/users/${enc(id)}`, { method: "DELETE", headers: headers() });
    },
    /** Removes files from Supabase Storage (only needed while old files still live there). */
    removeStorage(bucket, paths) {
      return send(`${base}/storage/v1/object/${enc(bucket)}`, { method: "DELETE", headers: headers(), body: JSON.stringify({ prefixes: paths }) });
    },
  };
}

export const admin = (env) => client(env, env.SUPABASE_SERVICE_ROLE_KEY || "");
export const anon = (env) => client(env, env.SUPABASE_ANON_KEY || "");
