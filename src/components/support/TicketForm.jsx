// src/components/support/TicketForm.jsx — NEW FILE
//
// AIM
// The form to write to the platform team: subject, topic, what happened. Used on the help centre and on My tickets.
// onCreated(ticketId) is called after the ticket is saved.

import { useState } from "react";
import { Alert, Button, Input, SelectInput, TextArea } from "../ui";
import { useToast } from "../../hooks/useNotifications.js";
import { createTicket } from "../../lib/api/people.js";

export const TOPICS = [
  { value: "general", label: "General question" }, { value: "account", label: "My account" }, { value: "billing", label: "Payments and billing" },
  { value: "business", label: "My business listing" }, { value: "technical", label: "Something is not working" }, { value: "other", label: "Other" },
];

export default function TicketForm({ onCreated, business = null }) {
  const toast = useToast();
  const [f, setF] = useState({ subject: "", body: "", category: "general" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (!f.subject.trim() || !f.body.trim()) { setErr("Write a subject and describe the problem."); return; }
    setBusy(true); setErr("");
    const { data, error } = await createTicket({ ...f, business });
    setBusy(false);
    if (error) { setErr(error); return; }
    toast.success("Ticket sent", "The support team will reply here and by notification.");
    setF({ subject: "", body: "", category: "general" });
    onCreated?.(data);
  }
  return (
    <form className="rent-form" onSubmit={submit} noValidate>
      {err && <Alert type="error" message={err} />}
      <Input label="Subject" required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
      <SelectInput label="Topic" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={TOPICS} />
      <TextArea label="What happened?" rows={5} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      <div><Button type="submit" loading={busy}>Send to support</Button></div>
    </form>
  );
}
