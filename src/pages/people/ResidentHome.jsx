// src/pages/people/ResidentHome.jsx — NEW FILE
//
// AIM
// /app/:slug (resident) — "My home": the room, what is owed and when, a Pay now button, the latest notice
// and shortcuts to complaints, messages and a room transfer.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { listAnnouncements, myCycles, myTenancy } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { PageHead, Stat, StatusBadge, money } from "../rental/shared.jsx";
import PayRentModal from "./PayRentModal.jsx";

export default function ResidentHome() {
  const { business } = useBusinessContext();
  const base = `/app/${business.slug}`;
  const { data, error, loading, reload } = useAsync(async () => {
    const [t, c, a] = await Promise.all([myTenancy(business.id), myCycles(business.id), listAnnouncements(business.id)]);
    return { data: { tenancy: t.data, cycles: c.data || [], notices: a.data || [] }, error: t.error || c.error };
  }, [business.id]);
  const [pay, setPay] = useState(null);

  if (loading) return <div className="rent"><Skeleton height={32} width={220} /><div className="rent-stats"><Skeleton height={96} /><Skeleton height={96} /></div><Skeleton height={160} /></div>;
  const { tenancy, cycles, notices } = data || { cycles: [], notices: [] };
  const open = cycles.filter((c) => ["unpaid", "partial", "overdue"].includes(c.status)).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const owed = open.reduce((s, c) => s + Number(c.balance), 0);
  const next = open[0];
  const overdue = open.filter((c) => c.status === "overdue").length;
  const room = tenancy?.room;

  return (
    <div className="rent">
      <PageHead title="My home" lead={room ? `${room.building?.name || ""} · Room ${room.room_number}` : business.name} />
      {error && <Alert type="error" message={error} />}
      {!tenancy && <Card><EmptyState icon="home" title="No active tenancy" description="You do not have a room in this business right now." /></Card>}
      {overdue > 0 && <Alert type="warning" title="You have overdue rent" message="Pay now to avoid more late fees." />}
      {tenancy && (
        <>
          <div className="rent-stats">
            <Stat label="Balance due" value={money(owed)} tone={overdue ? "bad" : owed ? "warn" : undefined} note={next ? `Next due ${formatDate(next.due_date)}` : "You are paid up"} />
            <Stat label="Monthly rent" value={money(tenancy.agreed_price)} note={tenancy.billing_type === "semester" ? "Billed per semester" : "Billed monthly"} />
            <Stat label="Moved in" value={formatDate(tenancy.move_in_date)} to={`${base}/my-room`} note="View my room" />
            <Stat label="Complaints" value="Raise one" to={`${base}/my-complaints`} note="Report a problem" />
          </div>
          <Card>
            <CardHeader title="Rent" subtitle="Pay with M-Pesa from your phone." action={next && <Button onClick={() => setPay(next)}>Pay now</Button>} />
            <CardBody>
              {open.length === 0 ? <p className="rent-muted">You have no unpaid invoices.</p> : (
                <ul className="rent-list">
                  {open.slice(0, 4).map((c) => (
                    <li key={c.id}><span>{c.invoice_number}<small>Due {formatDate(c.due_date)}</small></span>
                      <span style={{ textAlign: "right" }}><span className="rent-money">{money(c.balance)}</span><small><StatusBadge kind="cycle" status={c.status} /></small></span></li>
                  ))}
                </ul>
              )}
              <p style={{ margin: "var(--space-3) 0 0" }}><Link to={`${base}/my-invoices`}>All invoices and receipts</Link></p>
            </CardBody>
          </Card>
        </>
      )}
      <Card>
        <CardHeader title="Latest notice" action={<Link to={`${base}/notices`}>All notices</Link>} />
        <CardBody>
          {notices[0] ? <><strong>{notices[0].title}</strong><p className="rent-muted">{notices[0].body}</p></> : <p className="rent-muted">No notices yet.</p>}
        </CardBody>
      </Card>
      <div className="rent-actions">
        <Button as={Link} to={`${base}/messages`} variant="outline">Message the manager</Button>
        <Button as={Link} to={`${base}/transfer`} variant="outline">Ask to move rooms</Button>
      </div>
      {pay && <PayRentModal cycle={pay} businessId={business.id} onClose={() => setPay(null)} onPaid={reload} />}
    </div>
  );
}
