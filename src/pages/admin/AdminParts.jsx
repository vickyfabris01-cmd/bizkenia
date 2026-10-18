// src/pages/admin/AdminParts.jsx — NEW FILE (Phase 5, step 3)
//
// AIM
// Small pieces the platform finance screens share: a stat tile, the "Showing 1 to 25 of 140" pager,
// the badges for transaction type and status, and the money and date helpers. Kept in one file so
// Transactions, Revenue, Reports and Audit look and read the same.

import "./Admin.css";
import "./AdminFinance.css";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Skeleton } from "../../components/ui";
import { KIND_LABEL, STATUS_LABEL } from "../../lib/api/platformFinance.js";

export const sum = (rows, key) => (rows || []).reduce((a, r) => a + Number(r[key] || 0), 0);
export const shortMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-KE", { month: "short" });
export const longMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-KE", { month: "short", year: "numeric" });
export const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

/** A number tile. tone: "good" | "warn" | "bad". `to` makes it a link. */
export function Stat({ label, value, note, loading, tone, to }) {
  const body = (
    <Card className={`adm-stat${tone ? ` fin-stat--${tone}` : ""}`}>
      <span className="adm-stat__label">{label}</span>
      {loading ? <Skeleton width={80} height={28} /> : <span className="adm-stat__value">{value}</span>}
      {note && !loading && <span className="fin-stat__note">{note}</span>}
    </Card>
  );
  return to ? <Link to={to} className="adm-stat__link">{body}</Link> : body;
}

/** Previous / Next with a "Showing 26 to 50 of 140" line. */
export function Pager({ page, size, total, onPage }) {
  if (!total) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const last = Math.ceil(total / size);
  return (
    <nav className="fin-pager" aria-label="Pages">
      <span className="fin-pager__info">Showing {from} to {to} of {total.toLocaleString("en-KE")}</span>
      <span className="fin-pager__btns">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button size="sm" variant="outline" disabled={page >= last} onClick={() => onPage(page + 1)}>Next</Button>
      </span>
    </nav>
  );
}

const KIND_VARIANT = { subscription: "brand", rent: "info", order: "neutral" };
const STATUS_VARIANT = { success: "success", pending: "warning", failed: "error", reversed: "neutral" };

export const KindBadge = ({ kind }) => <Badge variant={KIND_VARIANT[kind] || "neutral"}>{KIND_LABEL[kind] || kind}</Badge>;
export const TxStatusBadge = ({ status }) => <Badge variant={STATUS_VARIANT[status] || "neutral"}>{STATUS_LABEL[status] || status}</Badge>;

/** Today minus n days as YYYY-MM-DD (for default date ranges). */
export const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** "17 Oct 2026, 09:30" — dates read d MMM yyyy everywhere in the product. */
export function formatWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  return `${d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "2026-10-17 09:30" in UTC, for CSV files (sorts and opens cleanly in a spreadsheet). */
export const csvWhen = (value) => (value ? new Date(value).toISOString().replace("T", " ").slice(0, 16) : "");
