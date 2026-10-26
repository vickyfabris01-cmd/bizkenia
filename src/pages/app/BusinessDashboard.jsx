// src/pages/app/BusinessDashboard.jsx — MODIFIED FILE (a "Rooms listed" card with Share buttons)
//
// AIM
// The business dashboard for owners and managers. Phase 2 adds the real picture: occupancy,
// residents, money collected this month, what is still owed and overdue, things that need an
// answer (new requests, unmatched payments), the biggest arrears and the latest payments.
// The getting-started checklist and the subscription card stay; the checklist now ticks itself
// from real data and disappears once every step is done.

import "../onboarding/Onboarding.css";
import "../rental/Rental.css";
import { Link } from "react-router-dom";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Icon, Skeleton } from "../../components/ui";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import ShareShelf from "../../components/share/ShareShelf.jsx";
import useAsync from "../../hooks/useAsync.js";
import { supabase } from "../../config/supabase.js";
import { getDashboard, getMpesaStatus } from "../../lib/api/rental.js";
import { formatDate } from "../../lib/format.js";
import { METHOD, Stat, money } from "../rental/shared.jsx";

async function loadSubscription(businessId) {
  if (!supabase) return { data: null, error: null };
  const { data, error } = await supabase.from("business_subscriptions").select("*, plan:subscription_plans(name)")
    .eq("business_id", businessId).order("period_end", { ascending: false }).limit(1).maybeSingle();
  return { data, error: error?.message || null };
}

async function loadAll(businessId, isOwner) {
  const [sub, dash, mp, mgr] = await Promise.all([
    loadSubscription(businessId), getDashboard(businessId),
    isOwner ? getMpesaStatus(businessId) : Promise.resolve({ data: null }),
    isOwner && supabase ? supabase.from("business_members").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("role", "manager").eq("status", "active") : Promise.resolve({ count: 0 }),
  ]);
  return { data: { sub: sub.data, d: dash.data, mpesa: mp.data, managers: mgr.count || 0 }, error: dash.error };
}

