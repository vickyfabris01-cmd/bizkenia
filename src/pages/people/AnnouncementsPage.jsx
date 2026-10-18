// src/pages/people/AnnouncementsPage.jsx — NEW FILE
//
// AIM
// /app/:slug/announcements (owner, manager) — write a notice for everyone, one building or one floor, pin it,
// and remove old ones. Everyone in the audience gets a notification.

import { useState } from "react";
import { Alert, Badge, Button, Card, CardBody, Checkbox, EmptyState, Input, SelectInput, Skeleton, TextArea } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import { ConfirmDialog } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { deleteAnnouncement, listAnnouncements, listBuildingsFloors, postAnnouncement } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { PageHead } from "../rental/shared.jsx";

export default function AnnouncementsPage() {
  const { business } = useBusinessContext();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => listAnnouncements(business.id), [business.id]);
  const places = useAsync(() => listBuildingsFloors(business.id), [business.id]);
  const [form, setForm] = useState(false);
  const [del, setDel] = useState(null);
  const [f, setF] = useState({ title: "", body: "", audience: "all", building: "", floor: "", pinned: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const floors = (places.data?.floors || []).filter((x) => !f.building || x.building_id === f.building);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error: x } = await postAnnouncement(business.id, f);
    setBusy(false);
    if (x) { setErr(x); return; }
    toast.success("Announcement sent");
    setForm(false); setF({ title: "", body: "", audience: "all", building: "", floor: "", pinned: false }); reload();
  }
  async function remove() {
    const { error: x } = await deleteAnnouncement(del.id);
    if (x) toast.error(x); else { toast.success("Announcement deleted"); reload(); }
    setDel(null);
  }
  return (
    <div className="rent">
      <PageHead title="Announcements" lead="Tell residents about water cuts, repairs, rules or events."><Button onClick={() => setForm(true)}>New announcement</Button></PageHead>
      {error && <Alert type="error" message={error} />}
      {loading ? <Skeleton height={96} /> : (data || []).length === 0 ? <Card><EmptyState icon="megaphone" compact title="No announcements yet" /></Card> : (
        <div className="rent-notices">
          {data.map((a) => (
            <Card key={a.id}><CardBody>
              <div className="rent-notice__sum" style={{ justifyContent: "space-between" }}>
                <span><span className="rent-strong">{a.title}</span> {a.pinned && <Badge variant="brand">Pinned</Badge>}</span>
                <Button size="sm" variant="ghost" onClick={() => setDel(a)}>Delete</Button>
              </div>
              <p className="rent-notice__body">{a.body}</p>
              <p className="rent-muted">{formatDate(a.created_at)} · {a.audience === "all" ? "Everyone" : a.audience === "building" ? a.building?.name : `${a.building?.name || ""} ${a.floor?.floor_name || ""}`}</p>
            </CardBody></Card>
          ))}
        </div>
      )}
      {form && (
        <Modal isOpen onClose={() => setForm(false)} title="New announcement" size="md"
          footer={<><Button variant="secondary" onClick={() => setForm(false)}>Cancel</Button><Button type="submit" form="new-ann" loading={busy}>Send</Button></>}>
          <form id="new-ann" className="rent-form" onSubmit={submit} noValidate>
            {err && <Alert type="error" message={err} />}
            <Input label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <TextArea label="Message" rows={4} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
            <SelectInput label="Who should see it?" value={f.audience} onChange={(v) => setF({ ...f, audience: v, floor: "" })}
              options={[{ value: "all", label: "Everyone in the business" }, { value: "building", label: "One building" }, { value: "floor", label: "One floor" }]} />
            {f.audience !== "all" && <SelectInput label="Building" value={f.building} onChange={(v) => setF({ ...f, building: v, floor: "" })} placeholder="Choose a building"
              options={(places.data?.buildings || []).map((b) => ({ value: b.id, label: b.name }))} />}
            {f.audience === "floor" && <SelectInput label="Floor" value={f.floor} onChange={(v) => setF({ ...f, floor: v })} placeholder="Choose a floor"
              options={floors.map((x) => ({ value: x.id, label: x.floor_name || `Floor ${x.floor_number}` }))} />}
            <Checkbox label="Pin to the top" checked={f.pinned} onChange={(v) => setF({ ...f, pinned: typeof v === "boolean" ? v : v?.target?.checked })} />
          </form>
        </Modal>
      )}
      <ConfirmDialog isOpen={!!del} onCancel={() => setDel(null)} onConfirm={remove} title="Delete this announcement?" message="Residents will no longer see it." confirmLabel="Delete" variant="danger" />
    </div>
  );
}
