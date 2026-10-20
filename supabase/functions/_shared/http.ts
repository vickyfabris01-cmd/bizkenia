// Shared by the edge functions that browsers call (not by the M-Pesa callback, which Safaricom calls).
// ALLOWED_ORIGINS (Supabase > Edge Functions > Secrets) is a comma-separated list such as
// "https://bizkenia.co.ke,https://www.bizkenia.co.ke". When it is set, only those sites may call the
// functions from a browser. When it is not set, any site may (fine for development).
export function corsFor(req: Request) {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  const allow = allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
    "Vary": "Origin",
  };
}

export const jsonFor = (cors: Record<string, string>) => (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });