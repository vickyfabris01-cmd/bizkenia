// src/components/lifecycle/DeleteAccountCard.jsx — NEW FILE (Phase 6 step 1)
//
// AIM
// "Delete my account" on My account. Everyone has it, in a red Danger zone card. What happens when
// the button is pressed depends on who is asking (the database answers account_delete_check):
//   a super admin              -> told it cannot be done here
//   an owner of a live business-> a soft warning: hand it over to a manager or delete the business first,
//                                 with a button to each business
//   a resident with a tenancy  -> told to ask the owner to end it first
//   anyone else                -> a clear list of what will happen, then the password. The server function
//                                 delete-account does the deleting and the page signs out.

import "./Lifecycle.css";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, PasswordInput } from "../ui";
import { Modal } from "../modals/Modal.jsx";
import { useToast } from "../../hooks/useNotifications.js";
import { accountDeleteCheck, deleteAccount } from "../../lib/api/lifecycle.js";
import { formatDate } from "../../lib/format.js";
import { useBusinessStore } from "../../store/businessStore.js";
import { useSession } from "../../store/sessionStore.js";

export default function DeleteAccountCard() {
  const navigate = useNavigate();
  const toast = useToast();
  const user = useSession((s) => s.user);
  const google = user?.app_metadata?.provider === "google";
  const [phase, setPhase] = useState(null); // null | "admin" | "blocked" | "tenancy" | "confirm"
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setChecking(true);
    const { data, error } = await accountDeleteCheck();
    setChecking(false);
    if (error) return toast.error(error);
    setCheck(data); setPassword(""); setPwError("");
    if (data.is_super_admin) setPhase("admin");
    else if ((data.owned_blocking || []).length) setPhase("blocked");
    else if (data.active_tenancies > 0) setPhase("tenancy");
    else setPhase("confirm");
  }

  async function remove() {
    if (!password) return setPwError("Enter your password.");
    setPwError(""); setBusy(true);
    const { error } = await deleteAccount(password);
    setBusy(false);
    if (error) return setPwError(error);
    try { await useSession.getState().signOut(); } catch { /* the login is already gone */ }
    useBusinessStore.getState().reset();
    setPhase(null);
    navigate("/", { replace: true });
    toast.success("Your account was deleted.");
  }

  const close = () => setPhase(null);
  const blockers = check?.owned_blocking || [];
  const closed = check?.owned_closed || [];

  return (
    <section className="life" aria-labelledby="acct-danger-h">
      <div className="life__card">
        <div className="life__head">
          <h2 id="acct-danger-h">Danger zone</h2>
          <p>Deleting your account removes it at once and cannot be undone.</p>
        </div>
        <div className="life__part">
          <h3>Delete my account</h3>
          <p>Your profile, sign-in, messages and notifications are removed. Records you were part of stay as history for the business, without your name.</p>
          <div><Button variant="danger" loading={checking} onClick={start}>Delete my account</Button></div>
        </div>
      </div>

      <Modal isOpen={phase === "admin"} onClose={close} title="This account cannot be deleted here"
        footer={<Button variant="outline" onClick={close}>Close</Button>}>
        <div className="life-dialog"><p>Super admin accounts are protected. Ask another super admin to change your role first.</p></div>
      </Modal>

      <Modal isOpen={phase === "blocked"} onClose={close} title="You still own a business"
        footer={<Button variant="outline" onClick={close}>Close</Button>}>
        <div className="life-dialog">
          <p>
            A business must always have an owner, so your account cannot be deleted while you own one. For each business below,
            hand it over to one of your managers (invite one first if you have none), or delete the business. Then come back here.
          </p>
          <ul className="life__invites">
            {blockers.map((b) => (
              <li key={b.id}>
                <span><strong>{b.name}</strong></span>
                <Button as={Link} size="sm" variant="outline" onClick={close}
                  to={b.status === "active" ? `/app/${b.slug}/settings` : `/start/status?business=${b.slug}`}>
                  {b.status === "active" ? "Open settings" : "See status"}
                </Button>
              </li>
            ))}
          </ul>
          {blockers.some((b) => b.status === "suspended") && <Alert type="info" message="A suspended business can only be closed by support. Contact support to do that." />}
        </div>
      </Modal>

      <Modal isOpen={phase === "tenancy"} onClose={close} title="You have an active tenancy"
        footer={<Button variant="outline" onClick={close}>Close</Button>}>
        <div className="life-dialog"><p>Ask the owner of the place you live in to end your tenancy first. Then you can delete your account.</p></div>
      </Modal>

      <Modal isOpen={phase === "confirm"} onClose={close} title="Delete your account for good?"
        footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger" loading={busy} onClick={remove}>Delete my account</Button></>}>
        <div className="life-dialog">
          <p><strong>This is what will happen, straight away and for good:</strong></p>
          <ul className="life__list">
            <li>You are signed out and can never sign in to this account again.</li>
            <li>Your profile, picture, messages, support tickets and notifications are removed.</li>
            <li>What you did on the platform stays as history for each business, shown as &ldquo;Deleted user&rdquo;: orders, rent and payment records, and notes you made.</li>
            <li>Delivery details you gave on past orders stay with the shop, so it can finish and account for them.</li>
            <li>If you sign up again, you are a new user. Nothing from this account comes back.</li>
            {closed.map((b) => (
              <li key={b.id}><strong>{b.name}</strong>, which you deleted on {formatDate(b.closed_at)}, is deleted for good now and can no longer be restored.</li>
            ))}
          </ul>
          {check?.open_orders > 0 && <Alert type="warning" message={`You have ${check.open_orders} unfinished ${check.open_orders === 1 ? "order" : "orders"}. The shop can still complete ${check.open_orders === 1 ? "it" : "them"}, but will not be able to reach you through the app.`} />}
          {google && <Alert type="info" message="You signed in with Google. Deleting needs a password. If you never set one, set it first in the Password section above." />}
          <PasswordInput label="Your password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} error={pwError} helper="Type your password to confirm." />
        </div>
      </Modal>
    </section>
  );
}