export default function BusinessDashboard() {
  const { business: b, role } = useBusinessContext();
  const isOwner = role === "owner";
  const { data, error, loading } = useAsync(() => loadAll(b.id, isOwner), [b.id, isOwner]);
  const base = `/app/${b.slug}`;
  const d = data?.d;
  const sub = data?.sub;
  const profileDone = (b.description || "").length >= 20 && Boolean(b.phone) && Boolean(b.county);

  const items = [
    { done: true, title: "Create your account", text: "Done." },
    { done: Boolean(sub) || b.status === "active", title: "Pay your subscription", text: sub ? `${sub.plan?.name || "Plan"} paid until ${formatDate(sub.period_end)}.` : "Subscription paid." },
    { done: b.status === "active", title: "Get approved", text: "Your business is live on the platform." },
    { done: profileDone, title: "Complete your business profile", text: "Description, county and phone shown to customers.", to: `/start/details?business=${b.slug}`, label: "Edit details" },
    { done: Boolean(d && d.rooms.total > 0), title: "Add your first property", text: "Buildings, floors and rooms.", to: `${base}/properties`, label: "Open" },
    { done: (data?.managers || 0) > 0, title: "Invite a manager", text: "Share the work. Owners only.", to: `${base}/managers`, label: "Open", ownerOnly: true },
    { done: Boolean(data?.mpesa?.shortcode), title: "Set your payment details", text: "Paybill or till number and billing rules.", to: `${base}/settings`, label: "Open", ownerOnly: true },
  ].filter((i) => !i.ownerOnly || isOwner);
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  const r = d?.rooms;
  const occ = r && r.total ? Math.round((r.occupied / r.total) * 100) : 0;
  const pct = (n) => (r && r.total ? `${(n / r.total) * 100}%` : "0%");

  return (
    <div className="rent">
      <div className="rent-head">
        <div>
          <h2 className="rent-head__title">{allDone ? b.name : `Welcome to ${b.name}`}</h2>
          <p className="rent-head__lead">{allDone ? "Here is how the business is doing today." : `Let's get your business ready. ${doneCount} of ${items.length} steps done.`}</p>
        </div>
        <Button as={Link} to={`/b/${b.slug}`} variant="outline" rightIcon={<Icon name="home" size={16} />}>View public page</Button>
      </div>

      {error && <Alert type="error" message={error} />}

      {loading ? (
        <div className="rent-stats">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={92} />)}</div>
      ) : d && (
        <>
          <div className="rent-stats">
            <Stat label="Occupancy" value={`${occ}%`} note={`${r.occupied} of ${r.total} rooms`} to={`${base}/properties`} />
            <Stat label="Residents" value={d.residents} note={`${r.available} rooms free`} to={`${base}/residents`} />
            <Stat label="Collected this month" value={money(d.collected_month)} note={`of ${money(d.billed_month)} billed`} to={`${base}/payments`} />
            <Stat label="Still to collect" value={money(d.outstanding)} note={d.overdue_count ? `${d.overdue_count} overdue (${money(d.overdue_amount)})` : "Nothing overdue"} tone={d.overdue_count ? "bad" : undefined} to={`${base}/billing`} />
          </div>

          {(d.pending_requests > 0 || d.unmatched > 0) && (
            <Card>
              <CardHeader title="Needs your attention" />
              <CardBody>
                <ul className="rent-list">
                  {d.pending_requests > 0 && <li><span>{d.pending_requests} new room request{d.pending_requests === 1 ? "" : "s"}</span><Button as={Link} size="sm" to={`${base}/rental-requests`}>Answer</Button></li>}
                  {d.unmatched > 0 && <li><span>{d.unmatched} payment{d.unmatched === 1 ? "" : "s"} not matched to an invoice</span><Button as={Link} size="sm" variant="outline" to={`${base}/payments`}>Match</Button></li>}
                </ul>
              </CardBody>
            </Card>
          )}

          {r.total > 0 && (
            <Card>
              <CardHeader title="Rooms" subtitle={`${r.total} in ${d.buildings} building${d.buildings === 1 ? "" : "s"}`} />
              <CardBody>
                <div className="rent-meter" role="img" aria-label={`${r.occupied} occupied, ${r.reserved} reserved, ${r.maintenance} under maintenance, ${r.available} available`}>
                  <span className="rent-meter__occupied" style={{ width: pct(r.occupied) }} />
                  <span className="rent-meter__reserved" style={{ width: pct(r.reserved) }} />
                  <span className="rent-meter__maintenance" style={{ width: pct(r.maintenance) }} />
                </div>
                <ul className="rent-legend">
                  <li><i className="occupied" />{r.occupied} occupied</li><li><i className="reserved" />{r.reserved} reserved</li>
                  <li><i className="maintenance" />{r.maintenance} maintenance</li><li><i />{r.available} available</li>
                </ul>
              </CardBody>
            </Card>
          )}

          <div className="rent-grid2">
            <Card>
              <CardHeader title="Biggest arrears" action={<Button as={Link} to={`${base}/billing`} size="sm" variant="ghost">All invoices</Button>} />
              <CardBody>
                {d.arrears.length ? (
                  <ul className="rent-list">{d.arrears.map((a) => (
                    <li key={a.id}><span>{a.full_name || "Resident"} · {a.room_number}<small>{a.invoice_number} · due {formatDate(a.due_date)}</small></span><span className="rent-money rent-strong">{money(a.balance)}</span></li>
                  ))}</ul>
                ) : <p className="rent-muted">No overdue invoices. Well done.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Latest payments" action={<Button as={Link} to={`${base}/payments`} size="sm" variant="ghost">All payments</Button>} />
              <CardBody>
                {d.recent_payments.length ? (
                  <ul className="rent-list">{d.recent_payments.map((p) => (
                    <li key={p.id}><span>{p.full_name || "Unmatched payment"}<small>{METHOD[p.payment_method]} · {formatDate(p.paid_at)}</small></span>
                      <span className="rent-money rent-strong">{p.payment_status === "reversed" ? <Badge variant="neutral">Reversed</Badge> : money(p.amount)}</span></li>
                  ))}</ul>
                ) : <p className="rent-muted">No payments yet.</p>}
              </CardBody>
            </Card>
          </div>
        </>
      )}

      <ShareShelf />

      <div className="rent-grid2">
        {!allDone && (
          <Card>
            <CardHeader title="Getting started" />
            <CardBody>
              <ul className="onb__check">
                {items.map((i) => (
                  <li key={i.title} className={i.done ? "is-done" : ""}>
                    <span className="tick" aria-hidden="true">{i.done ? "✓" : ""}</span>
                    <div><strong>{i.title}</strong><span>{i.text}</span></div>
                    {!i.done && i.to && <Button as={Link} to={i.to} size="sm" variant="outline">{i.label}</Button>}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Subscription" />
          <CardBody>
            {loading ? <Skeleton height={60} /> : sub ? (
              <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
                <Badge variant={new Date(sub.period_end) > new Date() ? "success" : "error"}>{new Date(sub.period_end) > new Date() ? "Active" : "Expired"}</Badge>
                <p style={{ margin: 0 }}><strong>{sub.plan?.name || "Plan"}</strong></p>
                <p style={{ margin: 0 }}>Paid until {formatDate(sub.period_end)}</p>
              </div>
            ) : <p style={{ margin: 0 }}>No subscription recorded yet.</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
