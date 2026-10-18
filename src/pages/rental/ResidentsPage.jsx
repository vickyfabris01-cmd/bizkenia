// src/pages/rental/ResidentsPage.jsx — NEW FILE
//
// AIM
// /app/:slug/residents — everyone currently living in the business, with room, rent and what
// they owe. "Add resident" puts someone who already has an account straight into a room
// (walk-ins). Opening a person shows their contact, their invoices and a button to end the tenancy.

import "./Rental.css";
import { useMemo, useState } from "react";
import { Alert, Button, Card, EmptyState, Icon, Input, SelectInput } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { addResident, listCycles, listRooms, listTenancies } from "../../lib/api/rental.js";
import { formatDate } from "../../lib/format.js";
import EndTenancyModal from "./EndTenancyModal.jsx";
import { BILLING, PageHead, StatusBadge, money, personName, roomLabel, todayISO } from "./shared.jsx";

function AddResidentModal({ businessId, rooms, onClose, onDone }) {
  const toast = useToast();
  const free = rooms.filter((r) => r.status === "available");
  const [f, setF] = useState({ email: "", room_id: "", billing: "monthly", price: "", move_in: todayISO() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const room = free.find((r) => r.id === f.room_id);

  function pickRoom(id) {
    const r = free.find((x) => x.id === id);
    setF((s) => ({ ...s, room_id: id, price: r ? String(s.billing === "semester" && r.semester_price ? r.semester_price : r.monthly_price) : s.price }));
  }
  function pickBilling(v) {
    setF((s) => ({ ...s, billing: v, price: room ? String(v === "semester" && room.semester_price ? room.semester_price : room.monthly_price) : s.price }));
  }
  async function submit(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) { setError("Enter the email address the person signed up with."); return; }
    if (!f.room_id) { setError("Choose a room."); return; }
    if (f.price === "") { setError("Enter the agreed rent."); return; }
    setBusy(true); setError("");
    const { error: err } = await addResident(businessId, f);
    setBusy(false);
    if (err) { setError(err); return; }
    toast.success("Resident added");
    onDone(); onClose();
  }

  return (
    <Modal isOpen onClose={onClose} title="Add a resident" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="add-res" loading={busy}>Add resident</Button></>}>
      <form id="add-res" className="rent-form" onSubmit={submit} noValidate>
        {error && <Alert type="error" message={error} />}
        <Input label="Their account email" type="email" required value={f.email} onChange={(e) => set("email", e.target.value)} helper="They must have signed up already." />
        <SelectInput label="Room" required value={f.room_id} onChange={pickRoom} placeholder={free.length ? "Choose an available room" : "No rooms are available"}
          options={free.map((r) => ({ value: r.id, label: `${r.room_number} · ${r.building?.name || ""} · ${money(r.monthly_price)}` }))} />
        <div className="rent-form__row">
          <SelectInput label="Billing" value={f.billing} onChange={pickBilling} options={BILLING} />
          <Input label="Agreed rent (KSh)" type="number" min="0" inputMode="numeric" value={f.price} onChange={(e) => set("price", e.target.value)} />
        </div>
        <Input label="Move-in date" type="date" value={f.move_in} onChange={(e) => set("move_in", e.target.value)} />
      </form>
    </Modal>
  );
}

