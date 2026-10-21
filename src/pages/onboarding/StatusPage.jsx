// src/pages/onboarding/StatusPage.jsx — MODIFIED (Phase 6: a deleted business shows how long it can be restored, with a Restore button for the owner)
//
// AIM
// Step 4: where the business is in the approval process, and what to do next.
//   awaiting payment -> go pay
//   pending          -> "we are reviewing" (page refreshes by itself)
//   rejected         -> the reviewer's reason, edit details, send again
//   active           -> open the dashboard
//   suspended        -> contact support
//   closed           -> deleted by the owner (or by support): the owner can restore it for 60 days
// Without ?business= it picks the person's most recent business that is not active.

import "./Onboarding.css";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Skeleton } from "../../components/ui";
import Stepper from "./Stepper.jsx";
import { getMyBusiness, resubmitBusiness } from "../../lib/api/businesses.js";
import { restoreBusiness } from "../../lib/api/lifecycle.js";
import { STATUS_BADGE, formatDate, formatDateTime } from "../../lib/format.js";
import { useBusinessStore } from "../../store/businessStore.js";
import { useSession } from "../../store/sessionStore.js";
import useBrand from "../../hooks/useBrand.js";
import { useToast } from "../../hooks/useNotifications.js";

export default function StatusPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const brand = useBrand();
  const user = useSession((s) => s.user);
  const memberships = useBusinessStore((s) => s.memberships);
  const loadedFor = useBusinessStore((s) => s.loadedFor);
  const slug = params.get("business") || memberships.find((m) => m.business.status !== "active")?.business.slug;
  const [biz, setBiz] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return setLoading(false);
    const { data, error: e } = await getMyBusiness(slug);
    if (e || !data) setError(e || "Business not found."); else setBiz(data);
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);
  // While waiting for approval, check again every 15 seconds.
  useEffect(() => {
    if (biz?.status !== "pending") return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [biz?.status, load]);

  async function resubmit() {
    setBusy(true);
    const { error: e } = await resubmitBusiness(biz.id);
    setBusy(false);
    if (e) return toast.error(e);
    await useBusinessStore.getState().load(user.id, true);
    toast.success("Sent for review again.");
    load();
  }

  async function restore() {
    setBusy(true);
    const { data: to, error: e } = await restoreBusiness(biz.id);
    setBusy(false);
    if (e) return toast.error(e);
    await useBusinessStore.getState().load(user.id, true);
    if (to === "pending_payment") {
      toast.success("Your business is back. Subscribe again to open it.");
      navigate(`/start/subscribe?business=${biz.slug}`);
    } else {
      toast.success("Your business is back.");
      navigate(to === "active" ? `/app/${biz.slug}` : `/start/status?business=${biz.slug}`);
    }
  }

  if (!slug && loadedFor) return <Navigate to="/businesses" replace />;
  if (loading || !loadedFor) return <div className="pg pg--narrow"><Skeleton height={32} /><Skeleton height={160} style={{ marginTop: 16 }} /></div>;
  if (error || !biz) {
    return <div className="pg pg--narrow"><Card><EmptyState icon="search" title="Business not found" description={error}
      action={<Button as={Link} to="/businesses">My businesses</Button>} /></Card></div>;
  }

  const [variant, label] = STATUS_BADGE[biz.status] || ["neutral", biz.status];
  const s = biz.status;
  const myRole = memberships.find((m) => m.business.id === biz.id)?.role;
  const closedMs = s === "closed" && biz.closed_at ? new Date(biz.closed_at).getTime() + 60 * 86_400_000 : 0;
  const daysLeft = closedMs ? Math.max(0, Math.ceil((closedMs - Date.now()) / 86_400_000)) : 0;
  const canRestore = s === "closed" && myRole === "owner" && !biz.closed_by_admin && daysLeft > 0;
  const steps = [
    { key: "pay", title: "Subscription paid", done: s !== "pending_payment" && s !== "draft" },
    { key: "review", title: "Reviewed by our team", done: s === "active" || s === "suspended", current: s === "pending" },
    { key: "live", title: "Live on the platform", done: s === "active" },
  ];

  return (
    <div className="pg pg--narrow">
      <Stepper step={4} />
      <div className="onb__status">
        <div>
          <h1 className="pg__title">{biz.name}</h1>
          <Badge variant={variant} size="lg">{label}</Badge>
        </div>

        {s === "pending_payment" || s === "draft" ? (
          <Alert type="warning" title="Payment needed" message="Pay the subscription to send your business for review." />
        ) : null}
        {s === "pending" && <Alert type="info" title="We are reviewing your business" message={`Submitted ${formatDateTime(biz.submitted_at)}. You will get a notification as soon as there is a decision.`} />}
        {s === "rejected" && <Alert type="error" title="Your business needs changes" message={biz.rejection_reason || "Please update your details and send it again."} />}
        {s === "active" && <Alert type="success" title="Your business is live" message="Customers can now find it, and you can start managing it." />}
        {s === "closed" && (
          biz.closed_by_admin
            ? <Alert type="warning" title="This business was closed by support" message={`Contact ${brand.supportEmail} to open it again.`} />
            : daysLeft === 0
              ? <Alert type="error" title="The 60 days are over" message="This business is being deleted for good." />
              : myRole === "owner"
                ? <Alert type="warning" title="You deleted this business" message={`You can restore it until ${formatDate(new Date(closedMs).toISOString())} (${daysLeft} ${daysLeft === 1 ? "day" : "days"} left). After that it is deleted for good, with all its data.`} />
                : <Alert type="warning" title="The owner deleted this business" message="Only the owner can restore it." />
        )}
        {s === "suspended" && <Alert type="error" title="Your business is suspended" message={`${biz.rejection_reason ? biz.rejection_reason + " " : ""}Contact ${brand.supportEmail} to resolve this.`} />}

        {s !== "closed" && <Card>
          <CardHeader title="Progress" />
          <CardBody>
            <ol className="onb__timeline">
              {steps.map((st) => (
                <li key={st.key} className={st.done ? "is-done" : st.current ? "is-current" : ""}>
                  <span className="dot" aria-hidden="true">{st.done ? "✓" : ""}</span>
                  <span><strong>{st.title}</strong>{st.key === "review" && s === "rejected" ? "Changes requested" : ""}</span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>}

        <div className="onb__actions">
          <Button as={Link} to="/businesses" variant="ghost">My businesses</Button>
          {(s === "pending_payment" || s === "draft") && <Button as={Link} to={`/start/subscribe?business=${biz.slug}`} size="lg">Pay now</Button>}
          {s === "rejected" && (
            <span style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Button as={Link} to={`/start/details?business=${biz.slug}`} variant="outline">Edit details</Button>
              <Button onClick={resubmit} loading={busy} size="lg">Send for review again</Button>
            </span>
          )}
          {s === "active" && <Button onClick={() => navigate(`/app/${biz.slug}`)} size="lg">Open dashboard</Button>}
          {canRestore && <Button onClick={restore} loading={busy} size="lg">Restore business</Button>}
        </div>
      </div>
    </div>
  );
}
