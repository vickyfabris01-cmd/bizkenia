// src/pages/rental/ManagersPage.jsx — NEW FILE
//
// AIM
// /app/:slug/managers (owner only) — the people who help run the business. The owner invites a
// manager by email; the page shows a link to send them (no email service needed). The manager
// opens it, signs in with that same email and joins. A business has exactly one owner, who
// cannot be removed here.

import "./Rental.css";
import { useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Input } from "../../components/ui";
import { ConfirmDialog } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { cancelInvite, inviteManager, listInvites, listStaff, removeManager } from "../../lib/api/rental.js";
import { formatDate } from "../../lib/format.js";
import { PageHead, copyText, personName } from "./shared.jsx";

const linkFor = (token) => `${window.location.origin}/invite/${token}`;

export default function ManagersPage() {
  const { business } = useBusinessContext();
  const bid = business.id;
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [s, i] = await Promise.all([listStaff(bid), listInvites(bid)]);
    return { data: { staff: s.data || [], invites: i.data || [] }, error: s.error || i.error };
  }, [bid]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fresh, setFresh] = useState(null);       // { email, token } just created
  const [removing, setRemoving] = useState(null);

  async function invite(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setFormError("Enter a valid email address."); return; }
    setBusy(true); setFormError("");
    const { data: token, error: err } = await inviteManager(bid, email.trim());
    setBusy(false);
    if (err) { setFormError(err); return; }
    setFresh({ email: email.trim(), token }); setEmail(""); reload();
  }
  async function copy(token) {
    if (await copyText(linkFor(token))) toast.success("Link copied"); else toast.error("Could not copy. Select the link and copy it.");
  }
  async function cancel(id) {
    const { error: err } = await cancelInvite(id);
    if (err) toast.error(err); else { toast.success("Invite cancelled"); reload(); }
  }
  async function remove() {
    setBusy(true);
    const { error: err } = await removeManager(bid, removing.user_id);
    setBusy(false); setRemoving(null);
    if (err) toast.error(err); else { toast.success("Manager removed"); reload(); }
  }

  const columns = [
    { key: "name", label: "Name", render: (m) => <span className="rent-strong">{personName(m.profile)}</span> },
    { key: "email", label: "Email", render: (m) => m.profile?.email || "—" },
    { key: "role", label: "Role", render: (m) => (m.role === "owner" ? "Owner" : "Manager") },
    { key: "since", label: "Since", render: (m) => formatDate(m.created_at) },
    { key: "act", label: "", align: "right", render: (m) => (m.role === "manager" ? <Button size="sm" variant="outline" onClick={() => setRemoving(m)}>Remove</Button> : null) },
  ];

  return (
    <div className="rent">
      <PageHead title="Managers" lead="Managers can run daily work: rooms, requests, residents and payments. They cannot change settings or invite others." />
      {error && <Alert type="error" message={error} />}

      <Card>
        <CardHeader title="Invite a manager" />
        <CardBody>
          <form className="rent-bar" onSubmit={invite} noValidate>
            <Input label="Their email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={formError} />
            <Button type="submit" loading={busy} className="rent-bar__fit">Create invite link</Button>
          </form>
          {fresh && (
            <div className="rent-form" style={{ marginTop: "var(--space-4)" }}>
              <Alert type="success" title="Invite ready" message={`Send this link to ${fresh.email}. It works for 48 hours and only after they sign in with that email.`} />
              <div className="rent-copy"><code>{linkFor(fresh.token)}</code><Button size="sm" variant="outline" onClick={() => copy(fresh.token)}>Copy link</Button></div>
            </div>
          )}
        </CardBody>
      </Card>

      <SimpleTable loading={loading} columns={columns} rows={data?.staff || []} rowKey="id" />

      {(data?.invites || []).length > 0 && (
        <Card>
          <CardHeader title="Waiting to join" />
          <CardBody>
            <ul className="rent-list">
              {data.invites.map((i) => (
                <li key={i.id}><span>{i.email}<small>Expires {formatDate(i.expires_at)}</small></span>
                  <span className="rent-actions"><Button size="sm" variant="outline" onClick={() => copy(i.token)}>Copy link</Button><Button size="sm" variant="ghost" onClick={() => cancel(i.id)}>Cancel</Button></span></li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      {!loading && !(data?.staff || []).length && <Card><EmptyState icon="users" compact title="No team yet" /></Card>}
      <ConfirmDialog isOpen={Boolean(removing)} title="Remove this manager?" message={`${personName(removing?.profile)} will lose access to ${business.name} straight away.`}
        confirmLabel="Remove" loading={busy} onConfirm={remove} onCancel={() => setRemoving(null)} />
    </div>
  );
}
