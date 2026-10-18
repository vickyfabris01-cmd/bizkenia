// src/pages/rental/shared.jsx — NEW FILE
//
// AIM
// Small pieces every Phase 2 screen uses: the page heading, tabs, status badges with their
// plain-English labels, stat tiles, and a "copy to clipboard" helper. Keeping them here means a
// status reads the same on every screen.

import "./Rental.css";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui";
import { formatKsh } from "../../lib/format.js";

export const money = formatKsh;

const MAPS = {
  room: { available: ["success", "Available"], occupied: ["brand", "Occupied"], reserved: ["warning", "Reserved"], maintenance: ["neutral", "Maintenance"] },
  request: { pending: ["warning", "New"], offered: ["info", "Offer sent"], accepted: ["success", "Accepted"], rejected: ["error", "Declined"], expired: ["neutral", "Offer expired"], cancelled: ["neutral", "Cancelled"] },
  cycle: { unpaid: ["warning", "Unpaid"], partial: ["info", "Part paid"], paid: ["success", "Paid"], overdue: ["error", "Overdue"], waived: ["neutral", "Waived"], cancelled: ["neutral", "Cancelled"] },
  payment: { confirmed: ["success", "Confirmed"], pending: ["warning", "Pending"], failed: ["error", "Failed"], reversed: ["neutral", "Reversed"] },
  tenancy: { active: ["success", "Living here"], completed: ["neutral", "Moved out"], terminated: ["error", "Ended early"], pending: ["warning", "Pending"] },
};
export const METHOD = { mpesa: "M-Pesa", cash: "Cash", bank_transfer: "Bank transfer", other: "Other" };
export const ROOM_TYPES = ["bedsitter", "single", "double", "studio", "suite", "dormitory"].map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
export const BILLING = [{ value: "monthly", label: "Monthly" }, { value: "semester", label: "Per semester (6 months)" }];

export function StatusBadge({ kind, status }) {
  const [variant, text] = MAPS[kind]?.[status] || ["neutral", status];
  return <Badge variant={variant}>{text}</Badge>;
}

export function PageHead({ title, lead, children }) {
  return (
    <div className="rent-head">
      <div>
        <h2 className="rent-head__title">{title}</h2>
        {lead && <p className="rent-head__lead">{lead}</p>}
      </div>
      {children && <div className="rent-actions">{children}</div>}
    </div>
  );
}

export function Tabs({ value, onChange, tabs, label }) {
  return (
    <div className="rent-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" className="rent-tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}{t.count != null && <span className="rent-tab__n">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, note, to, tone }) {
  const body = (
    <>
      <span className="rent-stat__label">{label}</span>
      <span className="rent-stat__value">{value}</span>
      {note && <span className="rent-stat__note">{note}</span>}
    </>
  );
  const cls = `rent-stat${tone ? ` rent-stat--${tone}` : ""}`;
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export const personName = (p) => p?.full_name || p?.email || "Unknown";
export const roomLabel = (r) => (r ? `${r.room_number}${r.building?.name ? ` · ${r.building.name}` : ""}` : "—");
export const todayISO = () => new Date().toISOString().slice(0, 10);
