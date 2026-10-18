// src/pages/auth/InvitePage.jsx — NEW FILE
//
// AIM
// /invite/:token — what a person sees when an owner sends them a manager invite link. Anyone can
// open it and read who invited them. To join they must be signed in with the email the invite was
// sent to; wrong email, used, cancelled and expired invites each say so plainly.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Skeleton } from "../../components/ui";
import AuthLayout from "../../layouts/AuthLayout.jsx";
import useAsync from "../../hooks/useAsync.js";
import { acceptInvite, getInvite } from "../../lib/api/rental.js";
import { formatDate } from "../../lib/format.js";
import { useBusinessStore } from "../../store/businessStore.js";
import { useSession } from "../../store/sessionStore.js";

const WHY = {
  accepted: "This invite has already been used.",
  cancelled: "The owner cancelled this invite.",
  expired: "This invite has expired. Ask the owner to send a new one.",
};

export default function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const loadingSession = useSession((s) => s.loading);
  const { data: inv, error, loading } = useAsync(() => getInvite(token), [token]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const next = encodeURIComponent(`/invite/${token}`);

  async function join() {
    setBusy(true); setErr("");
    const { error: e } = await acceptInvite(token);
    if (e) { setBusy(false); setErr(e); return; }
    await useBusinessStore.getState().load(user.id, true);
    navigate(`/app/${inv.business_slug}`, { replace: true });
  }

  let body;
  if (loading || loadingSession) body = <Skeleton height={120} />;
  else if (error || !inv) body = <Alert type="error" title="Invite not found" message={error || "The link may be wrong or the invite was removed."} />;
  else if (inv.status !== "pending") body = <Alert type="warning" title="This invite cannot be used" message={WHY[inv.status] || "It is no longer valid."} />;
  else if (!user) {
    body = (
      <>
        <p style={{ margin: 0 }}>Sign in or create an account with <strong>{inv.email}</strong> to join.</p>
        <Button as={Link} to={`/login?next=${next}`} fullWidth size="lg">Sign in</Button>
        <Button as={Link} to={`/signup?next=${next}`} variant="outline" fullWidth>Create an account</Button>
      </>
    );
  } else if ((user.email || "").toLowerCase() !== inv.email.toLowerCase()) {
    body = <Alert type="warning" title="Wrong account" message={`This invite was sent to ${inv.email}, but you are signed in as ${user.email}. Sign out and sign in with the invited email.`} />;
  } else {
    body = (<>
      {err && <Alert type="error" message={err} />}
      <Button fullWidth size="lg" loading={busy} onClick={join}>Join {inv.business_name}</Button>
      <p style={{ margin: 0, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>Open until {formatDate(inv.expires_at)}.</p>
    </>);
  }

  return (
    <AuthLayout title={inv?.business_name ? `Join ${inv.business_name}` : "Manager invite"}
      subtitle={inv?.invited_by_name ? `${inv.invited_by_name} invited you to help manage this business.` : "You were invited to help manage a business."}
      footer={<Link to="/">Back to home</Link>}>
      {body}
    </AuthLayout>
  );
}
