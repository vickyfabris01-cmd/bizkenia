// src/pages/people/WorkerHome.jsx — NEW FILE
//
// AIM
// /app/:slug (worker) — "My work": a big Check in / Check out button for today, this month's attendance as a
// calendar, and the notices shortcut.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, Skeleton } from "../../components/ui";
import MonthGrid from "../../components/data/MonthGrid.jsx";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { checkIn, checkOut, myAttendance, myWorker } from "../../lib/api/people.js";
import { PageHead, todayISO } from "../rental/shared.jsx";

const time = (t) => (t ? new Date(t).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" }) : "—");

export default function WorkerHome() {
  const { business } = useBusinessContext();
  const toast = useToast();
  const [worker, setWorker] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const w = await myWorker(business.id);
    if (w.error) setError(w.error);
    setWorker(w.data);
    if (w.data) {
      const first = new Date(); first.setDate(1);
      const a = await myAttendance(w.data.id, first.toISOString().slice(0, 10));
      setRows(a.data || []);
    }
    setLoading(false);
  }, [business.id]);
  useEffect(() => { load(); }, [load]);

  const today = rows.find((r) => r.date === todayISO());
  async function act(fn, ok) {
    setBusy(true); setError("");
    const { error: e } = await fn(business.id);
    setBusy(false);
    if (e) { setError(e); return; }
    toast.success(ok); load();
  }
  if (loading) return <div className="rent"><Skeleton height={32} width={200} /><Skeleton height={140} /></div>;
  return (
    <div className="rent">
      <PageHead title="My work" lead={worker ? `${worker.role} at ${business.name}` : business.name} />
      {error && <Alert type="error" message={error} />}
      {!worker ? <Alert type="info" message="Your worker record is not active. Ask the manager." /> : (
        <>
          <Card><CardHeader title="Today" /><CardBody>
            <div className="rent-checkin">
              <p style={{ margin: 0 }}>Checked in: <strong>{time(today?.check_in)}</strong> · Checked out: <strong>{time(today?.check_out)}</strong></p>
              {!today?.check_in ? <Button size="lg" loading={busy} onClick={() => act(checkIn, "Checked in")}>Check in</Button>
                : !today.check_out ? <Button size="lg" variant="outline" loading={busy} onClick={() => act(checkOut, "Checked out")}>Check out</Button>
                  : <p className="rent-muted">You are done for today. Thank you.</p>}
            </div>
          </CardBody></Card>
          <Card><CardHeader title="This month" /><CardBody><MonthGrid marks={Object.fromEntries(rows.map((r) => [r.date, r.status]))} /></CardBody></Card>
          <div className="rent-actions">
            <Button as={Link} to={`/app/${business.slug}/my-pay`} variant="outline">My pay</Button>
            <Button as={Link} to={`/app/${business.slug}/notices`} variant="outline">Notices</Button>
            <Button as={Link} to={`/app/${business.slug}/messages`} variant="outline">Message the manager</Button>
          </div>
        </>
      )}
    </div>
  );
}
