// src/components/lifecycle/BusinessDangerZone.jsx — NEW FILE (Phase 6 step 1)
//
// AIM
// The "Danger zone" at the bottom of a business's Settings (owner only): hand the business over to a
// manager, or delete it. It sits on the Settings page of every business type.
//
//   Hand over ownership  The owner picks one of his managers and makes an offer. The manager accepts
//                        (My businesses), the two swap roles, and there is still exactly one owner.
//                        With no manager yet, the owner invites one here (a link to send).
//   Delete this business The business is hidden at once and kept for 60 days (restorable from My
//                        businesses), then deleted for good. It needs the password. It is refused while
//                        there are unfinished orders or active tenancies.
// A manager who somehow opens this page sees nothing: the database only answers the owner.

import "./Lifecycle.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Input, PasswordInput, SelectInput } from "../ui";
import { ConfirmDialog, Modal } from "../modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { cancelInvite, inviteManager, listInvites, listStaff } from "../../lib/api/rental.js";
import { businessDeleteCheck, businessOwnershipOffer, cancelOwnershipOffer, deleteBusiness, offerOwnership } from "../../lib/api/lifecycle.js";
import { formatDate } from "../../lib/format.js";
import { copyText, personName } from "../../pages/rental/shared.jsx";
import { useBusinessStore } from "../../store/businessStore.js";
import { useSession } from "../../store/sessionStore.js";

const linkFor = (token) => `${window.location.origin}/invite/${token}`;

