// src/pages/help/HelpCentrePage.jsx — NEW FILE
//
// AIM
// /help — the help centre. Articles written by the super admin (Admin > Support > Help articles), searchable and
// grouped by topic. Below them: contact support — a ticket form for signed-in people, a sign-in prompt otherwise,
// and the support email from Admin > Settings.

import "../rental/Rental.css";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, Input, Skeleton } from "../../components/ui";
import TicketForm from "../../components/support/TicketForm.jsx";
import useAsync from "../../hooks/useAsync.js";
import useBrand from "../../hooks/useBrand.js";
import { useSession } from "../../store/sessionStore.js";
import { listArticles } from "../../lib/api/people.js";

export default function HelpCentrePage() {
  const brand = useBrand();
  const user = useSession((s) => s.user);
  const { data, error, loading } = useAsync(() => listArticles(), []);
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const rows = (data || []).filter((a) => a.published && (!q || `${a.title} ${a.body}`.toLowerCase().includes(q.toLowerCase())));
    const m = new Map();
    rows.forEach((a) => m.set(a.category, [...(m.get(a.category) || []), a]));
    return [...m.entries()];
  }, [data, q]);

  return (
    <div className="pg pg--narrow">
      <h1 className="pg__title">Help centre</h1>
      <p className="pg__lead">Answers to common questions, and a way to reach the {brand.name} team.</p>
      <div className="rent" style={{ gap: "var(--space-4)" }}>
        <form role="search" onSubmit={(e) => e.preventDefault()}><Input label="Search help" placeholder="For example: pay rent" value={q} onChange={(e) => setQ(e.target.value)} /></form>
        {error && <Alert type="error" message="The articles could not be loaded. You can still contact support below." />}
        {loading ? <><Skeleton height={48} /><Skeleton height={48} /></> : groups.length === 0 ? <p className="rent-muted">No articles match your search.</p> : groups.map(([cat, list]) => (
          <section key={cat} aria-labelledby={`h-${cat}`}>
            <h2 id={`h-${cat}`} style={{ fontSize: "var(--text-lg)", margin: "0 0 var(--space-2)" }}>{cat}</h2>
            <div className="faq">{list.map((a) => <details key={a.id}><summary>{a.title}</summary><p style={{ whiteSpace: "pre-wrap" }}>{a.body}</p></details>)}</div>
          </section>
        ))}
        <Card>
          <CardHeader title="Still stuck?" subtitle={user ? "Send a message to the support team." : "Sign in to open a support ticket, or email us."}
            action={user && <Button as={Link} to="/help/tickets" variant="outline" size="sm">My tickets</Button>} />
          <CardBody>
            {user ? <TicketForm onCreated={() => { window.location.assign("/help/tickets"); }} /> : (
              <p style={{ margin: 0 }}><Link to="/login">Sign in</Link> to open a ticket, or email <a href={brand.mailto}>{brand.supportEmail}</a>.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
