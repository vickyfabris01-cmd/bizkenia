// src/pages/people/ComplaintThread.jsx — NEW FILE
//
// AIM
// One complaint opened in a modal: the details and the conversation. Residents can reply; owner and managers
// can reply and also change the status, priority and who it is assigned to.

import { useCallback, useEffect, useState } from "react";
import { Alert, SelectInput } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import ChatThread from "../../components/chat/ChatThread.jsx";
import { useToast } from "../../hooks/useNotifications.js";
import { useSession } from "../../store/sessionStore.js";
import { assignablePeople, complaintMessages, postComplaintMessage, updateComplaint } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { Badge } from "../../components/ui";
import { personName } from "../rental/shared.jsx";

export const CMP_STATUS = { open: ["warning", "Open"], in_progress: ["info", "In progress"], resolved: ["success", "Resolved"], closed: ["neutral", "Closed"] };
export const CMP_PRIORITY = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const opts = (o) => Object.entries(o).map(([value, v]) => ({ value, label: Array.isArray(v) ? v[1] : v }));

export default function ComplaintThread({ complaint: c, businessId, staff, onClose, onChanged }) {
  const toast = useToast();
  const me = useSession((s) => s.user?.id);
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState("");
  const [cur, setCur] = useState(c);

  const load = useCallback(async () => {
    const { data } = await complaintMessages(c.id);
    setMsgs(data || []); setLoading(false);
  }, [c.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (staff) assignablePeople(businessId).then((r) => setPeople(r.data || [])); }, [staff, businessId]);

  async function send(text) {
    const { error: e } = await postComplaintMessage(c.id, text);
    if (!e) { await load(); onChanged(); }
    return { error: e };
  }
  async function change(patch) {
    setError("");
    const { error: e } = await updateComplaint(c.id, patch);
    if (e) { setError(e); return; }
    setCur((x) => ({ ...x, status: patch.status ?? x.status, priority: patch.priority ?? x.priority, assigned_to: patch.assigned ?? x.assigned_to }));
    toast.success("Saved"); onChanged();
  }
  const view = msgs.map((m) => ({
    id: m.id, mine: m.sender_id === me, body: m.body, created_at: m.created_at,
    name: m.sender?.full_name || (m.is_staff ? "Management" : personName(c.who)), badge: m.is_staff ? "Staff" : null,
  }));
  const [variant, label] = CMP_STATUS[cur.status] || ["neutral", cur.status];

  return (
    <Modal isOpen onClose={onClose} title={c.title} size="lg" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="rent-form">
        {error && <Alert type="error" message={error} />}
        <p className="rent-muted"><Badge variant={variant}>{label}</Badge> · {c.category} · {CMP_PRIORITY[cur.priority]} priority · {formatDate(c.created_at)}
          {staff && c.who ? ` · ${personName(c.who)}` : ""}</p>
        {c.body && <p style={{ margin: 0 }}>{c.body}</p>}
        {staff && (
          <div className="rent-form__row">
            <SelectInput label="Status" value={cur.status} onChange={(v) => change({ status: v })} options={opts(CMP_STATUS)} />
            <SelectInput label="Priority" value={cur.priority} onChange={(v) => change({ priority: v })} options={opts(CMP_PRIORITY)} />
            <SelectInput label="Assigned to" value={cur.assigned_to || ""} onChange={(v) => v && change({ assigned: v })} placeholder="Nobody yet"
              options={people.map((p) => ({ value: p.user_id, label: `${p.full_name} (${p.role})` }))} />
          </div>
        )}
        <ChatThread messages={view} loading={loading} onSend={send} empty="No replies yet."
          disabled={cur.status === "closed"} disabledNote="This complaint is closed." placeholder="Write a reply" sendLabel="Reply" />
      </div>
    </Modal>
  );
}