export default function BusinessDangerZone({ business }) {
  const bid = business.id;
  const navigate = useNavigate();
  const toast = useToast();
  const user = useSession((s) => s.user);

  const { data, loading, reload } = useAsync(async () => {
    const [chk, offer, staff, inv] = await Promise.all([
      businessDeleteCheck(bid), businessOwnershipOffer(bid), listStaff(bid), listInvites(bid),
    ]);
    return {
      data: { check: chk.data, offer: offer.data, managers: (staff.data || []).filter((m) => m.role === "manager"), invites: inv.data || [] },
      error: chk.error,
    };
  }, [bid]);

  const [toUser, setToUser] = useState("");
  const [confirmOffer, setConfirmOffer] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [fresh, setFresh] = useState(null); // { email, token } just created
  const [busy, setBusy] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState("");

  // Only the owner gets an answer; for anyone else this card stays out of the way.
  if (loading || !data?.check) return null;
  const { check, offer, managers, invites } = data;
  const options = managers.map((m) => ({ value: m.user_id, label: personName(m.profile) }));
  const chosen = managers.find((m) => m.user_id === toUser);
  const restoreBy = formatDate(new Date(Date.now() + 60 * 86_400_000).toISOString());

  async function makeOffer() {
    setBusy("offer");
    const { error } = await offerOwnership(bid, toUser);
    setBusy(""); setConfirmOffer(false);
    if (error) return toast.error(error);
    toast.success("Offer sent. You stay the owner until they accept.");
    setToUser(""); reload();
  }
  async function cancelOffer() {
    setBusy("cancel");
    const { error } = await cancelOwnershipOffer(bid);
    setBusy("");
    if (error) return toast.error(error);
    toast.success("Offer cancelled."); reload();
  }
  async function invite(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setEmailError("Enter a valid email address.");
    setEmailError(""); setBusy("invite");
    const { data: token, error } = await inviteManager(bid, email.trim());
    setBusy("");
    if (error) return setEmailError(error);
    setFresh({ email: email.trim(), token }); setEmail(""); reload();
  }
  async function copy(token) {
    if (await copyText(linkFor(token))) toast.success("Link copied"); else toast.error("Could not copy. Select the link and copy it.");
  }
  async function dropInvite(id) {
    const { error } = await cancelInvite(id);
    if (error) toast.error(error); else { toast.success("Invite cancelled"); reload(); }
  }

  async function remove() {
    if (!password) return setPwError("Enter your password.");
    setPwError(""); setBusy("delete");
    const { data: res, error } = await deleteBusiness(bid, password);
    setBusy("");
    if (error) return setPwError(error);
    await useBusinessStore.getState().load(user.id, true);
    setDeleting(false); setPassword("");
    if (res?.result === "deleted") {
      toast.success("Business deleted.");
      navigate("/businesses", { replace: true });
    } else {
      toast.success("Business deleted. You can restore it for 60 days.");
      navigate(`/start/status?business=${business.slug}`, { replace: true });
    }
  }

  const blocked = !check.can_delete;

  return (
    <section className="life" aria-labelledby="danger-zone-h">
      <div className="life__card">
        <div className="life__head">
          <h2 id="danger-zone-h">Danger zone</h2>
          <p>These actions affect everyone who works with {business.name}.</p>
        </div>

        <div className="life__part">
          <h3>Hand over ownership</h3>
          <p>
            Give {business.name} to one of your managers. When they accept, they become the owner and you become a manager.
            A business always has exactly one owner.
          </p>

          {offer ? (
            <>
              <Alert type="info" message={`Waiting for ${offer.to_name} to answer. You stay the owner until they accept.`} />
              <div><Button variant="outline" loading={busy === "cancel"} onClick={cancelOffer}>Cancel the offer</Button></div>
            </>
          ) : managers.length > 0 ? (
            <div className="life__row">
              <div className="life__grow">
                <SelectInput label="New owner" value={toUser} options={[{ value: "", label: "Choose a manager" }, ...options]} onChange={setToUser} />
              </div>
              <Button variant="outline" disabled={!toUser} onClick={() => setConfirmOffer(true)}>Offer ownership</Button>
            </div>
          ) : (
            <Alert type="info" title="You have no manager yet" message="Invite one below. When they have joined, you can offer them the business." />
          )}

          <form className="life__row" onSubmit={invite} noValidate>
            <div className="life__grow"><Input label="Invite a manager by email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} /></div>
            <Button type="submit" variant="outline" loading={busy === "invite"}>Create invite link</Button>
          </form>
          {fresh && (
            <div className="life-dialog">
              <Alert type="success" title="Invite ready" message={`Send this link to ${fresh.email}. It works for 48 hours and only after they sign in with that email.`} />
              <div className="life__copy"><code>{linkFor(fresh.token)}</code><Button size="sm" variant="outline" onClick={() => copy(fresh.token)}>Copy link</Button></div>
            </div>
          )}
          {invites.length > 0 && (
            <ul className="life__invites">
              {invites.map((i) => (
                <li key={i.id}>
                  <span>{i.email} · expires {formatDate(i.expires_at)}</span>
                  <span className="life__copy">
                    <Button size="sm" variant="outline" onClick={() => copy(i.token)}>Copy link</Button>
                    <Button size="sm" variant="ghost" onClick={() => dropInvite(i.id)}>Cancel</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="life__part">
          <h3>Delete this business</h3>
          <p>
            {business.name} is hidden from everyone at once. Nothing is erased for 60 days, and you can restore it from My businesses.
            After that it is deleted for good, with all its data.
          </p>
          {check.open_orders > 0 && (
            <Alert type="warning" title="Unfinished orders" message={`${check.open_orders} ${check.open_orders === 1 ? "order is" : "orders are"} not finished. Complete or cancel ${check.open_orders === 1 ? "it" : "them"} first.`} />
          )}
          {check.active_tenancies > 0 && (
            <Alert type="warning" title="Active tenancies" message={`${check.active_tenancies} ${check.active_tenancies === 1 ? "tenant has" : "tenants have"} an active tenancy. End ${check.active_tenancies === 1 ? "it" : "them"} first.`} />
          )}
          {check.pending_offer && <Alert type="info" message="Your ownership offer will be cancelled if you delete the business." />}
          <div>
            <Button variant="danger" disabled={blocked} onClick={() => { setPassword(""); setPwError(""); setDeleting(true); }}>Delete business</Button>
          </div>
        </div>
      </div>

      <ConfirmDialog isOpen={confirmOffer} variant="info" loading={busy === "offer"}
        title="Offer ownership?"
        message={`${personName(chosen?.profile)} will get a request. If they accept, they become the owner of ${business.name} and you become a manager. You can cancel the offer until they answer.`}
        confirmLabel="Send offer" onConfirm={makeOffer} onCancel={() => setConfirmOffer(false)} />

      <Modal isOpen={deleting} onClose={() => setDeleting(false)} title={`Delete ${business.name}?`}
        footer={<><Button variant="ghost" onClick={() => setDeleting(false)}>Cancel</Button><Button variant="danger" loading={busy === "delete"} onClick={remove}>Delete business</Button></>}>
        <div className="life-dialog">
          <p><strong>This is what will happen:</strong></p>
          <ul className="life__list">
            <li>{business.name} is hidden from customers and from the public pages right away.</li>
            <li>You and your managers lose access to it.</li>
            <li>Nothing is erased for 60 days. You can restore it from My businesses until {restoreBy}.</li>
            <li>After that it is deleted for good: its rooms, residents, orders, products, records and files.</li>
            <li>The subscription is not refunded. If it runs out while the business is deleted, you subscribe again when you restore it.</li>
            <li>The platform keeps its own payment records for accounting.</li>
          </ul>
          <PasswordInput label="Your password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} error={pwError} helper="Type your password to confirm." />
        </div>
      </Modal>
    </section>
  );
}