function ResidentModal({ t, cycles, onClose, onEnd }) {
  const mine = cycles.filter((c) => c.client_id === t.client_id).slice(0, 12);
  return (
    <Modal isOpen onClose={onClose} title={personName(t.client)} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="danger" onClick={onEnd}>End tenancy</Button></>}>
      <div className="rent-form">
        <dl className="rent-dl">
          <div><dt>Room</dt><dd>{roomLabel(t.room)}</dd></div>
          <div><dt>Rent</dt><dd>{money(t.agreed_price)} ({t.billing_type})</dd></div>
          <div><dt>Phone</dt><dd>{t.client?.phone || "—"}</dd></div>
          <div><dt>Email</dt><dd>{t.client?.email || "—"}</dd></div>
          <div><dt>Moved in</dt><dd>{formatDate(t.move_in_date)}</dd></div>
        </dl>
        <h3 style={{ margin: 0 }}>Invoices</h3>
        <ul className="rent-list">
          {mine.map((c) => (
            <li key={c.id}><span>{c.invoice_number}<small>{formatDate(c.period_start)} – {formatDate(c.period_end)}</small></span>
              <span style={{ textAlign: "right" }}><StatusBadge kind="cycle" status={c.status} /><small className="rent-money">{money(c.balance)} left</small></span></li>
          ))}
          {!mine.length && <li><span className="rent-muted">No invoices yet.</span></li>}
        </ul>
      </div>
    </Modal>
  );
}

export default function ResidentsPage() {
  const { business } = useBusinessContext();
  const bid = business.id;
  const { data, error, loading, reload } = useAsync(async () => {
    const [t, c, r] = await Promise.all([listTenancies(bid), listCycles(bid), listRooms(bid)]);
    return { data: { tenancies: t.data || [], cycles: c.data || [], rooms: r.data || [] }, error: t.error || c.error || r.error };
  }, [bid]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const [ending, setEnding] = useState(null);

  const rows = useMemo(() => {
    const cycles = data?.cycles || [];
    return (data?.tenancies || []).filter((t) => t.status === "active").map((t) => ({
      ...t, balance: cycles.filter((c) => c.tenancy_id === t.id && ["unpaid", "partial", "overdue"].includes(c.status)).reduce((s, c) => s + Number(c.balance || 0), 0),
      overdue: cycles.some((c) => c.tenancy_id === t.id && c.status === "overdue"),
    })).filter((t) => !q || `${personName(t.client)} ${t.client?.phone || ""} ${t.room?.room_number || ""}`.toLowerCase().includes(q.toLowerCase()));
  }, [data, q]);

  const columns = [
    { key: "name", label: "Resident", render: (t) => <span className="rent-strong">{personName(t.client)}</span> },
    { key: "room", label: "Room", render: (t) => roomLabel(t.room) },
    { key: "phone", label: "Phone", render: (t) => t.client?.phone || "—" },
    { key: "rent", label: "Rent", align: "right", render: (t) => <span className="rent-money">{money(t.agreed_price)}</span> },
    { key: "balance", label: "Owes", align: "right", render: (t) => <span className="rent-money">{t.balance > 0 ? money(t.balance) : "Paid up"}</span> },
    { key: "state", label: "", render: (t) => (t.overdue ? <StatusBadge kind="cycle" status="overdue" /> : null) },
  ];

  return (
    <div className="rent">
      <PageHead title="Residents" lead="Everyone living in your properties right now.">
        <Button leftIcon={<Icon name="plus" size={16} />} onClick={() => setAdding(true)}>Add resident</Button>
      </PageHead>
      {error && <Alert type="error" message={error} />}
      <form className="rent-bar" role="search" onSubmit={(e) => e.preventDefault()}>
        <Input label="Search" placeholder="Name, phone or room" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <SimpleTable loading={loading} columns={columns} rows={rows} onRowClick={setOpen}
        empty={<Card><EmptyState icon="users" compact title={q ? "No residents match" : "No residents yet"}
          description={q ? "Try another name or room." : "Residents appear here when a renter accepts your offer, or when you add one."} /></Card>} />
      {adding && <AddResidentModal businessId={bid} rooms={data?.rooms || []} onClose={() => setAdding(false)} onDone={reload} />}
      {open && <ResidentModal t={open} cycles={data?.cycles || []} onClose={() => setOpen(null)} onEnd={() => { setEnding(open); setOpen(null); }} />}
      {ending && <EndTenancyModal tenancy={ending} onClose={() => setEnding(null)} onDone={reload} />}
    </div>
  );
}
