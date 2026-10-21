// src/components/lifecycle/OwnershipOffers.jsx — NEW FILE (Phase 6 step 1)
//
// AIM
// On My businesses: offers from an owner who wants to hand a business over to the signed-in manager.
// Accepting makes the manager the owner (the old owner becomes a manager). Shows nothing when there
// are no offers.

import "./Lifecycle.css";
import { useState } from "react";
import { Button, Card, CardBody, CardHeader } from "../ui";
import { ConfirmDialog } from "../modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { myOwnershipOffers, respondOwnership } from "../../lib/api/lifecycle.js";
import { useBusinessStore } from "../../store/businessStore.js";
import { useSession } from "../../store/sessionStore.js";

export default function OwnershipOffers() {
  const toast = useToast();
  const user = useSession((s) => s.user);
  const { data: offers, reload } = useAsync(() => myOwnershipOffers(), []);
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState("");

  if (!(offers || []).length) return null;

  async function answer(offer, accept) {
    setBusy(offer.id + (accept ? "a" : "d"));
    const { error } = await respondOwnership(offer.id, accept);
    setBusy(""); setPick(null);
    if (error) { toast.error(error); reload(); return; }
    toast.success(accept ? `You are now the owner of ${offer.business_name}.` : "Offer declined.");
    await useBusinessStore.getState().load(user.id, true);
    reload();
  }

  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
    <Card>
      <CardHeader title="Ownership offers" subtitle="An owner wants to hand a business over to you." />
      <CardBody>
        <div className="life__offers">
          {offers.map((o) => (
            <div key={o.id} className="life__offer">
              <p><strong>{o.from_name}</strong> wants to hand <strong>{o.business_name}</strong> over to you.</p>
              <span className="life__copy">
                <Button size="sm" loading={busy === o.id + "a"} onClick={() => setPick(o)}>Accept</Button>
                <Button size="sm" variant="outline" loading={busy === o.id + "d"} onClick={() => answer(o, false)}>Decline</Button>
              </span>
            </div>
          ))}
        </div>
      </CardBody>
      <ConfirmDialog isOpen={Boolean(pick)} variant="info" loading={Boolean(busy)}
        title={`Become the owner of ${pick?.business_name}?`}
        message="You will be responsible for the business, its subscription and its people. The current owner becomes a manager."
        confirmLabel="Accept ownership" onConfirm={() => answer(pick, true)} onCancel={() => setPick(null)} />
    </Card>
    </div>
  );
}
