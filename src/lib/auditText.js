// src/lib/auditText.js — NEW FILE (Phase 5, step 3)
//
// AIM
// Turns a row of the audit log (action, entity, before, after) into plain English for the Audit log
// screen and its CSV: a short title, one sentence, and a list of what changed. The database stores the
// facts as JSON; nothing in the screen should show raw JSON unless the admin asks for it.
//
//   const { title, summary, changes } = describeAudit(row);
//     title    "Business status changed"
//     summary  "Sunrise Hostel: Pending approval to Active"
//     changes  [{ field: "Status", from: "Pending approval", to: "Active" }]
//
// AUDIT_ACTIONS is the list for the "What happened" filter. Unknown actions (added later by other
// phases) still show: the title is made from the action name.

import { formatKsh } from "./format.js";

const BUSINESS_STATUS = {
  draft: "Draft", pending_payment: "Awaiting payment", pending: "Pending approval",
  active: "Active", rejected: "Needs changes", suspended: "Suspended",
};
const PAYMENT_STATUS = { pending: "Pending", success: "Successful", failed: "Failed", cancelled: "Cancelled", timeout: "Timed out" };
const PURPOSE = { subscription: "subscription", rent: "rent", order: "shop order" };
const SETTING_LABEL = {
  brand: "Brand", modules: "Business types", approval: "Approval mode", mpesa: "M-Pesa settings",
  maintenance: "Maintenance mode", finance: "Finance settings", hero: "Home page photos", hero_images: "Home page photos",
};
const FIELD_LABEL = {
  name: "Name", tagline: "Tagline", support_email: "Support email", website: "Website", price_kes: "Price", period_days: "Period (days)",
  is_active: "Switched on", business_type: "Business type", amount_kes: "Amount", commission_percent: "Commission (%)",
  enabled: "Enabled", message: "Message", mode: "Mode", env: "Mode", shortcode: "Shortcode", receipt: "M-Pesa receipt",
  reason: "Reason", status: "Status", role: "Role", rental: "Rental", agriculture: "Agriculture", shop: "Shop",
};

export const AUDIT_ACTIONS = [
  { value: "", label: "Everything" },
  { value: "business.status", label: "Business approvals and suspensions" },
  { value: "setting.update", label: "Platform settings" },
  { value: "plan.create", label: "Price plans added" },
  { value: "plan.update", label: "Price plans changed" },
  { value: "payment.recorded", label: "Payments recorded by hand" },
  { value: "payment.status", label: "Payment status changes" },
  { value: "user.active", label: "Accounts switched on or off" },
  { value: "user.role", label: "Account role changes" },
];

const TITLES = {
  "business.status": "Business status changed",
  "setting.update": "Setting changed",
  "plan.create": "Price plan added",
  "plan.update": "Price plan changed",
  "payment.recorded": "Payment recorded by hand",
  "payment.status": "Payment status changed",
  "user.active": "Account switched on or off",
  "user.role": "Account role changed",
};

const pretty = (s) => { const t = String(s || "").replace(/[._]/g, " ").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ""; };
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
export const fieldLabel = (k) => FIELD_LABEL[k] || pretty(k);

/** `entity` decides which words a status uses: a payment is "Pending", a business is "Pending approval". */
export function formatValue(field, v, entity) {
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" && /price|amount/.test(field)) return formatKsh(v);
  if (field === "status") {
    const map = entity === "payment" ? PAYMENT_STATUS : BUSINESS_STATUS;
    if (map[v]) return map[v];
  }
  if (isObj(v) || Array.isArray(v)) return JSON.stringify(v);
  return String(v);
}

/** [{ field, from, to }] for every key that differs between before and after (ids and timestamps left out). */
export function auditChanges(row) {
  const before = isObj(row.before) ? row.before : null;
  const after = isObj(row.after) ? row.after : null;
  if (!before && !after) return [];
  const skip = new Set(["id", "business_id", "created_at", "updated_at", "code", "sort"]);
  let keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter((k) => !skip.has(k));
  // When the record kept only what changed (payment status, account), `after` also carries context
  // (amount, receipt ...). Show only the fields that exist on both sides.
  if (row.action === "payment.status" || row.action === "user.active" || row.action === "user.role") keys = keys.filter((k) => before && k in before);
  return keys
    .filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]))
    .map((k) => ({ field: fieldLabel(k), from: before ? formatValue(k, before[k], row.entity) : "", to: after ? formatValue(k, after[k], row.entity) : "" }));
}

export function describeAudit(row) {
  const a = row.action;
  const who = row.entity_label || row.entity_id || "";
  const b = isObj(row.before) ? row.before : {};
  const x = isObj(row.after) ? row.after : {};
  const changes = auditChanges(row);
  const title = TITLES[a] || pretty(a) || "Change";
  let summary;

  if (a === "business.status") {
    summary = `${who || "A business"}: ${formatValue("status", b.status)} to ${formatValue("status", x.status)}${x.reason ? ` (${x.reason})` : ""}`;
  } else if (a === "setting.update") {
    const first = changes[0];
    const label = SETTING_LABEL[row.entity_id] || pretty(row.entity_id);
    summary = first ? `${label}: ${first.field} ${first.from} to ${first.to}${changes.length > 1 ? ` (and ${changes.length - 1} more)` : ""}` : `${label} saved`;
  } else if (a === "plan.create") {
    summary = `Added “${x.name || who}” at ${formatValue("price_kes", x.price_kes)}`;
  } else if (a === "plan.update") {
    const first = changes[0];
    summary = `“${who}”${first ? `: ${first.field} ${first.from} to ${first.to}${changes.length > 1 ? ` (and ${changes.length - 1} more)` : ""}` : " changed"}`;
  } else if (a === "payment.recorded") {
    summary = `${formatValue("amount_kes", x.amount_kes)} ${PURPOSE[x.purpose] || "payment"}${who ? ` for ${who}` : ""}${x.receipt ? `, receipt ${x.receipt}` : ""}`;
  } else if (a === "payment.status") {
    summary = `${formatValue("amount_kes", x.amount_kes)} ${PURPOSE[x.purpose] || "payment"}${who ? ` for ${who}` : ""}: ${formatValue("status", b.status, "payment")} to ${formatValue("status", x.status, "payment")}`;
  } else if (a === "user.active") {
    summary = `${who || "An account"} was switched ${x.is_active ? "on" : "off"}`;
  } else if (a === "user.role") {
    summary = `${who || "An account"}: role ${formatValue("role", b.role)} to ${formatValue("role", x.role)}`;
  } else {
    summary = who ? `${pretty(row.entity)}: ${who}` : pretty(row.entity);
  }
  return { title, summary, changes };
}
