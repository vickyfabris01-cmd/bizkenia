// src/pages/notifications/NotificationsPage.jsx — NEW FILE
//
// AIM
// /notifications — the notification centre for every signed-in person (visitors, residents, workers, staff,
// the super admin): all alerts with filters (All, Unread, and by topic), mark read, mark all read, delete,
// and the preferences card where a topic can be switched off. Account and security alerts cannot be switched off.

import "../../components/notifications/Notifications.css";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Skeleton, Toggle } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useSession } from "../../store/sessionStore.js";
import { deleteNotification, getPreferences, listNotifications, setPreference } from "../../lib/api/people.js";
import { markAllRead, markNotificationRead } from "../../lib/api/notifications.js";
import { formatDateTime } from "../../lib/format.js";

export const CATEGORIES = [
  { value: "billing", label: "Rent and payments", note: "Invoices, payments received, reminders", types: ["billing", "payment"] },
  { value: "requests", label: "Requests and moves", note: "Rental requests, offers, tenancy and room transfers", types: ["rental_request", "offer", "tenancy", "invite", "transfer"] },
  { value: "complaints", label: "Complaints", note: "New complaints and replies", types: ["complaint"] },
  { value: "notices", label: "Announcements", note: "Notices from your property manager", types: ["announcement"] },
  { value: "messages", label: "Messages", note: "New direct messages", types: ["message"] },
  { value: "work", label: "Work and pay", note: "Worker alerts and salary payments", types: ["worker"] },
  { value: "support", label: "Help desk", note: "Replies to your support tickets", types: ["ticket"] },
];

export default function NotificationsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const [filter, setFilter] = useState("all");
  const { data, error, loading, reload } = useAsync(() => listNotifications({ limit: 200 }), []);
  const prefs = useAsync(() => getPreferences(), []);
  const [off, setOff] = useState({});

  useEffect(() => {
    const o = {};
    (prefs.data || []).forEach((p) => { if (!p.enabled) o[p.category] = true; });
    setOff(o);
  }, [prefs.data]);

  const rows = useMemo(() => {
    const all = data || [];
    if (filter === "all") return all;
    if (filter === "unread") return all.filter((n) => !n.is_read);
    const cat = CATEGORIES.find((c) => c.value === filter);
    return all.filter((n) => cat?.types.includes(n.type));
  }, [data, filter]);
  const unread = (data || []).filter((n) => !n.is_read).length;

  async function open(n) {
    if (!n.is_read) { await markNotificationRead(n.id); reload(); }
    if (n.link) navigate(n.link);
  }
  async function readAll() { await markAllRead(); toast.success("All marked as read."); reload(); }
  async function remove(n) { const { error: e } = await deleteNotification(n.id); if (e) toast.error(e); else reload(); }
  async function toggle(cat, enabled) {
    setOff((s) => ({ ...s, [cat]: !enabled }));
    const { error: e } = await setPreference(user.id, cat, enabled);
    if (e) { toast.error(e); setOff((s) => ({ ...s, [cat]: enabled })); }
  }

  return (
    <div className="pg">
      <h1 className="pg__title">Notifications</h1>
      <div className="nc-page">
        <div className="nc-filters" role="group" aria-label="Filter notifications">
          {[{ value: "all", label: "All" }, { value: "unread", label: `Unread${unread ? ` (${unread})` : ""}` }, ...CATEGORIES].map((f) => (
            <button key={f.value} type="button" className="rent-chip" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>
          ))}
          <Button variant="ghost" size="sm" onClick={readAll} disabled={!unread}>Mark all read</Button>
        </div>
        {error && <Alert type="error" message={error} />}
        {loading ? <div style={{ display: "grid", gap: 8 }}><Skeleton height={64} /><Skeleton height={64} /><Skeleton height={64} /></div> :
          rows.length === 0 ? <Card><EmptyState icon="bell" compact title={filter === "all" ? "Nothing here yet" : "No notifications match"} description="New alerts will appear here as they arrive." /></Card> : (
            <ul className="nc-list">
              {rows.map((n) => (
                <li key={n.id} className={`nc-item${n.is_read ? "" : " is-unread"}`}>
                  <button type="button" className="nc-item__main" onClick={() => open(n)}>
                    <span className="nc-item__title">{n.title}</span>
                    {n.body && <span className="nc-item__body">{n.body}</span>}
                    <span className="nc-item__meta">{formatDateTime(n.created_at)}{n.business?.name ? ` · ${n.business.name}` : ""}</span>
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => remove(n)} aria-label={`Delete ${n.title}`}>Delete</Button>
                </li>
              ))}
            </ul>
          )}
        <Card>
          <CardHeader title="Notification preferences" subtitle="Choose which alerts reach you. Account and security alerts are always on." />
          <CardBody>
            <div className="nc-prefs">
              {CATEGORIES.map((c) => (
                <div className="nc-pref" key={c.value}>
                  <span>{c.label}<small>{c.note}</small></span>
                  <Toggle checked={!off[c.value]} onChange={(v) => toggle(c.value, v)} aria-label={`${c.label} alerts`} />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
