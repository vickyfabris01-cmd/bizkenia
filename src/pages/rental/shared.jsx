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
// The kinds of room, in this order. A hostel can be any of the first four (not a canteen or a kiosk).
export const KINDS = [
  { value: "single", label: "Single room" }, { value: "bedseater", label: "Bed seater" },
  { value: "one_bedroom", label: "One bedroom" }, { value: "two_bedroom", label: "Two bedroom" },
  { value: "canteen", label: "Canteen" }, { value: "kiosk", label: "Kiosk" },
];
export const HOSTEL_KINDS = KINDS.slice(0, 4);
export const kindLabel = (k) => KINDS.find((x) => x.value === k)?.label || (k ? k.charAt(0).toUpperCase() + k.slice(1) : "");
// A hostel room is billed per semester and has no monthly rent (monthly_price is 0); every other room is monthly.
export const isHostelRoom = (r) => !(Number(r?.monthly_price) > 0);
export const rentLabel = (r) => (!r ? "—" : isHostelRoom(r) ? `${money(r.semester_price)} / semester` : `${money(r.monthly_price)} / month`);
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
