// src/pages/account/MyBusinessesPage.jsx — MODIFIED (Phase 6: ownership offers on top; a deleted business shows "Restore" and its last day)
//
// AIM
// The signed-in landing page: every business the person belongs to, with its status and the
// right next action (open, finish payment, see approval status, fix and resubmit), a button to
// start another business, and the latest notifications. Offers to take over a business (from an owner)
// appear above the list; a deleted business can be restored for 60 days. A visitor with no business sees
// "explore" first; starting a business is the secondary choice.

import "./Account.css";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, CardHeader, EmptyState, Icon, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { ROLE_LABEL } from "../../lib/permissions.js";
import { listMyNotifications, markAllRead } from "../../lib/api/notifications.js";
import { STATUS_BADGE, formatDate, formatDateTime } from "../../lib/format.js";
import OwnershipOffers from "../../components/lifecycle/OwnershipOffers.jsx";
import { typeLabel } from "../../config/counties.js";
import { useBusinessStore } from "../../store/businessStore.js";
import { useSession } from "../../store/sessionStore.js";

function nextAction(b) {
  switch (b.status) {
    case "active": return { to: `/app/${b.slug}`, label: "Open" };
    case "pending_payment":
    case "draft": return { to: `/start/subscribe?business=${b.slug}`, label: "Finish payment" };
    case "rejected": return { to: `/start/status?business=${b.slug}`, label: "Fix and resubmit" };
    case "closed": return { to: `/start/status?business=${b.slug}`, label: b.closed_by_admin ? "See status" : "Restore" };
    default: return { to: `/start/status?business=${b.slug}`, label: "See status" };
  }
}

export default function MyBusinessesPage() {
  const navigate = useNavigate();
  const profile = useSession((s) => s.profile);
  const memberships = useBusinessStore((s) => s.memberships);
  const loading = useBusinessStore((s) => s.loading);
  const loadedFor = useBusinessStore((s) => s.loadedFor);
  const { data: notes, reload } = useAsync(() => listMyNotifications(8), []);
  const first = (profile?.full_name || "").split(" ")[0];

  return (
    <div className="pg">
      <div className="acct__head">
        <div>
          <h1 className="pg__title">{first ? `Hello, ${first}` : "My businesses"}</h1>
          <p className="pg__lead" style={{ marginBottom: 0 }}>The businesses you own or help manage.</p>
        </div>
        <div className="acct__head-actions">
          <Button as={Link} to="/account/requests" variant="outline">My requests</Button>
          {profile?.role === "super_admin" && <Button as={Link} to="/admin" variant="outline">Admin dashboard</Button>}
          <Button as={Link} to="/start" variant="outline" leftIcon={<Icon name="plus" size={18} />}>Start a business</Button>
        </div>
      </div>

      <OwnershipOffers />

      <div className="acct__grid">
        <div className="acct__list">
          {loading || !loadedFor ? (
            [0, 1].map((i) => <Card key={i}><Skeleton width="45%" height={20} /><Skeleton width="30%" height={14} style={{ marginTop: 10 }} /></Card>)
          ) : memberships.length === 0 ? (
            <Card>
              <EmptyState icon="building" title="You do not own or manage a business"
                description="Looking for a place or a service? Explore businesses. Own one? Start it here."
                action={<div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
                  <Button as={Link} to="/explore">Explore businesses</Button>
                  <Button as={Link} to="/start" variant="outline">Start a business</Button>
                </div>} />
            </Card>
          ) : (
            memberships.map(({ business: b, role }) => {
              const [variant, text] = STATUS_BADGE[b.status] || ["neutral", b.status];
              const action = nextAction(b);
              return (
                <Card key={b.id} className="acct__biz">
                  <div className="acct__biz-main">
                    <h2 className="acct__biz-name">{b.name}</h2>
                    <p className="acct__biz-meta">{typeLabel(b.business_type)} · {ROLE_LABEL[role] || role}{b.county ? ` · ${b.county}` : ""}</p>
                    <Badge variant={variant}>{text}</Badge>
                    {b.status === "closed" && b.closed_at && !b.closed_by_admin && (
                      <p className="acct__biz-meta">Restore it by {formatDate(new Date(new Date(b.closed_at).getTime() + 60 * 86_400_000).toISOString())}, then it is deleted for good.</p>
                    )}
                  </div>
                  <Button as={Link} to={action.to} variant={b.status === "active" ? "primary" : "outline"}>{action.label}</Button>
                </Card>
              );
            })
          )}
        </div>

        <Card padding="none" className="acct__notes">
          <CardHeader title="Notifications" action={notes?.some((n) => !n.is_read) ? (
            <Button size="sm" variant="ghost" onClick={async () => { await markAllRead(); reload(); }}>Mark all read</Button>) : null} />
          <ul className="acct__note-list">
            {(notes || []).length === 0 && <li className="acct__note-empty">Nothing yet.</li>}
            {(notes || []).map((n) => (
              <li key={n.id} className={n.is_read ? "" : "is-unread"}>
                <button type="button" onClick={() => {
                  const slug = n.data?.slug;
                  if (n.type === "business_approved" && slug) navigate(`/app/${slug}`);
                  else if (n.type === "business_to_review" && n.data?.business_id) navigate(`/admin/businesses/${n.data.business_id}`);
                  else if (n.data?.business_id) navigate("/businesses");
                }}>
                  <strong>{n.title}</strong>
                  {n.body && <span>{n.body}</span>}
                  <small>{formatDateTime(n.created_at)}</small>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
