// src/pages/notifications/NotificationsPage.jsx — NEW FILE
//
// AIM
// /notifications — the notification centre for every signed-in person (visitors, residents, workers, staff,
// the super admin): all alerts with two dropdown filters (business, when there are two or more, and a sectioned topic list; All is the default), mark read, mark all read, delete,
// and the preferences card where a topic can be switched off. Account and security alerts cannot be switched off.

import "../../components/notifications/Notifications.css";
import { useEffect, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Field, Icon, Skeleton, Toggle } from "../../components/ui";
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

// The topic dropdown is sectioned so it never reads as one long list. Only topics that have notifications are listed.
const FILTER_GROUPS = [
  { label: "Property and rent", values: ["billing", "requests", "complaints", "notices"] },
  { label: "Messages and help", values: ["messages", "support"] },
  { label: "Work", values: ["work"] },
];
const NO_BUSINESS = "none";
const bizKey = (n) => n.tenant_id || n.business?.name || NO_BUSINESS;

// A labelled native dropdown (touch and screen-reader friendly) that, unlike SelectInput, supports option groups.
function FilterSelect({ label, value, onChange, children }) {
  const id = useId();
  return (
    <Field id={id} label={label} className="nc-filter">
      <div className="ui-control-wrap">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="ui-control ui-select ui-control--pad-right">{children}</select>
        <span className="ui-control-wrap__right ui-select__chevron" aria-hidden="true"><Icon name="chevron-down" size={18} /></span>
      </div>
    </Field>
  );
}

export default function NotificationsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const [filter, setFilter] = useState("all");
  const [biz, setBiz] = useState("all");
  const { data, error, loading, reload } = useAsync(() => listNotifications({ limit: 200 }), []);
  const prefs = useAsync(() => getPreferences(), []);
  const [off, setOff] = useState({});

  useEffect(() => {
    const o = {};
    (prefs.data || []).forEach((p) => { if (!p.enabled) o[p.category] = true; });
    setOff(o);
  }, [prefs.data]);

  // Businesses the notifications come from (for owners of two or more, so one business never mixes with another).
  const businesses = useMemo(() => {
    const m = new Map();
    (data || []).forEach((n) => { const k = bizKey(n); if (k !== NO_BUSINESS && !m.has(k)) m.set(k, n.business?.name || "Business"); });
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);
  const showBiz = businesses.length >= 2;
  const hasGeneral = showBiz && (data || []).some((n) => bizKey(n) === NO_BUSINESS);
  const bizValue = showBiz && (biz === "all" || biz === NO_BUSINESS || businesses.some((b) => b.value === biz)) ? biz : "all";

  const scoped = useMemo(() => (data || []).filter((n) => bizValue === "all" || bizKey(n) === bizValue), [data, bizValue]);
  const topicCount = (c) => scoped.filter((n) => c.types.includes(n.type)).length;
  const unread = scoped.filter((n) => !n.is_read).length;
  const rows = useMemo(() => {
    if (filter === "all") return scoped;
    if (filter === "unread") return scoped.filter((n) => !n.is_read);
    const cat = CATEGORIES.find((c) => c.value === filter);
    return scoped.filter((n) => cat?.types.includes(n.type));
  }, [scoped, filter]);
  const unreadRows = rows.filter((n) => !n.is_read);
  const everything = bizValue === "all" && filter === "all";

  async function open(n) {
    if (!n.is_read) { await markNotificationRead(n.id); reload(); }
    if (n.link) navigate(n.link);
  }
  // Everything unfiltered: one call. With a business or topic chosen, only what is on screen is marked read.
  async function readAll() {
    if (everything) await markAllRead(); else await Promise.all(unreadRows.map((n) => markNotificationRead(n.id)));
    toast.success(everything ? "All marked as read." : "Marked as read.");
    reload();
  }
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
        <div className="nc-filters">
          {showBiz && (
            <FilterSelect label="Business" value={bizValue} onChange={setBiz}>
              <option value="all">All my businesses</option>
              {businesses.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              {hasGeneral && <option value={NO_BUSINESS}>General (not tied to a business)</option>}
            </FilterSelect>
          )}
          <FilterSelect label="Show" value={filter} onChange={setFilter}>
            <option value="all">All</option>
            <option value="unread">{`Unread${unread ? ` (${unread})` : ""}`}</option>
            {FILTER_GROUPS.map((g) => {
              const cats = g.values.map((v) => CATEGORIES.find((c) => c.value === v)).filter((c) => c && (topicCount(c) > 0 || c.value === filter));
              return cats.length === 0 ? null : (
                <optgroup key={g.label} label={g.label}>
                  {cats.map((c) => <option key={c.value} value={c.value}>{`${c.label} (${topicCount(c)})`}</option>)}
                </optgroup>
              );
            })}
          </FilterSelect>
          <Button variant="ghost" size="sm" className="nc-filters__read" onClick={readAll} disabled={unreadRows.length === 0}>{everything ? "Mark all read" : "Mark these read"}</Button>
        </div>
        {error && <Alert type="error" message={error} />}
        {loading ? <div style={{ display: "grid", gap: 8 }}><Skeleton height={64} /><Skeleton height={64} /><Skeleton height={64} /></div> :
          rows.length === 0 ? <Card><EmptyState icon="bell" compact title={everything ? "Nothing here yet" : "No notifications match"} description="New alerts will appear here as they arrive." /></Card> : (
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
